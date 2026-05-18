import {registerNode} from '../../registry.js'
import {audioRuntime} from '../../audioRuntime.js'
import {autowire, StringToFragment} from '../../utils.js'

/**
 * Minimono — same DSP topology as audio-monosynth (3 oscs into a
 * 4-pole resonant ladder with two ADSRs, glide, last-note priority)
 * but with all parameters as zipper-free *custom controls* on a
 * Minimoog-arranged panel instead of input ports. Single MIDI in,
 * single audio out.
 *
 * Why a separate node: input-port-driven knobs (`audio-monosynth`)
 * are useful when you want to modulate them with cables. A live-
 * playing instrument doesn't need that — it needs a focused panel
 * UI laid out the way the canonical synth was. Both nodes share
 * the same body shape; only the parameter source differs.
 *
 * Parameter routing: every knob calls audioRuntime.setNodeParam
 * directly, which mirrors what the auto-attached input-listener
 * does for input-port knobs. The body reads via ctx.smoothParam
 * which routes through the engine's per-sample one-pole, so a
 * knob drag is zipper-free without any recompile.
 *
 * Waveform selectors are encoded as integer codes (0=sin, 1=saw,
 * 2=square, 3=tri) on a state field; switching mid-note clicks
 * once because there's no clean morph between basic shapes — that's
 * authentic to the source instrument's hard-switched waveform jack.
 */
registerNode({
    slug: 'audio-minimono',
    icon: '🎚️',
    label: 'Minimono',
    tooltip: 'Minimoog-arranged monosynth panel — knobs only, MIDI in, audio out.',
    workspaceType: 'audio',

    input: {
        'midi': {
            label: 'MIDI', type: 'midi', control: null,
            noteOnCallback(event){  this._onNoteOn(event)  },
            noteOffCallback(event){ this._onNoteOff(event) }
        }
    },

    output: {
        'out': {
            label: 'Out', type: 'audio',
            genAudio(ctx){ return ctx.state('outSample') }
        }
    },

    // Saved knob/select positions. The body's smoothParam init for
    // each knob is read straight off this.values so loading a patch
    // restores the panel state and the audio matches.
    values: {
        osc1Tune: 0,    osc2Tune: 0,    osc3Tune: -12,
        osc1Level: 0.7, osc2Level: 0,   osc3Level: 0,
        noiseLevel: 0,
        osc1Wave: 1,    osc2Wave: 1,    osc3Wave: 2,   // 0=sin 1=saw 2=sqr 3=tri
        glide: 0,
        cutoff: 1500, resonance: 0.2, fEnvAmt: 1.5,
        fAtk: 0.005,  fDec: 0.3,      fSus: 0.5, fRel: 0.3,
        aAtk: 0.005,  aDec: 0.3,      aSus: 0.7, aRel: 0.3,
        gain: 0.4
    },

    audioState: {
        phase1: 0, phase2: 0, phase3: 0,
        targetFreq: 440, currentFreq: 440,
        gate: 0, gateLast: 0,
        trigOn: 0,
        // Note velocity: `vel` is the latched target written by the
        // note-on callback; `velSmooth` is the per-sample one-pole
        // value used in the VCA. Without smoothing, a legato press
        // at a new velocity steps amplitude in one sample — heard
        // as a click.
        vel: 0, velSmooth: 0,
        // Waveform codes — set by select handlers via setNodeState.
        // Their initial values come from this.values; mergeState
        // preserves them across recompiles.
        osc1Wave: 1, osc2Wave: 1, osc3Wave: 2,
        fEnvStage: 0, fEnvLevel: 0,
        aEnvStage: 0, aEnvLevel: 0,
        fy1: 0, fy2: 0, fy3: 0, fy4: 0,
        outSample: 0
    },

    runtimeState: {heldNotes: [], _knobEls: null},

    elements: {},

    _onNoteOn(event){
        const stack = this.runtimeState.heldNotes
        const wasEmpty = stack.length === 0
        const existing = stack.indexOf(event.note)
        if(existing >= 0) stack.splice(existing, 1)
        stack.push(event.note)
        const freq = 440 * Math.pow(2, (event.note - 69) / 12)
        const updates = {targetFreq: freq, vel: event.velocity / 127}
        if(wasEmpty){
            updates.trigOn = 1
            updates.gate = 1
        }
        audioRuntime.setNodeState(this.id, updates)
    },

    _onNoteOff(event){
        const stack = this.runtimeState.heldNotes
        const idx = stack.lastIndexOf(event.note)
        if(idx >= 0) stack.splice(idx, 1)
        if(stack.length > 0){
            const top = stack[stack.length - 1]
            const freq = 440 * Math.pow(2, (top - 69) / 12)
            audioRuntime.setNodeState(this.id, {targetFreq: freq})
        } else {
            audioRuntime.setNodeState(this.id, {gate: 0})
        }
    },

    /** Runtime-switchable waveform expression — the body needs to
     *  pick a shape from a state-field integer rather than a
     *  compile-time literal, so we emit the branch inline. */
    _wfExpr(phaseExpr, codeStateExpr){
        return `(${codeStateExpr} === 0 ? Math.sin(${phaseExpr}) ` +
               `: ${codeStateExpr} === 1 ? (${phaseExpr}) * INV_PI - 1 ` +
               `: ${codeStateExpr} === 2 ? ((${phaseExpr}) < PI ? 1 : -1) ` +
               `: 2 * Math.abs((${phaseExpr}) * INV_PI - 1) - 1)`
    },

    genAudioSetup(ctx){
        const v = this.values

        // Glide (one-pole towards target).
        const glide = ctx.smoothParam('glide', v.glide)
        const cur = ctx.state('currentFreq')
        const tgt = ctx.state('targetFreq')
        ctx.line(`{
            const _g = ${glide};
            const _gc = _g > 0.0001 ? (1 - Math.exp(-1 / (_g * sampleRate))) : 1;
            ${cur} += (${tgt} - ${cur}) * _gc;
        }`)

        // Per-osc detune → frequencies.
        const o1T = ctx.smoothParam('osc1Tune', v.osc1Tune)
        const o2T = ctx.smoothParam('osc2Tune', v.osc2Tune)
        const o3T = ctx.smoothParam('osc3Tune', v.osc3Tune)
        ctx.line(`
            const _f1 = ${cur} * Math.pow(2, (${o1T}) / 12);
            const _f2 = ${cur} * Math.pow(2, (${o2T}) / 12);
            const _f3 = ${cur} * Math.pow(2, (${o3T}) / 12);
        `)
        const p1 = ctx.phasor('_f1', 'phase1')
        const p2 = ctx.phasor('_f2', 'phase2')
        const p3 = ctx.phasor('_f3', 'phase3')
        const w1 = this._wfExpr(p1, ctx.state('osc1Wave'))
        const w2 = this._wfExpr(p2, ctx.state('osc2Wave'))
        const w3 = this._wfExpr(p3, ctx.state('osc3Wave'))

        const l1 = ctx.smoothParam('osc1Level', v.osc1Level)
        const l2 = ctx.smoothParam('osc2Level', v.osc2Level)
        const l3 = ctx.smoothParam('osc3Level', v.osc3Level)
        const lN = ctx.smoothParam('noiseLevel', v.noiseLevel)
        ctx.line(`
            const _mix = (${w1}) * (${l1})
                       + (${w2}) * (${l2})
                       + (${w3}) * (${l3})
                       + (Math.random() * 2 - 1) * (${lN});
        `)

        // Envelope edge handling.
        const gate     = ctx.state('gate')
        const gateLast = ctx.state('gateLast')
        const trigOn   = ctx.state('trigOn')
        const fStage   = ctx.state('fEnvStage')
        const fLevel   = ctx.state('fEnvLevel')
        const aStage   = ctx.state('aEnvStage')
        const aLevel   = ctx.state('aEnvLevel')
        ctx.line(`
            if(${trigOn} > 0.5){ ${fStage} = 1; ${aStage} = 1; ${trigOn} = 0; }
            if(${gate} <= 0.5 && ${gateLast} > 0.5){ ${fStage} = 4; ${aStage} = 4; }
            ${gateLast} = ${gate};
        `)

        const fA = ctx.smoothParam('fAtk', v.fAtk)
        const fD = ctx.smoothParam('fDec', v.fDec)
        const fS = ctx.smoothParam('fSus', v.fSus)
        const fR = ctx.smoothParam('fRel', v.fRel)
        const aA = ctx.smoothParam('aAtk', v.aAtk)
        const aD = ctx.smoothParam('aDec', v.aDec)
        const aS = ctx.smoothParam('aSus', v.aSus)
        const aR = ctx.smoothParam('aRel', v.aRel)
        ctx.line(`
            const _kFA = 1 - Math.exp(-7 / (Math.max(0.0005, ${fA}) * sampleRate));
            const _kFD = 1 - Math.exp(-7 / (Math.max(0.0005, ${fD}) * sampleRate));
            const _kFR = 1 - Math.exp(-7 / (Math.max(0.0005, ${fR}) * sampleRate));
            const _kAA = 1 - Math.exp(-7 / (Math.max(0.0005, ${aA}) * sampleRate));
            const _kAD = 1 - Math.exp(-7 / (Math.max(0.0005, ${aD}) * sampleRate));
            const _kAR = 1 - Math.exp(-7 / (Math.max(0.0005, ${aR}) * sampleRate));
            const _fS  = ${fS};
            const _aS  = ${aS};
            switch(${fStage}){
                case 1: ${fLevel} += (1 - ${fLevel}) * _kFA;
                        if(${fLevel} > 0.999){ ${fLevel} = 1; ${fStage} = 2; } break;
                case 2: ${fLevel} += (_fS - ${fLevel}) * _kFD;
                        if(Math.abs(${fLevel} - _fS) < 0.001){ ${fLevel} = _fS; ${fStage} = 3; } break;
                case 3: ${fLevel} = _fS; break;
                case 4: ${fLevel} += -${fLevel} * _kFR;
                        if(${fLevel} < 0.0001){ ${fLevel} = 0; ${fStage} = 0; } break;
                default: ${fLevel} = 0; break;
            }
            switch(${aStage}){
                case 1: ${aLevel} += (1 - ${aLevel}) * _kAA;
                        if(${aLevel} > 0.999){ ${aLevel} = 1; ${aStage} = 2; } break;
                case 2: ${aLevel} += (_aS - ${aLevel}) * _kAD;
                        if(Math.abs(${aLevel} - _aS) < 0.001){ ${aLevel} = _aS; ${aStage} = 3; } break;
                case 3: ${aLevel} = _aS; break;
                case 4: ${aLevel} += -${aLevel} * _kAR;
                        if(${aLevel} < 0.0001){ ${aLevel} = 0; ${aStage} = 0; } break;
                default: ${aLevel} = 0; break;
            }
        `)

        const cut = ctx.smoothParam('cutoff',    v.cutoff)
        const fAmt = ctx.smoothParam('fEnvAmt',  v.fEnvAmt)
        const res = ctx.smoothParam('resonance', v.resonance)
        ctx.line(`
            const _cut = Math.max(20, Math.min(20000, (${cut}) * Math.pow(2, (${fAmt}) * ${fLevel})));
            const _g = 1 - Math.exp(-2 * Math.PI * _cut / sampleRate);
            const _q = (${res}) * 4;
            const _in = Math.tanh(_mix - _q * ${ctx.state('fy4')});
            ${ctx.state('fy1')} += _g * (_in - ${ctx.state('fy1')});
            ${ctx.state('fy2')} += _g * (${ctx.state('fy1')} - ${ctx.state('fy2')});
            ${ctx.state('fy3')} += _g * (${ctx.state('fy2')} - ${ctx.state('fy3')});
            ${ctx.state('fy4')} += _g * (${ctx.state('fy3')} - ${ctx.state('fy4')});
        `)

        // Velocity smoother — 5 ms one-pole de-clicks the per-note
        // amplitude step on legato (gate stays high but vel changes).
        ctx.line(`
            const _kVel = 1 - Math.exp(-1 / (0.005 * sampleRate));
            ${ctx.state('velSmooth')} += (${ctx.state('vel')} - ${ctx.state('velSmooth')}) * _kVel;
        `)

        const gain = ctx.smoothParam('gain', v.gain)
        ctx.line(`${ctx.state('outSample')} = ${ctx.state('fy4')} * ${aLevel} * ${ctx.state('velSmooth')} * (${gain});`)
    },

    _knob(key, attrs){
        const v = this.values
        const {min, max, step, log = false, unit = ''} = attrs
        const value = v[key]
        return `<s-number data-el="${key}" value="${value}" default="${value}" ` +
               `min="${min}" max="${max}" step="${step}" ` +
               `${log ? 'log-scale' : ''} ${unit ? `unit="${unit}"` : ''}></s-number>`
    },

    _waveSelect(key){
        const codes = [
            {v: 0, label: 'SIN'}, {v: 1, label: 'SAW'},
            {v: 2, label: 'SQR'}, {v: 3, label: 'TRI'}
        ]
        const cur = this.values[key]
        return `<select data-el="${key}" class="mini-wave-select">` +
            codes.map(c => `<option value="${c.v}" ${c.v === cur ? 'selected' : ''}>${c.label}</option>`).join('') +
        `</select>`
    },

    onCreate(){
        if(!this.customArea) return

        const k = (key, opts) => this._knob(key, opts)
        const ws = (key) => this._waveSelect(key)

        const html = `
            <style>
                .minimono { padding: 6px; display: flex; flex-wrap: wrap; gap: 8px;
                            font-family: monospace; }
                .minimono section { display: flex; flex-direction: column; gap: 3px;
                                    padding: 6px; background: var(--bg-secondary);
                                    border-radius: 2px; min-width: 110px; }
                .minimono h4 { margin: 0 0 4px 0; font-size: 9px; letter-spacing: 1px;
                               color: var(--text-muted); text-transform: uppercase;
                               text-align: center; border-bottom: 1px solid var(--border-subtle);
                               padding-bottom: 3px; }
                .minimono .row { display: flex; align-items: center; gap: 4px; }
                .minimono .row > label { width: 36px; font-size: 10px;
                                         color: var(--text-secondary); }
                .minimono .row > s-number { flex: 1; min-width: 0; }
                .minimono .mini-wave-select { background: var(--bg-tertiary);
                    color: var(--text-primary); border: 1px solid var(--border-normal);
                    border-radius: 2px; font-family: monospace; font-size: 10px;
                    padding: 2px 4px; }
            </style>
            <div class="minimono">
                <section>
                    <h4>Oscillators</h4>
                    <div class="row"><label>Osc1 ♯</label>${k('osc1Tune', {min: -24, max: 24, step: 0.01})}${ws('osc1Wave')}</div>
                    <div class="row"><label>Osc2 ♯</label>${k('osc2Tune', {min: -24, max: 24, step: 0.01})}${ws('osc2Wave')}</div>
                    <div class="row"><label>Osc3 ♯</label>${k('osc3Tune', {min: -24, max: 24, step: 0.01})}${ws('osc3Wave')}</div>
                </section>
                <section>
                    <h4>Mixer</h4>
                    <div class="row"><label>Osc1</label>${k('osc1Level', {min: 0, max: 1, step: 0.01})}</div>
                    <div class="row"><label>Osc2</label>${k('osc2Level', {min: 0, max: 1, step: 0.01})}</div>
                    <div class="row"><label>Osc3</label>${k('osc3Level', {min: 0, max: 1, step: 0.01})}</div>
                    <div class="row"><label>Noise</label>${k('noiseLevel', {min: 0, max: 1, step: 0.01})}</div>
                </section>
                <section>
                    <h4>Filter</h4>
                    <div class="row"><label>Cutoff</label>${k('cutoff',    {min: 20, max: 20000, step: 0.01, log: true, unit: 'Hz'})}</div>
                    <div class="row"><label>Reson.</label>${k('resonance', {min: 0,  max: 1, step: 0.01})}</div>
                    <div class="row"><label>F.Env</label>${k('fEnvAmt',    {min: -8, max: 8, step: 0.01, unit: 'oct'})}</div>
                    <div class="row"><label>F.Atk</label>${k('fAtk',       {min: 0.001, max: 5, step: 0.001, log: true, unit: 's'})}</div>
                    <div class="row"><label>F.Dec</label>${k('fDec',       {min: 0.001, max: 5, step: 0.001, log: true, unit: 's'})}</div>
                    <div class="row"><label>F.Sus</label>${k('fSus',       {min: 0, max: 1, step: 0.01})}</div>
                    <div class="row"><label>F.Rel</label>${k('fRel',       {min: 0.001, max: 5, step: 0.001, log: true, unit: 's'})}</div>
                </section>
                <section>
                    <h4>Loudness</h4>
                    <div class="row"><label>A.Atk</label>${k('aAtk', {min: 0.001, max: 5, step: 0.001, log: true, unit: 's'})}</div>
                    <div class="row"><label>A.Dec</label>${k('aDec', {min: 0.001, max: 5, step: 0.001, log: true, unit: 's'})}</div>
                    <div class="row"><label>A.Sus</label>${k('aSus', {min: 0, max: 1, step: 0.01})}</div>
                    <div class="row"><label>A.Rel</label>${k('aRel', {min: 0.001, max: 5, step: 0.001, log: true, unit: 's'})}</div>
                </section>
                <section>
                    <h4>Output</h4>
                    <div class="row"><label>Glide</label>${k('glide', {min: 0, max: 2, step: 0.001, unit: 's'})}</div>
                    <div class="row"><label>Vol</label>${k('gain',  {min: 0, max: 1, step: 0.01})}</div>
                </section>
            </div>
        `
        const fragment = StringToFragment(html)
        const wired = autowire(fragment)
        this.elements = wired
        this.customArea.appendChild(fragment)

        // Knob handler: persist to this.values + ship to engine. The
        // engine smooths per-sample so the drag is zipper-free
        // without any recompile.
        const knobKeys = [
            'osc1Tune','osc2Tune','osc3Tune',
            'osc1Level','osc2Level','osc3Level','noiseLevel',
            'glide','cutoff','resonance','fEnvAmt',
            'fAtk','fDec','fSus','fRel',
            'aAtk','aDec','aSus','aRel','gain'
        ]
        for(const key of knobKeys){
            const el = wired[key]
            if(!el) continue
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value)
                if(!Number.isFinite(val)) return
                this.values[key] = val
                audioRuntime.setNodeParam(this.id, key, val)
            })
        }

        // Waveform select handler: persist + push state field. No
        // smoothing path for shapes — the switch is a hard cut by
        // design (mirrors the original Minimoog's mechanical wave
        // jack), so any pop on shape change is authentic.
        for(const key of ['osc1Wave','osc2Wave','osc3Wave']){
            const el = wired[key]
            if(!el) continue
            el.addEventListener('change', (e) => {
                const code = parseInt(e.target.value, 10)
                if(!Number.isInteger(code)) return
                this.values[key] = code
                audioRuntime.setNodeState(this.id, {[key]: code})
            })
        }
    },

    onDestroy(){
        this.runtimeState.heldNotes.length = 0
    }
})
