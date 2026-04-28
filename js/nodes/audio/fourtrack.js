import {registerNode} from '../../registry.js'
import {audioRuntime} from '../../audioRuntime.js'
import {getAudioContext} from '../../audioContext.js'
import {autowire, StringToFragment} from '../../utils.js'

function getTimestampFilename(prefix, ext){
    const d = new Date()
    const pad = (n) => n.toString().padStart(2, '0')
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
    return `${prefix}_${date}_${time}.${ext}`
}

/**
 * Encode interleaved stereo Float32 PCM as a 16-bit little-endian WAV blob.
 */
function encodeWAV(ch0, ch1, sampleRate){
    const numSamples = ch0.length
    const channels = 2
    const bytesPerSample = 2
    const blockAlign = channels * bytesPerSample
    const dataSize = numSamples * blockAlign
    const buf = new ArrayBuffer(44 + dataSize)
    const view = new DataView(buf)
    const write = (o, s) => { for(let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
    const pcm = (f) => {
        const s = Math.max(-1, Math.min(1, f))
        return s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE')
    write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
    view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true)
    view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, dataSize, true)
    let offset = 44
    for(let i = 0; i < numSamples; i++){
        view.setInt16(offset, pcm(ch0[i]), true); offset += 2
        view.setInt16(offset, pcm(ch1[i]), true); offset += 2
    }
    return new Blob([buf], {type: 'audio/wav'})
}

function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * TDK1 — Four-Track Tape format. Lossless 32-bit float, 4 mono buffers
 * + a JSON metadata sidecar (mixer state). Layout:
 *
 *   off  size            field
 *     0    4   ascii      magic "TDK1"
 *     4    4   float32    sampleRate
 *     8    4   uint32     numTracks   (always 4)
 *    12    4   uint32     samplesPerTrack
 *    16    4   uint32     metaJsonLen
 *    20    N   utf-8      metaJson
 *  (audio offset = round_up_4(20 + metaJsonLen) — 4-byte alignment so
 *   the Float32Array views land cleanly)
 *  audioOff   numTracks * samplesPerTrack * 4   Float32 LE per track
 */
function encodeTDK(sampleRate, tracks, meta){
    const numTracks = tracks.length
    const samplesPerTrack = tracks[0].length
    const metaBytes = new TextEncoder().encode(JSON.stringify(meta))
    const audioOff = Math.ceil((20 + metaBytes.length) / 4) * 4
    const totalBytes = audioOff + numTracks * samplesPerTrack * 4

    const buf = new ArrayBuffer(totalBytes)
    const view = new DataView(buf)
    const u8 = new Uint8Array(buf)

    u8[0] = 0x54; u8[1] = 0x44; u8[2] = 0x4B; u8[3] = 0x31  // "TDK1"
    view.setFloat32(4, sampleRate, true)
    view.setUint32(8, numTracks, true)
    view.setUint32(12, samplesPerTrack, true)
    view.setUint32(16, metaBytes.length, true)
    u8.set(metaBytes, 20)

    for(let i = 0; i < numTracks; i++){
        const f32 = new Float32Array(buf, audioOff + i * samplesPerTrack * 4, samplesPerTrack)
        f32.set(tracks[i])
    }
    return new Blob([buf], {type: 'application/octet-stream'})
}

/**
 * Bucket a Float32 buffer into `bins` peak values (max(|sample|) per
 * bucket). Used to precompute the timeline strip after loading or
 * resizing a tape, so the user sees the full waveform immediately
 * instead of waiting for playback to fill the bins.
 */
function bucketPeaks(buf, bins){
    const out = new Float32Array(bins)
    if(!buf || buf.length === 0) return out
    const stride = buf.length / bins
    for(let i = 0; i < bins; i++){
        const start = (i * stride) | 0
        const end = Math.min(buf.length, ((i + 1) * stride) | 0)
        let mx = 0
        for(let j = start; j < end; j++){
            const a = buf[j] < 0 ? -buf[j] : buf[j]
            if(a > mx) mx = a
        }
        out[i] = mx
    }
    return out
}

function decodeTDK(arrayBuffer){
    const view = new DataView(arrayBuffer)
    const u8 = new Uint8Array(arrayBuffer)
    if(u8[0] !== 0x54 || u8[1] !== 0x44 || u8[2] !== 0x4B || u8[3] !== 0x31){
        throw new Error('Not a TDK file (bad magic)')
    }
    const sampleRate = view.getFloat32(4, true)
    const numTracks = view.getUint32(8, true)
    const samplesPerTrack = view.getUint32(12, true)
    const metaJsonLen = view.getUint32(16, true)
    let meta = {}
    try {
        meta = JSON.parse(new TextDecoder().decode(u8.slice(20, 20 + metaJsonLen)))
    } catch(_){ /* tolerate empty/missing meta — buffers still load */ }

    const audioOff = Math.ceil((20 + metaJsonLen) / 4) * 4
    const expected = audioOff + numTracks * samplesPerTrack * 4
    if(arrayBuffer.byteLength < expected){
        throw new Error(
            `TDK file truncated: header claims ${expected} bytes, file has ${arrayBuffer.byteLength}.`
        )
    }
    const tracks = []
    for(let i = 0; i < numTracks; i++){
        // Copy out so the underlying ArrayBuffer can be GC'd and the
        // typed arrays we hand to the worklet are independently transferable.
        const view32 = new Float32Array(arrayBuffer, audioOff + i * samplesPerTrack * 4, samplesPerTrack)
        tracks.push(new Float32Array(view32))
    }
    return {sampleRate, numTracks, samplesPerTrack, meta, tracks}
}

/**
 * Four-Track Cassette Recorder — Tascam Portastudio-inspired multi-track sink.
 *
 * Records up to four mono tracks into per-track Float32Array buffers driven
 * by a single shared playhead. Each track has gain, low/high shelf EQ, and
 * a reverb send; the master section bus-mixes the tracks, applies a
 * Schroeder reverb return, soft-clips through tape-style saturation, and
 * exits as the sink output.
 *
 * Sink-only contract: this node has no `audio` input — it has track1..track4.
 * audioCompiler.compileGraph allows multi-input sinks to compile when ANY
 * input is connected, with `genSinkAudio` reading from state instead of
 * `ctx.upstream`. The `out` output is feedback-typed for chained patches.
 *
 * Punch in/out:
 *   Each track has a per-track 20 ms linear envelope that ramps when
 *   (armed && playing) toggles. The mode flag (overdub | replace) selects
 *   how the input is written into the buffer:
 *     overdub: buf[i] = buf[i] + input * env       (sum-on-top — float-safe)
 *     replace: buf[i] = buf[i] * (1 - env) + input * env  (true crossfade)
 *   Reading the buffer AFTER the write means the monitor output naturally
 *   tracks whichever mode is active without any extra branches.
 *
 * Transport state (isPlaying, playhead, recArmed[0..3]) lives in worklet
 * state; UI mutations send {type: 'updateState', nid, updates} so the
 * transport doesn't trigger a full graph recompile.
 */

const NUM_TRACKS = 4
const PEAK_BINS = 256
const PUNCH_FADE_MS = 20
const TRACK_COLORS = [
    'hsl(0, 70%, 55%)',
    'hsl(180, 60%, 50%)',
    'hsl(50, 80%, 55%)',
    'hsl(140, 50%, 55%)'
]

registerNode({
    slug: 'fourtrack',
    icon: '📼',
    label: 'Four-Track',
    tooltip: 'Four-track cassette recorder. Mono per-track buffers, shared transport, channel strips with EQ + reverb send, tape saturation on master.',

    input: {
        track1: {label: 'Track 1', type: 'audio', control: null},
        track2: {label: 'Track 2', type: 'audio', control: null},
        track3: {label: 'Track 3', type: 'audio', control: null},
        track4: {label: 'Track 4', type: 'audio', control: null}
    },

    output: {
        out: {
            label: 'Master (mono sum)',
            type: 'audio',
            feedback: true,
            // Returns the previous sample's stereo mix downmixed to mono
            // (captured in genAudioTail below). Same pattern as synthout:
            // feedback edges carry one-sample-delayed final output, so
            // wiring `out` back into trackN closes the cycle cleanly.
            genAudio(ctx){ return ctx.state('prev') }
        }
    },

    options: {
        cassetteLength: {
            label: 'Cassette Length',
            type: 'select',
            default: '1',
            choices: [
                {value: '1',  name: '1 min'},
                {value: '2',  name: '2 min'},
                {value: '3',  name: '3 min'},
                {value: '4',  name: '4 min'},
                {value: '5',  name: '5 min'},
                {value: '6',  name: '6 min'},
                {value: '7',  name: '7 min'},
                {value: '8',  name: '8 min'},
                {value: '9',  name: '9 min'},
                {value: '10', name: '10 min'}
            ]
        }
    },

    values: {
        tracks: [
            {gain: 0.8, pan: -0.6, recArmed: false, mute: false, solo: false, eqLow: 0, eqHigh: 0, reverbSend: 0, mode: 'overdub'},
            {gain: 0.8, pan: -0.2, recArmed: false, mute: false, solo: false, eqLow: 0, eqHigh: 0, reverbSend: 0, mode: 'overdub'},
            {gain: 0.8, pan:  0.2, recArmed: false, mute: false, solo: false, eqLow: 0, eqHigh: 0, reverbSend: 0, mode: 'overdub'},
            {gain: 0.8, pan:  0.6, recArmed: false, mute: false, solo: false, eqLow: 0, eqHigh: 0, reverbSend: 0, mode: 'overdub'}
        ],
        masterGain: 0.8,
        saturation: 0.3,
        reverbMix: 0.2,
        transportPlaying: false,
        playheadSeconds: 0
    },

    audioState: {
        // Mono Float32Arrays — allocated by audioStateAllocator.
        track1: null,
        track2: null,
        track3: null,
        track4: null,

        // Shared transport
        playhead: 0,
        isPlaying: 0,

        // Per-track record-arm flags (1 = armed)
        recArmed0: 0,
        recArmed1: 0,
        recArmed2: 0,
        recArmed3: 0,

        // Per-track punch envelope (0..1, ramps over PUNCH_FADE_MS)
        recEnv0: 0,
        recEnv1: 0,
        recEnv2: 0,
        recEnv3: 0,

        // Master mix bus. masterL / masterR are the pan-applied stereo
        // pair fed to the speakers and the WAV bounce. `prev` is the
        // mono downmix of the previous sample's _y (set in genAudioTail),
        // exposed via the feedback `out` jack for chaining patches.
        masterL: 0,
        masterR: 0,
        prev:    0,

        // Schroeder reverb tanks (mono)
        reverbComb1: {type: 'ring', samples: 1557},
        reverbComb2: {type: 'ring', samples: 1617},
        reverbComb3: {type: 'ring', samples: 1491},
        reverbComb4: {type: 'ring', samples: 1422},
        reverbAllpass1: {type: 'ring', samples: 225},
        reverbAllpass2: {type: 'ring', samples: 556},

        // Per-track 1-pole EQ memory.
        eqLowState:  null,
        eqHighState: null,

        // Per-track peak accumulator (one float per timeline bin) for
        // the unified waveform strip. Allocated by audioStateAllocator.
        peaks0: null,
        peaks1: null,
        peaks2: null,
        peaks3: null,
        peakBin: -1
    },

    audioStateAllocator(sampleRate){
        // Always allocate fresh. Worklet's mergeState keeps the prior
        // reference when (k in prev), so subsequent allocations are GC'd
        // immediately on the worklet side after the first compile —
        // shipping them every time keeps us correct on engine recreation.
        const seconds = this._tapeLengthSec()
        const samplesPerTrack = Math.floor(seconds * sampleRate)
        return {
            track1: new Float32Array(samplesPerTrack),
            track2: new Float32Array(samplesPerTrack),
            track3: new Float32Array(samplesPerTrack),
            track4: new Float32Array(samplesPerTrack),
            eqLowState:  new Float32Array(NUM_TRACKS),
            eqHighState: new Float32Array(NUM_TRACKS),
            peaks0: new Float32Array(PEAK_BINS),
            peaks1: new Float32Array(PEAK_BINS),
            peaks2: new Float32Array(PEAK_BINS),
            peaks3: new Float32Array(PEAK_BINS)
        }
    },

    elements: {
        playBtn: null,
        stopBtn: null,
        bounceBtn: null,
        saveBtn: null,
        loadBtn: null,
        timeDisplay: null,
        timelineCanvas: null,
        recArmBtns: [],
        muteBtns: [],
        soloBtns: [],
        modeBtns: [],
        gainKnobs: [],
        panKnobs: [],
        eqLowKnobs: [],
        eqHighKnobs: [],
        reverbKnobs: [],
        masterGainSlider: null,
        saturationKnob: null,
        reverbMixKnob: null
    },

    runtimeState: {
        uiUpdateInterval: null,
        workletNode: null,
        lastTickTime: 0,
        peaks: [null, null, null, null],
        peaksInterval: null,
        rafId: null,
        // Bounce state — set during a Bounce-to-WAV pass.
        bouncing: false,
        bounceChunks: null,
        bounceSampleRate: null,
        bounceTimer: null,
        // One-shot callback waiting for a track-buffer snapshot. Used
        // by Save Tape and Resize Tape (both need the current buffers
        // back from the worklet); dispatched by the shared onmessage
        // handler, which also receives the periodic peaks snapshots.
        pendingTapeBuffers: null,
        // Cached so onOptionChange can compare new vs old length and
        // confirm before any shrink that would truncate audio.
        lastTapeLengthSec: 0
    },

    /** Single source of truth for the current tape length in seconds.
     *  Length lives in the cassetteLength option as minutes (1..10).
     *  Patches saved before this option existed stored seconds (15..600);
     *  values >10 are interpreted as raw seconds for back-compat. */
    _tapeLengthSec(){
        const v = parseInt(this.optionValues?.cassetteLength, 10)
        if(!Number.isFinite(v) || v < 1) return 60
        return v > 10 ? v : v * 60
    },

    genAudioSetup(ctx){
        const seconds = this._tapeLengthSec()
        // Buffer length is fixed at first allocation; clamp the wrap
        // point against the actual buffer so a later option change can't
        // read past the end.
        const maxSamples =
            `Math.min(Math.floor(${seconds} * sampleRate), s.${ctx.nid}.track1.length)`

        const isPlaying = ctx.state('isPlaying')
        const playhead = ctx.state('playhead')

        // EQ filter coefficients — emitted once outside the per-track loop.
        ctx.line(`const _eqLowG  = 1 - Math.exp(-TAU * 100  / sampleRate);`)
        ctx.line(`const _eqHighG = 1 - Math.exp(-TAU * 8000 / sampleRate);`)
        // 20 ms linear punch ramp, in normalized step per sample.
        ctx.line(`const _punchStep = 1 / Math.max(1, ${PUNCH_FADE_MS} * 0.001 * sampleRate);`)

        // Transport: advance + wrap the shared playhead each sample.
        ctx.line(`if(${isPlaying} > 0.5){ ${playhead} = (${playhead} + 1) % (${maxSamples}); }`)

        const tracks = this.values.tracks
        const trackBufs = ['track1', 'track2', 'track3', 'track4']
        const eqLow  = ctx.state('eqLowState')
        const eqHigh = ctx.state('eqHighState')

        // Smoothed param refs for the per-track strip knobs. Knob drags
        // post `param` messages straight to the engine — no recompile,
        // no crossfade, no zipper noise.
        const trackParams = tracks.map((t, i) => ({
            gain:   ctx.smoothParam(`gain${i}`,   t.gain),
            eqLow:  ctx.smoothParam(`eqLow${i}`,  t.eqLow),
            eqHigh: ctx.smoothParam(`eqHigh${i}`, t.eqHigh),
            rev:    ctx.smoothParam(`rev${i}`,    t.reverbSend)
        }))

        for(let i = 0; i < NUM_TRACKS; i++){
            const t = tracks[i]
            const buf = `s.${ctx.nid}.${trackBufs[i]}`
            const armed = ctx.state(`recArmed${i}`)
            const env = ctx.state(`recEnv${i}`)
            const input = ctx.in(`track${i + 1}`)
            const tp = trackParams[i]

            // Mode-specific buffer write. Reading the buffer AFTER the
            // write means the monitor (_t<i>) reflects whichever mode
            // we're in without an extra branch.
            const writeExpr = t.mode === 'replace'
                ? `${buf}[_idx${i}] * (1 - ${env}) + ${input} * ${env}`
                : `${buf}[_idx${i}] + ${input} * ${env}`

            ctx.line(`
                const _idx${i} = ${playhead};
                let _t${i};
                if(${isPlaying} > 0.5){
                    // Ramp envelope toward armed target (clamped step).
                    {
                        const _tgt = ${armed} > 0.5 ? 1 : 0;
                        const _d = _tgt - ${env};
                        ${env} += _d > _punchStep ? _punchStep : (_d < -_punchStep ? -_punchStep : _d);
                    }
                    if(${env} > 0.0001){
                        ${buf}[_idx${i}] = ${writeExpr};
                    }
                    _t${i} = ${buf}[_idx${i}];
                } else {
                    // Stopped: pass input through for monitoring.
                    _t${i} = ${input};
                }
                ${eqLow}[${i}]  += (_t${i} - ${eqLow}[${i}])  * _eqLowG;
                _t${i} += ${eqLow}[${i}] * ${tp.eqLow};
                ${eqHigh}[${i}] += (_t${i} - ${eqHigh}[${i}]) * _eqHighG;
                _t${i} += (_t${i} - ${eqHigh}[${i}]) * ${tp.eqHigh};
                _t${i} *= ${tp.gain};
            `)
        }

        // Peak accumulator for the timeline strip — only updates while
        // the transport is rolling so a stopped playhead doesn't pile
        // every monitor sample into one bin.
        const peakBin = ctx.state('peakBin')
        ctx.line(`
            if(${isPlaying} > 0.5){
                const _bin = ((${playhead}) * ${PEAK_BINS} / (${maxSamples})) | 0;
                const _binChanged = _bin !== ${peakBin};
                if(_binChanged) ${peakBin} = _bin;
                const _a0 = _t0 < 0 ? -_t0 : _t0;
                const _a1 = _t1 < 0 ? -_t1 : _t1;
                const _a2 = _t2 < 0 ? -_t2 : _t2;
                const _a3 = _t3 < 0 ? -_t3 : _t3;
                const _p0 = s.${ctx.nid}.peaks0, _p1 = s.${ctx.nid}.peaks1,
                      _p2 = s.${ctx.nid}.peaks2, _p3 = s.${ctx.nid}.peaks3;
                if(_binChanged){
                    _p0[_bin] = _a0; _p1[_bin] = _a1;
                    _p2[_bin] = _a2; _p3[_bin] = _a3;
                } else {
                    if(_a0 > _p0[_bin]) _p0[_bin] = _a0;
                    if(_a1 > _p1[_bin]) _p1[_bin] = _a1;
                    if(_a2 > _p2[_bin]) _p2[_bin] = _a2;
                    if(_a3 > _p3[_bin]) _p3[_bin] = _a3;
                }
            }
        `)

        // Mix bus (respecting solo/mute), reverb send. Stereo per-track
        // pan applied here via equal-power: panL = cos((p+1)·π/4),
        // panR = sin((p+1)·π/4) where p∈[-1,1]. panL/panR are smoothed
        // separately — the UI knob handler computes both halves and
        // ships them as two `param` messages on each input event, so
        // sliding pan stays equal-power within smoothing accuracy.
        // `out`'s mono feedback reads the speakers' (L+R)/2 from
        // state.prev (captured in genAudioTail).
        const anySolo = tracks.some(t => t.solo)
        ctx.line(`let _mixL = 0, _mixR = 0, _revIn = 0;`)
        for(let i = 0; i < NUM_TRACKS; i++){
            const t = tracks[i]
            const audible = anySolo ? t.solo : !t.mute
            if(!audible) continue
            const panL = Math.cos((t.pan + 1) * Math.PI / 4)
            const panR = Math.sin((t.pan + 1) * Math.PI / 4)
            const panLP = ctx.smoothParam(`panL${i}`, panL)
            const panRP = ctx.smoothParam(`panR${i}`, panR)
            ctx.line(`_mixL += _t${i} * ${panLP};`)
            ctx.line(`_mixR += _t${i} * ${panRP};`)
            // Always emit the reverb-send line — its amount is a smoothed
            // param, so a smooth fade from/to 0 doesn't need a recompile.
            ctx.line(`_revIn += _t${i} * ${trackParams[i].rev};`)
        }

        // Schroeder reverb (4 parallel combs into 2 series allpasses), mono.
        const c1 = ctx.ring('reverbComb1')
        const c2 = ctx.ring('reverbComb2')
        const c3 = ctx.ring('reverbComb3')
        const c4 = ctx.ring('reverbComb4')
        const a1 = ctx.ring('reverbAllpass1')
        const a2 = ctx.ring('reverbAllpass2')
        ctx.line(`
            const _combG = 0.7;
            const _apG = 0.5;
            const _c1 = ${c1.read(0)}; ${c1.push('_revIn + _c1 * _combG')}
            const _c2 = ${c2.read(0)}; ${c2.push('_revIn + _c2 * _combG')}
            const _c3 = ${c3.read(0)}; ${c3.push('_revIn + _c3 * _combG')}
            const _c4 = ${c4.read(0)}; ${c4.push('_revIn + _c4 * _combG')}
            let _rev = (_c1 + _c2 + _c3 + _c4) * 0.25;
            const _ap1In = _rev;
            const _ap1Out = ${a1.read(0)};
            ${a1.push('_ap1In + _ap1Out * _apG')}
            _rev = _ap1Out - _ap1In * _apG;
            const _ap2In = _rev;
            const _ap2Out = ${a2.read(0)};
            ${a2.push('_ap2In + _ap2Out * _apG')}
            _rev = _ap2Out - _ap2In * _apG;
        `)

        // Master section — all three knobs (reverbMix, saturation,
        // masterGain) are smoothed params, so sliding any of them is
        // zipper-free and doesn't trigger a recompile.
        const revMixP = ctx.smoothParam('revMix', this.values.reverbMix)
        const satP    = ctx.smoothParam('sat',    this.values.saturation)
        const mGainP  = ctx.smoothParam('mGain',  this.values.masterGain)
        ctx.line(`
            // Reverb is mono — splat to both stereo channels equally.
            const _revBus = _rev * ${revMixP};
            _mixL += _revBus;
            _mixR += _revBus;
            // Tape saturation — applied to each stereo channel
            // independently so the soft-clip knee shows up identically
            // L/R for centered material.
            const _satThresh = 1 - ${satP} * 0.5;
            if(Math.abs(_mixL) > _satThresh){
                const _sL = _mixL >= 0 ? 1 : -1;
                _mixL = _sL * _satThresh + (_mixL - _sL * _satThresh) * 0.3;
            }
            if(Math.abs(_mixR) > _satThresh){
                const _sR = _mixR >= 0 ? 1 : -1;
                _mixR = _sR * _satThresh + (_mixR - _sR * _satThresh) * 0.3;
            }
            _mixL *= ${mGainP};
            _mixR *= ${mGainP};
            ${ctx.state('masterL')} = _mixL;
            ${ctx.state('masterR')} = _mixR;
        `)
    },

    genSinkAudio(ctx){
        // Stereo speaker output. Compiler picks {l, r} up and routes
        // them to ch0 / ch1 separately.
        return {
            l: ctx.state('masterL'),
            r: ctx.state('masterR')
        }
    },

    genAudioTail(ctx){
        // Capture the rendered (mono-downmixed) sink output for the
        // feedback `out` jack. ctx.y is the literal '_y', which the
        // assembler defines as (_yL + _yR) * 0.5 for stereo sinks.
        ctx.line(`${ctx.state('prev')} = ${ctx.y};`)
    },

    _postState(updates){
        const w = this.runtimeState.workletNode
        if(!w) return
        w.port.postMessage({type: 'updateState', nid: `n${this.id}`, updates})
    },

    _toggleRecordArm(trackIndex){
        const track = this.values.tracks[trackIndex]
        track.recArmed = !track.recArmed
        const btn = this.elements.recArmBtns[trackIndex]
        if(btn){
            btn.classList.toggle('armed', track.recArmed)
            btn.textContent = track.recArmed ? '● REC' : '○ Rec'
        }
        this._postState({[`recArmed${trackIndex}`]: track.recArmed ? 1 : 0})
    },

    _toggleMode(trackIndex){
        const track = this.values.tracks[trackIndex]
        track.mode = track.mode === 'replace' ? 'overdub' : 'replace'
        this._refreshModeBtn(trackIndex)
        // Mode is baked into the compiled body, so a recompile is needed.
        audioRuntime.invalidate()
    },

    /** Cheap heuristic: scan the cached peak bins for any non-trivial
     *  amplitude. Used to decide whether destructive operations need a
     *  confirm. Returns true if we have peaks AND any bin is louder
     *  than -46 dBFS, false otherwise (including when peaks haven't
     *  arrived yet — better to confirm conservatively elsewhere). */
    _trackHasContent(trackIndex){
        const peaks = this.runtimeState.peaks[trackIndex]
        if(!peaks) return false
        for(let i = 0; i < peaks.length; i++){
            if(peaks[i] > 0.005) return true
        }
        return false
    },

    _refreshModeBtn(trackIndex){
        const btn = this.elements.modeBtns[trackIndex]
        if(!btn) return
        const mode = this.values.tracks[trackIndex].mode
        btn.textContent = mode === 'replace' ? 'OVR' : 'DUB'
        btn.classList.toggle('replace', mode === 'replace')
        btn.title = mode === 'replace'
            ? 'Replace: crossfade and overwrite the buffer'
            : 'Overdub: sum input on top of the buffer'
    },

    _setTransport(playing){
        this.values.transportPlaying = playing
        if(this.elements.playBtn){
            this.elements.playBtn.textContent = playing ? '⏸ Pause' : '▶ Play'
        }
        this._postState({isPlaying: playing ? 1 : 0})
    },

    _resetPlayhead(){
        this.values.playheadSeconds = 0
        this._postState({playhead: 0})
        this._updateTimeDisplay()
    },

    _updateTimeDisplay(){
        if(!this.elements.timeDisplay) return
        const seconds = this.values.playheadSeconds
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        const ms = Math.floor((seconds % 1) * 1000)
        const pad = (n, w) => n.toString().padStart(w, '0')
        this.elements.timeDisplay.textContent =
            `${pad(mins, 2)}:${pad(secs, 2)}.${pad(ms, 3)}`
    },

    _onWorkletReady(workletNode){
        this.runtimeState.workletNode = workletNode
        if(!workletNode){
            this._stopPeaksPolling()
            return
        }
        workletNode.port.onmessage = (e) => {
            if(this.isDestroyed) return
            const m = e.data
            if(!m) return
            if(m.type === 'snapshot-data' && m.nid === `n${this.id}`){
                // Two callers share this message: periodic peak polling
                // (peaks0..3) and one-shot track buffer requests
                // (track1..4) used by Save Tape and Resize Tape. Dispatch
                // by which fields are present.
                if(m.fields?.track1 && this.runtimeState.pendingTapeBuffers){
                    const fn = this.runtimeState.pendingTapeBuffers
                    this.runtimeState.pendingTapeBuffers = null
                    fn(m.fields)
                } else {
                    for(let i = 0; i < NUM_TRACKS; i++){
                        const peaks = m.fields?.[`peaks${i}`]
                        if(peaks) this.runtimeState.peaks[i] = peaks
                    }
                }
            } else if(m.type === 'record-data' && this.runtimeState.bouncing){
                // ch1 may be null on hosts that hand us a mono bus;
                // duplicate ch0 so the bounced WAV stays a valid stereo file.
                this.runtimeState.bounceChunks.push({
                    ch0: m.ch0 || m.samples,
                    ch1: m.ch1 || m.ch0 || m.samples
                })
            } else if(m.type === 'record-done'){
                this._finalizeBounce()
            }
        }
        queueMicrotask(() => {
            this._resyncWorkletState()
            this._requestPeaks()
            this._startPeaksPolling()
        })
    },

    _resyncWorkletState(){
        const updates = {
            isPlaying: this.values.transportPlaying ? 1 : 0
        }
        this.values.tracks.forEach((t, i) => {
            updates[`recArmed${i}`] = t.recArmed ? 1 : 0
        })
        this._postState(updates)
    },

    _requestPeaks(){
        const w = this.runtimeState.workletNode
        if(!w) return
        w.port.postMessage({
            type: 'snapshot',
            nid: `n${this.id}`,
            fields: ['peaks0', 'peaks1', 'peaks2', 'peaks3']
        })
    },

    _startPeaksPolling(){
        if(this.runtimeState.peaksInterval) return
        this.runtimeState.peaksInterval = setInterval(
            () => this._requestPeaks(), 100
        )
    },

    _stopPeaksPolling(){
        if(this.runtimeState.peaksInterval){
            clearInterval(this.runtimeState.peaksInterval)
            this.runtimeState.peaksInterval = null
        }
    },

    _drawTimeline(){
        const canvas = this.elements.timelineCanvas
        if(!canvas) return
        const w = canvas.width
        const h = canvas.height
        const ctx2d = canvas.getContext('2d')

        ctx2d.fillStyle = 'hsl(195, 30%, 4%)'
        ctx2d.fillRect(0, 0, w, h)

        const laneH = h / NUM_TRACKS
        for(let t = 0; t < NUM_TRACKS; t++){
            const laneTop = t * laneH
            const laneBase = laneTop + laneH - 0.5
            ctx2d.fillStyle = 'hsl(195, 20%, 10%)'
            ctx2d.fillRect(0, laneBase, w, 1)

            const peaks = this.runtimeState.peaks[t]
            if(!peaks) continue
            ctx2d.fillStyle = TRACK_COLORS[t]
            const bins = peaks.length
            const colW = w / bins
            for(let i = 0; i < bins; i++){
                const v = peaks[i]
                if(v <= 0.001) continue
                const barH = Math.min(laneH - 1, v * (laneH - 1))
                ctx2d.fillRect(i * colW, laneBase - barH, Math.max(1, colW), barH)
            }
        }

        const wrap = this._tapeLengthSec()
        const playX = ((this.values.playheadSeconds % wrap) / wrap) * w
        ctx2d.fillStyle = 'hsl(50, 95%, 70%)'
        ctx2d.fillRect(Math.floor(playX), 0, 1, h)
    },

    _startDrawLoop(){
        if(this.runtimeState.rafId) return
        const tick = () => {
            if(this.isDestroyed){ this.runtimeState.rafId = null; return }
            this._drawTimeline()
            this.runtimeState.rafId = requestAnimationFrame(tick)
        }
        this.runtimeState.rafId = requestAnimationFrame(tick)
    },

    _seekFromClick(e){
        const canvas = this.elements.timelineCanvas
        if(!canvas) return
        const rect = canvas.getBoundingClientRect()
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
        const ratio = rect.width > 0 ? x / rect.width : 0
        const wrap = this._tapeLengthSec()
        const sampleRate = this.runtimeState.workletNode?.context?.sampleRate || 48000
        const newPlayhead = Math.floor(ratio * wrap * sampleRate)
        this.values.playheadSeconds = ratio * wrap
        this._postState({playhead: newPlayhead})
        this._updateTimeDisplay()
    },

    /**
     * Bounce-to-WAV: rewind to start, play the full tape, capture the
     * stereo master bus from the engine's output (post-saturation, post-
     * masterGain), and download as a 16-bit stereo WAV. Adds 0.5 s of
     * tail past the cassette length so the reverb doesn't get clipped.
     */
    _bounceWav(){
        if(this.runtimeState.bouncing){
            this._cancelBounce()
            return
        }
        const ctx = getAudioContext()
        const w = this.runtimeState.workletNode
        if(!ctx || !w){
            console.warn('Four-Track: cannot bounce — audio engine not ready.')
            return
        }
        const wrap = this._tapeLengthSec()

        this.runtimeState.bouncing = true
        this.runtimeState.bounceChunks = []
        this.runtimeState.bounceSampleRate = ctx.sampleRate
        this._refreshBounceBtn()

        // Rewind, start playback, arm the engine recorder.
        this._resetPlayhead()
        this._setTransport(true)
        w.port.postMessage({type: 'record-start'})

        // Stop after the full tape + 0.5 s tail (catches the reverb).
        this.runtimeState.bounceTimer = setTimeout(() => {
            this.runtimeState.bounceTimer = null
            if(!this.runtimeState.bouncing) return
            this._setTransport(false)
            const ww = this.runtimeState.workletNode
            if(ww) ww.port.postMessage({type: 'record-stop'})
            else this._finalizeBounce()
        }, (wrap + 0.5) * 1000)
    },

    _cancelBounce(){
        if(this.runtimeState.bounceTimer){
            clearTimeout(this.runtimeState.bounceTimer)
            this.runtimeState.bounceTimer = null
        }
        this.runtimeState.bouncing = false
        this.runtimeState.bounceChunks = null
        this.runtimeState.bounceSampleRate = null
        const w = this.runtimeState.workletNode
        if(w) w.port.postMessage({type: 'record-stop'})
        this._setTransport(false)
        this._refreshBounceBtn()
    },

    _finalizeBounce(){
        if(!this.runtimeState.bouncing && !this.runtimeState.bounceChunks) return
        const chunks = this.runtimeState.bounceChunks || []
        const sampleRate = this.runtimeState.bounceSampleRate || 48000
        this.runtimeState.bouncing = false
        this.runtimeState.bounceChunks = null
        this.runtimeState.bounceSampleRate = null
        if(this.runtimeState.bounceTimer){
            clearTimeout(this.runtimeState.bounceTimer)
            this.runtimeState.bounceTimer = null
        }
        this._refreshBounceBtn()
        if(chunks.length === 0){
            console.warn('Four-Track: bounce finalized with no captured samples.')
            return
        }
        const total = chunks.reduce((s, c) => s + c.ch0.length, 0)
        const ch0 = new Float32Array(total)
        const ch1 = new Float32Array(total)
        let offset = 0
        for(const c of chunks){
            ch0.set(c.ch0, offset)
            ch1.set(c.ch1, offset)
            offset += c.ch0.length
        }
        const blob = encodeWAV(ch0, ch1, sampleRate)
        downloadBlob(blob, getTimestampFilename('fourtrack_bounce', 'wav'))
    },

    _refreshBounceBtn(){
        if(!this.elements.bounceBtn) return
        if(this.runtimeState.bouncing){
            this.elements.bounceBtn.textContent = 'Cancel'
            this.elements.bounceBtn.classList.add('bouncing')
        } else {
            this.elements.bounceBtn.textContent = 'Bounce WAV'
            this.elements.bounceBtn.classList.remove('bouncing')
        }
    },

    /** Snapshot the four track buffers + the mixer state and download
     *  as a .tdk file. Lossless 32-bit float — pure copy of what the
     *  worklet has in memory, no re-encoding, no resampling. */
    _saveTape(){
        const ctx = getAudioContext()
        const w = this.runtimeState.workletNode
        if(!ctx || !w){
            console.warn('Four-Track: cannot save — audio engine not ready.')
            return
        }
        if(this.runtimeState.pendingTapeBuffers){
            // A previous save/resize is still waiting on its snapshot
            // reply; drop the duplicate request silently.
            return
        }
        this.runtimeState.pendingTapeBuffers = (fields) => {
            const t = [fields.track1, fields.track2, fields.track3, fields.track4]
            if(t.some(x => !(x instanceof Float32Array))){
                console.warn('Four-Track: snapshot returned no track buffers.')
                return
            }
            const meta = this._collectTapeMeta()
            const blob = encodeTDK(ctx.sampleRate, t, meta)
            downloadBlob(blob, getTimestampFilename('fourtrack', 'tdk'))
        }
        w.port.postMessage({
            type: 'snapshot',
            nid: `n${this.id}`,
            fields: ['track1', 'track2', 'track3', 'track4']
        })
    },

    _collectTapeMeta(){
        return {
            tracks: this.values.tracks.map(t => ({
                gain: t.gain, pan: t.pan,
                eqLow: t.eqLow, eqHigh: t.eqHigh,
                reverbSend: t.reverbSend, mode: t.mode,
                mute: t.mute, solo: t.solo
            })),
            masterGain: this.values.masterGain,
            saturation: this.values.saturation,
            reverbMix:  this.values.reverbMix,
            cassetteLength: this._tapeLengthSec()
        }
    },

    /** Snapshot the worklet's current buffers, allocate new ones sized
     *  to the current cassetteLength option, copy min(old, new) samples
     *  (so existing audio survives a grow and is truncated cleanly on
     *  shrink), ship back via updateState. Caller is responsible for
     *  having confirmed any destructive shrink first. */
    _performResize(){
        const ctx = getAudioContext()
        const w = this.runtimeState.workletNode
        if(!ctx || !w) return
        if(this.runtimeState.pendingTapeBuffers){
            // A save/resize is already in flight; try again after.
            setTimeout(() => this._performResize(), 100)
            return
        }
        const target = Math.floor(this._tapeLengthSec() * ctx.sampleRate)
        this.runtimeState.pendingTapeBuffers = (fields) => {
            const old = [fields.track1, fields.track2, fields.track3, fields.track4]
            if(old.some(b => !(b instanceof Float32Array))) return
            if(old[0].length === target){
                this.values.playheadSeconds =
                    Math.min(this.values.playheadSeconds, target / ctx.sampleRate)
                this._updateTimeDisplay()
                return
            }
            const next = old.map(o => {
                const buf = new Float32Array(target)
                buf.set(o.subarray(0, Math.min(o.length, target)))
                return buf
            })
            const newPlayhead = Math.min(
                Math.floor(this.values.playheadSeconds * ctx.sampleRate),
                Math.max(0, target - 1)
            )
            this.values.playheadSeconds = newPlayhead / ctx.sampleRate
            w.port.postMessage(
                {
                    type: 'updateState',
                    nid: `n${this.id}`,
                    updates: {
                        track1: next[0], track2: next[1], track3: next[2], track4: next[3],
                        playhead: Math.max(0, newPlayhead),
                        peakBin: -1
                    }
                },
                next.map(b => b.buffer)
            )
            for(let i = 0; i < NUM_TRACKS; i++) this.runtimeState.peaks[i] = null
            audioRuntime.invalidate()
            this._updateTimeDisplay()
        }
        w.port.postMessage({
            type: 'snapshot',
            nid: `n${this.id}`,
            fields: ['track1', 'track2', 'track3', 'track4']
        })
    },

    /** Framework hook — fires after the dropdown writes the new value
     *  into optionValues and just before the audio graph is recompiled.
     *  Confirm any destructive shrink before letting the resize land. */
    onOptionChange(key){
        if(key !== 'cassetteLength') return
        const newSec = this._tapeLengthSec()
        const prevSec = this.runtimeState.lastTapeLengthSec || newSec
        if(newSec < prevSec){
            const anyContent = [0,1,2,3].some(i => this._trackHasContent(i))
            if(anyContent){
                const ok = confirm(
                    `Shrinking the tape to ${Math.round(newSec / 60)} min will ` +
                    `truncate any audio past that point. This cannot be undone.\n\n` +
                    `Continue?`
                )
                if(!ok){
                    // Revert: write old value back into optionValues AND
                    // sync the visible <select> so the user sees the
                    // revert (the framework already updated the DOM).
                    const prevMin = Math.max(1, Math.min(10, Math.round(prevSec / 60)))
                    this.optionValues.cassetteLength = String(prevMin)
                    const sel = this.nodeEl?.querySelector('[data-option-el="cassetteLength"]')
                    if(sel) sel.value = String(prevMin)
                    return
                }
            }
        }
        this.runtimeState.lastTapeLengthSec = newSec
        this._performResize()
    },

    /** Open a native file dialog for a .tdk file, decode, and apply. */
    _loadTape(){
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.tdk,application/octet-stream'
        input.addEventListener('change', async () => {
            const file = input.files?.[0]
            if(!file) return
            try {
                const ab = await file.arrayBuffer()
                const tape = decodeTDK(ab)
                // Confirm if we're about to overwrite existing recordings.
                const anyContent = [0,1,2,3].some(i => this._trackHasContent(i))
                if(anyContent){
                    const ok = confirm(
                        `Loading "${file.name}" will replace all 4 current tracks ` +
                        `and the mixer state. This cannot be undone.\n\nContinue?`
                    )
                    if(!ok) return
                }
                this._applyLoadedTape(tape)
            } catch(err){
                console.error('Four-Track: failed to load tape:', err)
            }
        })
        input.click()
    },

    _applyLoadedTape(tape){
        const ctx = getAudioContext()
        if(ctx && Math.abs(ctx.sampleRate - tape.sampleRate) > 1){
            console.warn(
                `Four-Track: tape was recorded at ${tape.sampleRate} Hz but ` +
                `current AudioContext is ${ctx.sampleRate} Hz. Playback pitch will differ.`
            )
        }

        const meta = tape.meta || {}

        // Mixer state.
        if(Array.isArray(meta.tracks)){
            meta.tracks.forEach((src, i) => {
                if(!this.values.tracks[i] || !src) return
                Object.assign(this.values.tracks[i], src)
            })
        }
        if(typeof meta.masterGain === 'number') this.values.masterGain = meta.masterGain
        if(typeof meta.saturation === 'number') this.values.saturation = meta.saturation
        if(typeof meta.reverbMix  === 'number') this.values.reverbMix  = meta.reverbMix
        // Restore length into the dropdown's option. Older .tdk files
        // wrote raw seconds (15..600); the new format writes integer
        // minutes (1..10). _tapeLengthSec already handles both formats,
        // but the option value itself is what the dropdown shows, so
        // round to the nearest minute and clamp to the dropdown range.
        const lenSec = +meta.cassetteLength
        if(Number.isFinite(lenSec) && lenSec >= 1){
            const min = lenSec > 10
                ? Math.max(1, Math.min(10, Math.round(lenSec / 60)))
                : Math.max(1, Math.min(10, Math.round(lenSec)))
            this.optionValues.cassetteLength = String(min)
            this.runtimeState.lastTapeLengthSec = this._tapeLengthSec()
        }

        // Precompute the timeline peaks from the loaded buffers so the
        // waveform strip is fully drawn the moment the file lands —
        // otherwise it stays blank until the playhead has swept the
        // whole tape. Two copies: one stays on the main thread for the
        // local draw cache, one ships to the worklet so the next
        // periodic snapshot doesn't overwrite us with the engine's
        // empty peak arrays.
        const localPeaks = tape.tracks.map(t => bucketPeaks(t, PEAK_BINS))
        const workletPeaks = localPeaks.map(p => new Float32Array(p))
        for(let i = 0; i < NUM_TRACKS; i++){
            this.runtimeState.peaks[i] = localPeaks[i]
        }

        // Push buffers + peaks + reset playhead atomically. Transfer
        // the big track ArrayBuffers (no structured-clone copy on the
        // way to the worklet); peak arrays are tiny so we let them
        // clone.
        const w = this.runtimeState.workletNode
        if(w){
            w.port.postMessage(
                {
                    type: 'updateState',
                    nid: `n${this.id}`,
                    updates: {
                        track1: tape.tracks[0],
                        track2: tape.tracks[1],
                        track3: tape.tracks[2],
                        track4: tape.tracks[3],
                        peaks0: workletPeaks[0],
                        peaks1: workletPeaks[1],
                        peaks2: workletPeaks[2],
                        peaks3: workletPeaks[3],
                        playhead: 0,
                        peakBin: -1
                    }
                },
                [
                    tape.tracks[0].buffer,
                    tape.tracks[1].buffer,
                    tape.tracks[2].buffer,
                    tape.tracks[3].buffer
                ]
            )
        }

        // UI: stop transport, reset readout, refresh every knob/button
        // to match the loaded values, then recompile so the body bakes
        // in the new gains/pans/etc.
        this.values.transportPlaying = false
        this.values.playheadSeconds = 0
        this._setTransport(false)
        this._updateTimeDisplay()
        this._refreshAllControls()
        audioRuntime.invalidate()
    },

    _refreshAllControls(){
        for(let i = 0; i < NUM_TRACKS; i++){
            const t = this.values.tracks[i]
            this.elements.gainKnobs[i]?.setAttribute('value', t.gain)
            this.elements.panKnobs[i]?.setAttribute('value', t.pan)
            this.elements.eqLowKnobs[i]?.setAttribute('value', t.eqLow)
            this.elements.eqHighKnobs[i]?.setAttribute('value', t.eqHigh)
            this.elements.reverbKnobs[i]?.setAttribute('value', t.reverbSend)
            this.elements.muteBtns[i]?.classList.toggle('active', t.mute)
            this.elements.soloBtns[i]?.classList.toggle('active', t.solo)
            const recBtn = this.elements.recArmBtns[i]
            if(recBtn){
                recBtn.classList.toggle('armed', t.recArmed)
                recBtn.textContent = t.recArmed ? '● REC' : '○ Rec'
            }
            this._refreshModeBtn(i)
        }
        this.elements.masterGainSlider?.setAttribute('value', this.values.masterGain)
        this.elements.saturationKnob?.setAttribute('value', this.values.saturation)
        this.elements.reverbMixKnob?.setAttribute('value', this.values.reverbMix)
    },

    onCreate(){
        audioRuntime.registerSink(this)
        // Seed for onOptionChange's shrink-comparison.
        this.runtimeState.lastTapeLengthSec = this._tapeLengthSec()
        if(!this.customArea) return

        const trackStrip = (i) => `
            <div class="ft-strip" data-track="${i}">
                <div class="ft-strip-head">Track ${i}</div>
                <div class="ft-strip-btns">
                    <button data-el="recArm${i}" class="ft-rec">○ Rec</button>
                    <button data-el="mode${i}"   class="ft-mode">DUB</button>
                    <button data-el="mute${i}"   class="ft-mute">M</button>
                    <button data-el="solo${i}"   class="ft-solo">S</button>
                </div>
                <div class="ft-strip-knobs">
                    <label>Gain</label>    <s-number data-el="gain${i}"    value="0.8" min="0"  max="1" step="0.01"></s-number>
                    <label>Pan</label>     <s-number data-el="pan${i}"     value="${this.values.tracks[i - 1].pan}" min="-1" max="1" step="0.01"></s-number>
                    <label>EQ Low</label>  <s-number data-el="eqLow${i}"   value="0"   min="-1" max="1" step="0.01"></s-number>
                    <label>EQ High</label> <s-number data-el="eqHigh${i}"  value="0"   min="-1" max="1" step="0.01"></s-number>
                    <label>Verb</label>    <s-number data-el="reverb${i}"  value="0"   min="0"  max="1" step="0.01"></s-number>
                </div>
            </div>
        `

        const html = `
            <div class="ft-container">
                <div class="ft-transport">
                    <button data-el="playBtn" class="ft-tbtn">▶ Play</button>
                    <button data-el="stopBtn" class="ft-tbtn">■ Stop</button>
                    <div data-el="timeDisplay" class="ft-time">00:00.000</div>
                </div>
                <canvas data-el="timeline" class="ft-timeline" width="320" height="56" title="Click to seek"></canvas>
                <div class="ft-tracks">
                    ${[1, 2, 3, 4].map(trackStrip).join('')}
                </div>
                <div class="ft-master">
                    <div class="ft-master-head">
                        <span>Master</span>
                        <div class="ft-master-actions">
                            <button data-el="bounceBtn" class="ft-bounce" title="Play the full tape and download a stereo WAV of the master bus">Bounce WAV</button>
                            <button data-el="saveBtn"   class="ft-tape-btn" title="Download all 4 tracks + mixer state as a .tdk tape file">Save Tape</button>
                            <button data-el="loadBtn"   class="ft-tape-btn" title="Load a .tdk tape file (replaces current tracks + mixer state)">Load Tape</button>
                        </div>
                    </div>
                    <div class="ft-master-knobs">
                        <label>Gain</label>     <s-number data-el="masterGain" value="0.8" min="0" max="1" step="0.01"></s-number>
                        <label>Saturate</label> <s-number data-el="saturation" value="0.3" min="0" max="1" step="0.01"></s-number>
                        <label>Reverb</label>   <s-number data-el="reverbMix"  value="0.2" min="0" max="1" step="0.01"></s-number>
                    </div>
                </div>
            </div>
        `

        const fragment = StringToFragment(html)
        const wired = autowire(fragment)

        this.elements.playBtn = wired.playBtn
        this.elements.stopBtn = wired.stopBtn
        this.elements.timeDisplay = wired.timeDisplay
        this.elements.timelineCanvas = wired.timeline

        this.elements.playBtn.addEventListener('click', () => {
            this._setTransport(!this.values.transportPlaying)
        })
        this.elements.stopBtn.addEventListener('click', () => {
            this._setTransport(false)
            this._resetPlayhead()
        })
        this.elements.timelineCanvas.addEventListener('mousedown', (e) => this._seekFromClick(e))

        for(let i = 0; i < NUM_TRACKS; i++){
            const idx = i + 1
            const track = this.values.tracks[i]
            this.elements.recArmBtns[i] = wired[`recArm${idx}`]
            this.elements.modeBtns[i]   = wired[`mode${idx}`]
            this.elements.muteBtns[i]   = wired[`mute${idx}`]
            this.elements.soloBtns[i]   = wired[`solo${idx}`]

            this.elements.recArmBtns[i].addEventListener('click', () => this._toggleRecordArm(i))
            this.elements.modeBtns[i].addEventListener('click', () => this._toggleMode(i))
            this.elements.muteBtns[i].addEventListener('click', () => {
                track.mute = !track.mute
                this.elements.muteBtns[i].classList.toggle('active', track.mute)
                audioRuntime.invalidate()
            })
            this.elements.soloBtns[i].addEventListener('click', () => {
                track.solo = !track.solo
                this.elements.soloBtns[i].classList.toggle('active', track.solo)
                audioRuntime.invalidate()
            })

            // Each knob is wired to a smoothed param via ctx.smoothParam
            // in genAudioSetup. Knob input → setNodeParam ships the new
            // target to the engine; the body's per-sample one-pole keeps
            // it zipper-free without any recompile or crossfade. We keep
            // this.values updated too, so it persists in saves.
            this.elements.gainKnobs[i]   = wired[`gain${idx}`]
            this.elements.panKnobs[i]    = wired[`pan${idx}`]
            this.elements.eqLowKnobs[i]  = wired[`eqLow${idx}`]
            this.elements.eqHighKnobs[i] = wired[`eqHigh${idx}`]
            this.elements.reverbKnobs[i] = wired[`reverb${idx}`]
            const trackParam = (el, valueKey, paramKey) => {
                el.addEventListener('input', (e) => {
                    const v = parseFloat(e.target.value)
                    if(!Number.isFinite(v)) return
                    track[valueKey] = v
                    audioRuntime.setNodeParam(this.id, paramKey, v)
                })
            }
            trackParam(this.elements.gainKnobs[i],   'gain',       `gain${i}`)
            trackParam(this.elements.eqLowKnobs[i],  'eqLow',      `eqLow${i}`)
            trackParam(this.elements.eqHighKnobs[i], 'eqHigh',     `eqHigh${i}`)
            trackParam(this.elements.reverbKnobs[i], 'reverbSend', `rev${i}`)
            // Pan is computed → smoothed as panL/panR (equal-power) so
            // we ship two params per knob event. Smoothing handles the
            // brief L/R inequality during a drag.
            this.elements.panKnobs[i].addEventListener('input', (e) => {
                const v = parseFloat(e.target.value)
                if(!Number.isFinite(v)) return
                track.pan = v
                const panL = Math.cos((v + 1) * Math.PI / 4)
                const panR = Math.sin((v + 1) * Math.PI / 4)
                audioRuntime.setNodeParam(this.id, `panL${i}`, panL)
                audioRuntime.setNodeParam(this.id, `panR${i}`, panR)
            })
        }

        const masterParam = (el, valueKey, paramKey) => {
            el.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value)
                if(!Number.isFinite(v)) return
                this.values[valueKey] = v
                audioRuntime.setNodeParam(this.id, paramKey, v)
            })
        }
        this.elements.masterGainSlider = wired.masterGain
        this.elements.saturationKnob   = wired.saturation
        this.elements.reverbMixKnob    = wired.reverbMix
        this.elements.bounceBtn        = wired.bounceBtn
        this.elements.saveBtn          = wired.saveBtn
        this.elements.loadBtn          = wired.loadBtn
        masterParam(this.elements.masterGainSlider, 'masterGain', 'mGain')
        masterParam(this.elements.saturationKnob,   'saturation', 'sat')
        masterParam(this.elements.reverbMixKnob,    'reverbMix',  'revMix')

        this.elements.bounceBtn.addEventListener('click', () => this._bounceWav())
        this.elements.saveBtn.addEventListener('click',   () => this._saveTape())
        this.elements.loadBtn.addEventListener('click',   () => this._loadTape())

        this.customArea.appendChild(fragment)

        // Restore persisted UI state. Normalize unknown/missing `mode`
        // (patches saved before the field existed) to 'overdub' so the
        // UI button text and the body's compile-time check agree from
        // the very first click.
        this.values.tracks.forEach((t, i) => {
            if(t.mode !== 'replace' && t.mode !== 'overdub') t.mode = 'overdub'
            this.elements.muteBtns[i]?.classList.toggle('active', t.mute)
            this.elements.soloBtns[i]?.classList.toggle('active', t.solo)
            const recBtn = this.elements.recArmBtns[i]
            if(recBtn){
                recBtn.classList.toggle('armed', t.recArmed)
                recBtn.textContent = t.recArmed ? '● REC' : '○ Rec'
            }
            this._refreshModeBtn(i)
        })
        if(this.values.transportPlaying){
            this.elements.playBtn.textContent = '⏸ Pause'
        }

        // Dead-reckoned time display.
        this.runtimeState.lastTickTime = performance.now() / 1000
        this.runtimeState.uiUpdateInterval = setInterval(() => {
            const now = performance.now() / 1000
            const dt = now - this.runtimeState.lastTickTime
            this.runtimeState.lastTickTime = now
            if(this.values.transportPlaying){
                const wrap = this._tapeLengthSec()
                this.values.playheadSeconds =
                    (this.values.playheadSeconds + dt) % wrap
                this._updateTimeDisplay()
            }
        }, 100)

        this._updateTimeDisplay()
        this._startDrawLoop()
    },

    onDestroy(){
        audioRuntime.unregisterSink(this)
        this._stopPeaksPolling()
        if(this.runtimeState.bounceTimer){
            clearTimeout(this.runtimeState.bounceTimer)
            this.runtimeState.bounceTimer = null
        }
        this.runtimeState.bouncing = false
        this.runtimeState.bounceChunks = null
        this.runtimeState.pendingTapeBuffers = null
        if(this.runtimeState.uiUpdateInterval){
            clearInterval(this.runtimeState.uiUpdateInterval)
            this.runtimeState.uiUpdateInterval = null
        }
        if(this.runtimeState.rafId){
            cancelAnimationFrame(this.runtimeState.rafId)
            this.runtimeState.rafId = null
        }
    }
})
