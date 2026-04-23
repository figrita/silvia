/**
 * audioEngine.js — persistent AudioWorklet for every SynthOut.
 *
 * One processor ('silvia-audio-engine') registered once per AudioContext.
 * Each SynthOut owns a single AudioWorkletNode that lives for the sink's
 * entire lifetime. Topology changes arrive as program bodies posted on the
 * port; the engine double-buffers and crossfades between programs so cable
 * edits and option changes never click.
 *
 * Messages (main → worklet):
 *   {type: 'program', body, stateInit, paramNames, paramInit, gateMap}
 *       Load a new DSP body. If a fade is already in flight, supersede
 *       pending program (latest wins). Otherwise start a ~10 ms equal-power
 *       crossfade from the active program to the incoming one.
 *   {type: 'param', name, value}
 *       Update a param target. Smoothing happens per-sample inside the
 *       compiled body (K_SMOOTH ≈ 5 ms one-pole).
 *   {type: 'gate', nid, key, value}
 *       Write directly into state[nid][key] on BOTH programs during a fade
 *       so the event isn't split across the crossfade boundary.
 *   {type: 'silence'}
 *       Drop current program and output zeros (teardown path; normal null
 *       compiles come through as a program with a silence body so the swap
 *       still crossfades).
 *
 * Body contract: (s, p, inputs, ch0, ch1, blockSize, sampleRate) → void.
 * The body writes blockSize samples into ch0 (and ch1 if non-null) and
 * updates `s.*` in place. `p` is a shared plain object the engine mutates
 * on 'param' messages; the body smooths per-sample into `s._psmooth.*`.
 */
export const AUDIO_ENGINE_SOURCE = `
const SILENCE_BODY = "'use strict'; ch0.fill(0); if(ch1) ch1.fill(0);";

function silenceSlot(){
    const fn = new Function(
        's', 'p', 'inputs', 'ch0', 'ch1', 'blockSize', 'sampleRate',
        SILENCE_BODY
    );
    return { fn, state: Object.create(null) };
}

function mergeState(prevState, stateInit){
    const next = Object.create(null);
    for(const nid in stateInit){
        const slotInit = stateInit[nid];
        const prev = prevState ? prevState[nid] : null;
        const slot = Object.create(null);
        for(const k in slotInit){
            slot[k] = (prev && (k in prev)) ? prev[k] : slotInit[k];
        }
        next[nid] = slot;
    }
    return next;
}

class SilviaEngine extends AudioWorkletProcessor {
    constructor(){
        super();
        this.FADE_SAMPLES = Math.max(32, Math.round(sampleRate * 0.010));
        this.params = Object.create(null);
        this.programs = [silenceSlot(), null];
        this.fade = null;                  // {samples, position} during a swap
        this.programQueue = null;          // latest pending; older ones discarded
        this._scratchA0 = new Float32Array(128);
        this._scratchA1 = new Float32Array(128);
        this._scratchB0 = new Float32Array(128);
        this._scratchB1 = new Float32Array(128);
        this.port.onmessage = (e) => this._onMessage(e.data);
    }

    _onMessage(m){
        if(!m) return;
        switch(m.type){
            case 'program':
                if(this.fade) this.programQueue = m;
                else this._startFade(m);
                break;
            case 'param':
                this.params[m.name] = m.value;
                break;
            case 'gate': {
                const a = this.programs[0] && this.programs[0].state[m.nid];
                if(a && (m.key in a)) a[m.key] = m.value;
                const b = this.programs[1] && this.programs[1].state[m.nid];
                if(b && (m.key in b)) b[m.key] = m.value;
                break;
            }
            case 'silence':
                this.programs[0] = silenceSlot();
                this.programs[1] = null;
                this.fade = null;
                this.programQueue = null;
                this.params = Object.create(null);
                break;
        }
    }

    _startFade(m){
        const names = m.paramNames || [];
        const pInit = m.paramInit || {};
        // Reconcile the shared target object: keep current targets for
        // names still present, seed new names from their defaults, drop
        // names that vanished from the new compile.
        const nextP = Object.create(null);
        for(let i = 0; i < names.length; i++){
            const n = names[i];
            nextP[n] = (n in this.params) ? this.params[n] : (pInit[n] != null ? pInit[n] : 0);
        }
        this.params = nextP;

        const active = this.programs[0];
        const state = mergeState(active ? active.state : null, m.stateInit || {});

        let fn;
        try {
            fn = new Function(
                's', 'p', 'inputs', 'ch0', 'ch1', 'blockSize', 'sampleRate',
                m.body
            );
        } catch(err){
            console.error('[silvia-audio-engine] failed to compile body:', err);
            console.error('body was:', m.body);
            return;
        }

        this.programs[1] = { fn, state };
        this.fade = { samples: this.FADE_SAMPLES, position: 0 };
    }

    _ensureScratch(blockSize){
        if(this._scratchA0.length === blockSize) return;
        this._scratchA0 = new Float32Array(blockSize);
        this._scratchA1 = new Float32Array(blockSize);
        this._scratchB0 = new Float32Array(blockSize);
        this._scratchB1 = new Float32Array(blockSize);
    }

    _runOrZero(slot, inputs, ch0, ch1, blockSize, label){
        try {
            slot.fn(slot.state, this.params, inputs, ch0, ch1, blockSize, sampleRate);
        } catch(err){
            console.error('[silvia-audio-engine] ' + label + ' threw:', err);
            ch0.fill(0);
            if(ch1) ch1.fill(0);
        }
    }

    process(inputs, outputs){
        const out0 = outputs[0];
        if(!out0 || !out0[0]) return true;
        const ch0 = out0[0];
        const blockSize = ch0.length;
        const ch1 = out0.length > 1 ? out0[1] : null;

        if(!this.fade){
            this._runOrZero(this.programs[0], inputs, ch0, ch1, blockSize, 'active');
            return true;
        }

        this._ensureScratch(blockSize);
        const tmpA0 = this._scratchA0;
        const tmpA1 = ch1 ? this._scratchA1 : null;
        const tmpB0 = this._scratchB0;
        const tmpB1 = ch1 ? this._scratchB1 : null;

        this._runOrZero(this.programs[0], inputs, tmpA0, tmpA1, blockSize, 'active/fade');
        this._runOrZero(this.programs[1], inputs, tmpB0, tmpB1, blockSize, 'incoming/fade');

        const fadeLen = this.fade.samples;
        let pos = this.fade.position;
        const HALF_PI = Math.PI * 0.5;
        for(let i = 0; i < blockSize; i++){
            const t = pos >= fadeLen ? 1 : pos / fadeLen;
            const gA = Math.cos(t * HALF_PI);
            const gB = Math.sin(t * HALF_PI);
            ch0[i] = tmpA0[i] * gA + tmpB0[i] * gB;
            if(ch1) ch1[i] = tmpA1[i] * gA + tmpB1[i] * gB;
            pos++;
        }
        this.fade.position = pos;

        if(pos >= fadeLen){
            this.programs[0] = this.programs[1];
            this.programs[1] = null;
            this.fade = null;
            if(this.programQueue){
                const q = this.programQueue;
                this.programQueue = null;
                this._startFade(q);
            }
        }
        return true;
    }
}

registerProcessor('silvia-audio-engine', SilviaEngine);
`
