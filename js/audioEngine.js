/**
 * audioEngine.js — persistent AudioWorklet for every SynthOut.
 *
 * One processor class ('silvia-audio-engine') is registered once per
 * AudioContext. Every SynthOut owns a single AudioWorkletNode instance of
 * this class and keeps it for its entire lifetime. DSP topology changes
 * arrive as program bodies posted over the port; internal state (phase
 * accumulators, envelope levels, etc.) never crosses a node boundary.
 *
 * The source is shipped as a string so the runtime can addModule() a
 * blob URL — no static path resolution required.
 *
 * Message protocol (main → worklet):
 *   {type: 'program', body, stateInit, paramNames, paramInit, gateMap}
 *                                 load a new DSP body; merge state with
 *                                 stateInit keeping existing nid.field
 *                                 values, adding new ones, dropping removed
 *                                 nids. paramNames lists params the body
 *                                 reads from `p`; paramInit seeds unseen
 *                                 params with their defaults.
 *   {type: 'param', name, value}  knob update; stored as target for one-pole
 *                                 smoothing (τ ~5ms, applied once per block).
 *   {type: 'gate', nid, key, val} action input (ADSR gate etc.) — writes
 *                                 directly into state[nid][key].
 *   {type: 'silence'}             drop the current program; output zero.
 *
 * Body contract: a function of the form
 *   (s, p, inputs, ch0, ch1, blockSize, sampleRate) => void
 * whose body writes blockSize samples into ch0 (and ch1 if non-null).
 */
export const AUDIO_ENGINE_SOURCE = `
class SilviaEngine extends AudioWorkletProcessor {
    constructor(){
        super()
        this.state = Object.create(null)
        this.pTarget = Object.create(null)
        this.pSmooth = Object.create(null)
        this.pNames = []
        this.program = null
        // Per-block one-pole smoother. τ = 5 ms; block = 128 samples at
        // typical 48 kHz → k ≈ 0.41, ~20 ms to 95% on a hard step.
        this.smoothK = 1 - Math.exp(-128 / (sampleRate * 0.005))
        this.port.onmessage = (e) => this._onMessage(e.data)
    }

    _onMessage(m){
        if(!m) return
        switch(m.type){
            case 'program': this._loadProgram(m); break
            case 'param': {
                this.pTarget[m.name] = m.value
                if(!(m.name in this.pSmooth)) this.pSmooth[m.name] = m.value
                break
            }
            case 'gate': {
                const slot = this.state[m.nid]
                if(slot && m.key in slot) slot[m.key] = m.value
                break
            }
            case 'silence': this.program = null; break
        }
    }

    _loadProgram(m){
        // State merge: keep values for nid.field pairs that still exist,
        // seed new ones from stateInit, drop nids that are no longer in
        // the graph. This is why phase/envelope survive recompiles.
        const nextState = Object.create(null)
        const init = m.stateInit || {}
        for(const nid in init){
            const slotInit = init[nid]
            const prev = this.state[nid]
            const slot = Object.create(null)
            for(const k in slotInit){
                slot[k] = (prev && k in prev) ? prev[k] : slotInit[k]
            }
            nextState[nid] = slot
        }
        this.state = nextState

        // Params: keep target/smoothed for names still in the program.
        // New names seed from paramInit (default value) and start ungapped
        // (smooth = target) so first block has no ramp-up from zero.
        const names = m.paramNames || []
        const pInit = m.paramInit || {}
        const nextT = Object.create(null)
        const nextS = Object.create(null)
        for(const n of names){
            const t = (n in this.pTarget) ? this.pTarget[n] : (pInit[n] ?? 0)
            const s = (n in this.pSmooth) ? this.pSmooth[n] : t
            nextT[n] = t
            nextS[n] = s
        }
        this.pTarget = nextT
        this.pSmooth = nextS
        this.pNames = names

        try {
            this.program = new Function(
                's', 'p', 'inputs', 'ch0', 'ch1', 'blockSize', 'sampleRate',
                m.body
            )
        } catch(err){
            console.error('[silvia-audio-engine] failed to compile body:', err)
            console.error('body was:', m.body)
            this.program = null
        }
    }

    process(inputs, outputs){
        const out0 = outputs[0]
        if(!out0 || !out0[0]) return true
        const ch0 = out0[0]
        const blockSize = ch0.length
        const ch1 = out0.length > 1 ? out0[1] : null
        const prog = this.program
        if(!prog){
            ch0.fill(0)
            if(ch1) ch1.fill(0)
            return true
        }

        const k = this.smoothK
        const names = this.pNames
        const tgt = this.pTarget
        const sm  = this.pSmooth
        for(let j = 0; j < names.length; j++){
            const n = names[j]
            sm[n] += (tgt[n] - sm[n]) * k
        }

        try {
            prog(this.state, sm, inputs, ch0, ch1, blockSize, sampleRate)
        } catch(err){
            console.error('[silvia-audio-engine] program threw:', err)
            this.program = null
            ch0.fill(0)
            if(ch1) ch1.fill(0)
        }
        return true
    }
}
registerProcessor('silvia-audio-engine', SilviaEngine)
`
