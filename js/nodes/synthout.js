import {registerNode} from '../registry.js'
import {getAudioContext, ensureAudioRunning} from '../audioContext.js'
import {audioRuntime} from '../audioRuntime.js'
import {autowire, StringToFragment} from '../utils.js'

/**
 * Audio Output — the audio graph's sink.
 *
 * Registering with the audio runtime compiles the upstream DSP graph into
 * a single AudioWorkletProcessor. The worklet's output is simultaneously:
 *   • routed to the speakers (ctx.destination)
 *   • tapped by an AnalyserNode that drives the on-node scope
 *   • optionally captured for recording (WAV via port messages, or
 *     WebM/Opus via MediaStreamDestination + MediaRecorder)
 *
 * The `out` output port is `feedback: true` — it exposes the rendered
 * sample one sample delayed, enabling feedback-through-the-speakers
 * patches without a manual cycle wire.
 */

function getTimestampFilename(prefix, ext){
    const d = new Date()
    const pad = (n) => n.toString().padStart(2, '0')
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
    return `${prefix}_${date}_${time}.${ext}`
}

/** Encode mono Float32 PCM as a 16-bit little-endian WAV blob. */
function encodeWAV(samples, sampleRate){
    const numSamples = samples.length
    const dataSize = numSamples * 2
    const buf = new ArrayBuffer(44 + dataSize)
    const view = new DataView(buf)

    const write = (o, s) => { for(let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }

    write(0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    write(8, 'WAVE')
    write(12, 'fmt ')
    view.setUint32(16, 16, true)        // PCM chunk size
    view.setUint16(20, 1, true)         // format = PCM
    view.setUint16(22, 1, true)         // channels = 1 (engine output is mono)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)  // byte rate
    view.setUint16(32, 2, true)         // block align
    view.setUint16(34, 16, true)        // bits per sample
    write(36, 'data')
    view.setUint32(40, dataSize, true)

    let offset = 44
    for(let i = 0; i < numSamples; i++){
        const s = Math.max(-1, Math.min(1, samples[i]))
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
        offset += 2
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

registerNode({
    slug: 'synthout',
    icon: '📢',
    label: 'Audio Output',
    tooltip: 'Audio sink. Routes the compiled DSP graph to the speakers, displays the waveform/spectrum, records WAV or WebM, and exposes the rendered sample (z⁻¹) for feedback patches.',

    input: {
        'audio': {label: 'Audio', type: 'audio', control: null},
        'level': {label: 'Level', type: 'audio', control: {default: 0.8, min: 0, max: 1, step: 0.01}},
        'rec':   {
            label: 'Rec',
            type: 'action',
            control: {},
            callback(){ this._toggleRecording() }
        }
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            feedback: true,
            genAudio(ctx){ return ctx.state('prev') }
        }
    },

    options: {
        recordFormat: {
            label: 'Record Format',
            type: 'select',
            default: 'wav',
            choices: [
                {value: 'wav',  name: 'WAV (lossless)'},
                {value: 'webm', name: 'WebM/Opus (compressed)'}
            ]
        },
        analyzerMode: {
            label: 'Analyzer',
            type: 'select',
            default: 'waveform',
            choices: [
                {value: 'waveform', name: 'Waveform'},
                {value: 'spectrum', name: 'Spectrum'}
            ]
        }
    },

    audioState: { prev: 0 },

    genAudioTail(ctx){
        ctx.line(`${ctx.state('prev')} = ${ctx.y};`)
    },

    elements: {
        scope: null,
        recBtn: null,
        statusLine: null
    },
    runtimeState: {
        analyser: null,
        waveformData: null,
        frequencyData: null,
        scopeFrameId: null,
        audioHue: '195',
        workletNode: null,
        isRecording: false,
        recordFormat: null,       // the format captured at record-start
        // WAV path
        wavChunks: null,
        enginePortHandler: null,
        wavSampleRate: null,
        // WebM/Opus path
        mediaRecorder: null,
        mediaStreamDest: null,
        mediaChunks: null
    },

    genSinkAudio(ctx){
        const level = ctx.in('level')
        return `(${ctx.upstream}) * (${level})`
    },

    onCreate(){
        const ctx = getAudioContext()
        if(!ctx) return

        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.6
        this.runtimeState.analyser = analyser
        this.runtimeState.waveformData  = new Uint8Array(analyser.fftSize)
        this.runtimeState.frequencyData = new Uint8Array(analyser.frequencyBinCount)

        ensureAudioRunning().catch(() => {})
        audioRuntime.registerSink(this)

        if(!this.customArea) return

        const html = `
            <div class="synthout-custom">
                <canvas data-el="scope" width="220" height="64"></canvas>
                <div class="synthout-controls" data-el="controls">
                    <button data-el="recBtn" class="synthout-rec-btn">● Rec</button>
                    <span data-el="statusLine" class="synthout-status">○ Ready</span>
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        const wired = autowire(fragment)
        this.elements.scope = wired.scope
        this.elements.recBtn = wired.recBtn
        this.elements.statusLine = wired.statusLine
        this.customArea.appendChild(fragment)

        const hueVar = getComputedStyle(document.body).getPropertyValue('--audio-hue').trim()
        if(hueVar) this.runtimeState.audioHue = hueVar

        this.elements.recBtn.addEventListener('click', () => this._toggleRecording())

        this._startScope()
        this._updateStatusLine()
    },

    _onWorkletReady(workletNode){
        const analyser = this.runtimeState.analyser
        const prev = this.runtimeState.workletNode
        if(prev){
            try { prev.disconnect(analyser) } catch(e){}
            prev.port.onmessage = null
            // If recording mid-recompile, the old engine won't send
            // more record-data; finalize what we captured. The new
            // engine starts with `recording=false`, so recording stops
            // cleanly at the swap boundary.
            if(this.runtimeState.isRecording && this.runtimeState.recordFormat === 'wav'){
                this._finalizeWavRecording()
            }
        }
        this.runtimeState.workletNode = workletNode
        if(workletNode){
            if(analyser){
                try { workletNode.connect(analyser) } catch(e){}
            }
            // Install the engine-port message handler immediately — this
            // also auto-starts the port so record-data/record-done
            // messages are delivered. AudioWorkletNode ports are
            // unstarted until `.onmessage` is set OR `.start()` is
            // called; assigning onmessage is the reliable cross-browser
            // path.
            workletNode.port.onmessage = (e) => {
                if(this.isDestroyed) return
                const m = e.data
                if(!m) return
                if(m.type === 'record-data'){
                    if(this.runtimeState.wavChunks){
                        this.runtimeState.wavChunks.push(m.samples)
                    }
                } else if(m.type === 'record-done'){
                    this._finalizeWavRecording()
                }
            }
        }
    },

    _toggleRecording(){
        if(this.runtimeState.isRecording){
            this._stopRecording()
        } else {
            this._startRecording()
        }
    },

    _startRecording(){
        const engine = this.runtimeState.workletNode
        if(!engine){
            console.warn('Audio Output: cannot record — no audio graph is active.')
            return
        }
        const format = this.getOption('recordFormat')
        this.runtimeState.recordFormat = format
        if(format === 'wav'){
            this._startWavRecording(engine)
        } else {
            this._startWebmRecording(engine)
        }
        this.runtimeState.isRecording = true
        this._updateStatusLine()
    },

    _stopRecording(){
        const format = this.runtimeState.recordFormat
        if(format === 'wav'){
            const engine = this.runtimeState.workletNode
            if(engine){
                // Engine will post 'record-done'; handler concats and
                // saves. If engine is gone, finalize locally.
                engine.port.postMessage({type: 'record-stop'})
            } else {
                this._finalizeWavRecording()
            }
        } else if(format === 'webm'){
            this.runtimeState.mediaRecorder?.stop()
        }
        this.runtimeState.isRecording = false
        this._updateStatusLine()
    },

    _startWavRecording(engine){
        this.runtimeState.wavChunks = []
        this.runtimeState.wavSampleRate = getAudioContext().sampleRate
        // The port's onmessage handler is already installed by
        // _onWorkletReady and will push incoming record-data into
        // wavChunks; this just arms the engine.
        engine.port.postMessage({type: 'record-start'})
    },

    _finalizeWavRecording(){
        const chunks = this.runtimeState.wavChunks || []
        this.runtimeState.wavChunks = null
        this.runtimeState.isRecording = false
        const format = this.runtimeState.recordFormat
        this.runtimeState.recordFormat = null
        this._updateStatusLine()

        if(chunks.length === 0){
            console.warn('Audio Output: record finalized with no captured samples.')
            return
        }

        const total = chunks.reduce((s, c) => s + c.length, 0)
        const samples = new Float32Array(total)
        let offset = 0
        for(const c of chunks){
            samples.set(c, offset)
            offset += c.length
        }

        const blob = encodeWAV(samples, this.runtimeState.wavSampleRate)
        downloadBlob(blob, getTimestampFilename('silvia_audio', 'wav'))
    },

    _startWebmRecording(engine){
        const ctx = getAudioContext()
        const dest = ctx.createMediaStreamDestination()
        engine.connect(dest)
        this.runtimeState.mediaStreamDest = dest

        const mimeCandidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4'
        ]
        let mimeType = 'audio/webm'
        for(const mt of mimeCandidates){
            if(MediaRecorder.isTypeSupported(mt)){ mimeType = mt; break }
        }

        const recorder = new MediaRecorder(dest.stream, {mimeType})
        this.runtimeState.mediaChunks = []
        recorder.ondataavailable = (e) => {
            if(e.data.size > 0) this.runtimeState.mediaChunks.push(e.data)
        }
        recorder.onstop = () => {
            const chunks = this.runtimeState.mediaChunks || []
            const outType = mimeType.startsWith('audio/mp4') ? 'audio/mp4' : 'audio/webm'
            const ext = outType === 'audio/mp4' ? 'm4a' : 'webm'
            if(chunks.length){
                const blob = new Blob(chunks, {type: outType})
                downloadBlob(blob, getTimestampFilename('silvia_audio', ext))
            }
            try { engine.disconnect(dest) } catch(e){}
            this.runtimeState.mediaStreamDest = null
            this.runtimeState.mediaChunks = null
            this.runtimeState.mediaRecorder = null
            this.runtimeState.recordFormat = null
            this._updateStatusLine()
        }

        this.runtimeState.mediaRecorder = recorder
        recorder.start()
    },

    _updateStatusLine(){
        if(!this.elements.statusLine || !this.elements.recBtn) return
        if(this.runtimeState.isRecording){
            this.elements.statusLine.textContent = `● Recording ${this.runtimeState.recordFormat.toUpperCase()}`
            this.elements.statusLine.style.color = '#ff3b30'
            this.elements.recBtn.textContent = '■ Stop'
            this.elements.recBtn.classList.add('recording')
        } else {
            this.elements.statusLine.textContent = '○ Ready'
            this.elements.statusLine.style.color = ''
            this.elements.recBtn.textContent = '● Rec'
            this.elements.recBtn.classList.remove('recording')
        }
    },

    _startScope(){
        const canvas = this.elements.scope
        if(!canvas) return
        const ctx2d = canvas.getContext('2d')
        const hue = this.runtimeState.audioHue

        const render = () => {
            if(this.isDestroyed) return
            const analyser = this.runtimeState.analyser
            const mode = this.getOption('analyzerMode')
            const w = canvas.width, h = canvas.height

            ctx2d.fillStyle = `hsl(${hue}, 20%, 6%)`
            ctx2d.fillRect(0, 0, w, h)

            if(analyser){
                ctx2d.strokeStyle = `hsl(${hue}, 75%, 60%)`
                ctx2d.fillStyle = `hsl(${hue}, 75%, 60%)`
                ctx2d.lineWidth = 1.5

                if(mode === 'spectrum'){
                    const data = this.runtimeState.frequencyData
                    analyser.getByteFrequencyData(data)
                    // Log-frequency bucketed bars so the bass doesn't
                    // dominate the display.
                    const bars = Math.min(64, data.length)
                    const barW = w / bars
                    for(let i = 0; i < bars; i++){
                        // Power-curve bucket index: visually more even
                        // than linear across the audible range.
                        const t = i / bars
                        const idx = Math.min(data.length - 1, Math.floor(Math.pow(t, 2) * data.length))
                        const v = data[idx] / 255
                        const bh = v * h
                        ctx2d.fillRect(i * barW, h - bh, Math.max(1, barW - 1), bh)
                    }
                } else {
                    const data = this.runtimeState.waveformData
                    analyser.getByteTimeDomainData(data)
                    ctx2d.beginPath()
                    const step = w / data.length
                    for(let i = 0; i < data.length; i++){
                        const y = (data[i] / 255) * h
                        if(i === 0) ctx2d.moveTo(i * step, y)
                        else ctx2d.lineTo(i * step, y)
                    }
                    ctx2d.stroke()
                }
            }

            this.runtimeState.scopeFrameId = requestAnimationFrame(render)
        }
        render()
    },

    onDestroy(){
        if(this.runtimeState.isRecording) this._stopRecording()
        audioRuntime.unregisterSink(this)
        if(this.runtimeState.scopeFrameId){
            cancelAnimationFrame(this.runtimeState.scopeFrameId)
            this.runtimeState.scopeFrameId = null
        }
        try { this.runtimeState.analyser?.disconnect() } catch(e){}
    }
})
