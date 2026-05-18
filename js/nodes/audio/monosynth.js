import {registerNode} from '../../registry.js'
import {audioRuntime} from '../../audioRuntime.js'

/**
 * Mono Synth — single-voice subtractive synth, "Minimoog-shaped":
 * three free-running oscillators + noise into a 4-pole resonant
 * ladder filter, two ADSR envelopes (filter and amp), glide, and
 * last-note-priority voice management.
 *
 * Plumbing: a midi input drives main-thread state (held-notes
 * stack, target frequency, gate, velocity). Those values cross into
 * the worklet via audioRuntime.setNodeState; the per-sample DSP
 * lives entirely in the body. Single audio output — mono — wires
 * straight into a SynthOut.
 *
 * Note management:
 *   - Last-note priority: each new note retargets the pitch and
 *     adds itself to the stack. Releasing the last-played note
 *     pops it; if the stack still has notes, pitch retargets to
 *     the previous top. When the stack empties, gate drops.
 *   - Single-trigger / legato: pressing a second note while one
 *     is held does NOT retrigger envelopes — it only slides pitch.
 *     Envelopes only restart when the stack transitions from
 *     empty → non-empty (which is what `trigOn` flags).
 */
registerNode({
    slug: 'audio-monosynth',
    icon: '🎛️',
    label: 'Mono Synth',
    tooltip: 'Three-osc monosynth with ladder filter and dual ADSR. Single MIDI in, single audio out.',
    workspaceType: 'audio',

    input: {
        'midi': {
            label: 'MIDI', type: 'midi', control: null,
            noteOnCallback(event){  this._onNoteOn(event)  },
            noteOffCallback(event){ this._onNoteOff(event) }
        },
        // Per-osc detune in semitones, sum-mixed pre-filter
        'osc1Tune':  {label: 'Osc1 ♯', type: 'audio', control: {default: 0,   min: -24, max: 24, step: 0.01}},
        'osc2Tune':  {label: 'Osc2 ♯', type: 'audio', control: {default: -12, min: -24, max: 24, step: 0.01}},
        'osc3Tune':  {label: 'Osc3 ♯', type: 'audio', control: {default: 7,   min: -24, max: 24, step: 0.01}},
        'osc1Level': {label: 'Lvl1',   type: 'audio', control: {default: 1,   min: 0, max: 1, step: 0.01}},
        'osc2Level': {label: 'Lvl2',   type: 'audio', control: {default: 0.7, min: 0, max: 1, step: 0.01}},
        'osc3Level': {label: 'Lvl3',   type: 'audio', control: {default: 0.7, min: 0, max: 1, step: 0.01}},
        'noiseLevel':{label: 'Noise',  type: 'audio', control: {default: 0,   min: 0, max: 1, step: 0.01}},
        // Pitch glide (one-pole towards target). 0 = instant.
        'glide':     {label: 'Glide',  type: 'audio', control: {default: 0,   min: 0, max: 2, step: 0.001, unit: 's'}},
        // Filter: cutoff is a base; envelope adds *octaves* on top
        // (so an "amount" knob feels musical regardless of base).
        'cutoff':    {label: 'Cutoff', type: 'audio', control: {default: 800, min: 20, max: 20000, step: 0.01, unit: 'Hz', logScale: true, smoothMs: 20}},
        'resonance': {label: 'Res',    type: 'audio', control: {default: 0.3, min: 0, max: 1, step: 0.01}},
        'fEnvAmt':   {label: 'F.Env',  type: 'audio', control: {default: 2,   min: -8, max: 8, step: 0.01, unit: 'oct'}},
        // Filter ADSR
        'fAtk': {label: 'F.A', type: 'audio', control: {default: 0.005, min: 0.001, max: 5,   step: 0.001, unit: 's'}},
        'fDec': {label: 'F.D', type: 'audio', control: {default: 0.2,   min: 0.001, max: 5,   step: 0.001, unit: 's'}},
        'fSus': {label: 'F.S', type: 'audio', control: {default: 0.5,   min: 0,     max: 1,   step: 0.01}},
        'fRel': {label: 'F.R', type: 'audio', control: {default: 0.3,   min: 0.001, max: 5,   step: 0.001, unit: 's'}},
        // Amp ADSR
        'aAtk': {label: 'A.A', type: 'audio', control: {default: 0.005, min: 0.001, max: 5,   step: 0.001, unit: 's'}},
        'aDec': {label: 'A.D', type: 'audio', control: {default: 0.2,   min: 0.001, max: 5,   step: 0.001, unit: 's'}},
        'aSus': {label: 'A.S', type: 'audio', control: {default: 0.7,   min: 0,     max: 1,   step: 0.01}},
        'aRel': {label: 'A.R', type: 'audio', control: {default: 0.3,   min: 0.001, max: 5,   step: 0.001, unit: 's'}},
        'gain': {label: 'Vol', type: 'audio', control: {default: 0.3,   min: 0,     max: 1,   step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out', type: 'audio',
            genAudio(ctx){ return ctx.state('outSample') }
        }
    },

    options: {
        osc1Wave: {label: 'Osc1 Wave', type: 'select', default: 'sawtooth', choices: [
            {value: 'sine', name: 'Sine'}, {value: 'sawtooth', name: 'Saw'},
            {value: 'square', name: 'Square'}, {value: 'triangle', name: 'Tri'}
        ]},
        osc2Wave: {label: 'Osc2 Wave', type: 'select', default: 'sawtooth', choices: [
            {value: 'sine', name: 'Sine'}, {value: 'sawtooth', name: 'Saw'},
            {value: 'square', name: 'Square'}, {value: 'triangle', name: 'Tri'}
        ]},
        osc3Wave: {label: 'Osc3 Wave', type: 'select', default: 'square', choices: [
            {value: 'sine', name: 'Sine'}, {value: 'sawtooth', name: 'Saw'},
            {value: 'square', name: 'Square'}, {value: 'triangle', name: 'Tri'}
        ]}
    },

    audioState: {
        // Free-running phase accumulators (per osc). Survive
        // recompiles via mergeState so cable edits don't click.
        phase1: 0, phase2: 0, phase3: 0,
        // Pitch: targetFreq is set by note-on callback; currentFreq
        // glides toward it at the rate the glide knob dictates.
        targetFreq: 440, currentFreq: 440,
        // Gate scalar (sustained while any note is held). gateLast
        // is the body's edge memory for note-off detection.
        gate: 0, gateLast: 0,
        // One-shot trigger latch: callback sets to 1 on note-on
        // when the stack was empty; body restarts envelopes and
        // clears it. Decoupling trigger from gate handles legato
        // (gate stays 1 across overlapping notes, no re-attack).
        trigOn: 0,
        // Note velocity: `vel` is the latched target written by the
        // note-on callback; `velSmooth` is the per-sample one-pole
        // value used in the VCA. Without smoothing, a legato press
        // at a new velocity would cause an instantaneous amplitude
        // step at the block boundary — heard as a click.
        vel: 0, velSmooth: 0,
        // Filter ADSR
        fEnvStage: 0, fEnvLevel: 0,
        // Amp ADSR
        aEnvStage: 0, aEnvLevel: 0,
        // Ladder filter stage memory
        fy1: 0, fy2: 0, fy3: 0, fy4: 0,
        // Output captured here so the lone audio output's genAudio
        // is a one-liner read.
        outSample: 0
    },

    runtimeState: { heldNotes: [] },

    _onNoteOn(event){
        const stack = this.runtimeState.heldNotes
        const wasEmpty = stack.length === 0
        // Last-note priority: most recent press is on top of stack.
        // De-dupe — some controllers send retriggered note-ons
        // without a prior note-off (e.g., MPE pressure aftertouch
        // mistakes); treat them as retargets.
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

    onDestroy(){
        // Drop any pending notes so a recompile-after-rebuild
        // doesn't resurrect a stale gate.
        this.runtimeState.heldNotes.length = 0
    },

    genAudioSetup(ctx){
        const cur  = ctx.state('currentFreq')
        const tgt  = ctx.state('targetFreq')
        const glide = ctx.in('glide')

        // Glide: one-pole toward target. Coefficient = 1 - exp(-1/(τ·SR)).
        // Sub-millisecond glide collapses to instant (snap) so the
        // default `0` gives no audible pitch ramp.
        ctx.line(`{
            const _g = ${glide};
            const _gc = _g > 0.0001 ? (1 - Math.exp(-1 / (_g * sampleRate))) : 1;
            ${cur} += (${tgt} - ${cur}) * _gc;
        }`)

        // Per-osc frequency = pitch · 2^(detune/12).
        ctx.line(`
            const _f1 = ${cur} * Math.pow(2, (${ctx.in('osc1Tune')}) / 12);
            const _f2 = ${cur} * Math.pow(2, (${ctx.in('osc2Tune')}) / 12);
            const _f3 = ${cur} * Math.pow(2, (${ctx.in('osc3Tune')}) / 12);
        `)
        const p1 = ctx.phasor('_f1', 'phase1')
        const p2 = ctx.phasor('_f2', 'phase2')
        const p3 = ctx.phasor('_f3', 'phase3')
        const w1 = ctx.waveform(p1, ctx.option('osc1Wave'))
        const w2 = ctx.waveform(p2, ctx.option('osc2Wave'))
        const w3 = ctx.waveform(p3, ctx.option('osc3Wave'))

        // Pre-filter mixer.
        ctx.line(`
            const _mix = (${w1}) * (${ctx.in('osc1Level')})
                       + (${w2}) * (${ctx.in('osc2Level')})
                       + (${w3}) * (${ctx.in('osc3Level')})
                       + (Math.random() * 2 - 1) * (${ctx.in('noiseLevel')});
        `)

        // Envelope edge handling. trigOn is a one-shot latch set by
        // note-on (only when the held-stack was empty), so legato
        // doesn't re-attack. gate→0 falling edge maps to release.
        const gate     = ctx.state('gate')
        const gateLast = ctx.state('gateLast')
        const trigOn   = ctx.state('trigOn')
        const fStage   = ctx.state('fEnvStage')
        const fLevel   = ctx.state('fEnvLevel')
        const aStage   = ctx.state('aEnvStage')
        const aLevel   = ctx.state('aEnvLevel')
        ctx.line(`
            if(${trigOn} > 0.5){
                ${fStage} = 1; ${aStage} = 1;
                ${trigOn} = 0;
            }
            if(${gate} <= 0.5 && ${gateLast} > 0.5){
                ${fStage} = 4; ${aStage} = 4;
            }
            ${gateLast} = ${gate};
        `)

        // ADSR coefficients. exp(-7) ≈ 9.1e-4 → reaching the target
        // within ~99.9% in T seconds. min(0.0005) on T avoids div-0
        // when a knob is at its absolute floor.
        ctx.line(`
            const _kFA = 1 - Math.exp(-7 / (Math.max(0.0005, ${ctx.in('fAtk')}) * sampleRate));
            const _kFD = 1 - Math.exp(-7 / (Math.max(0.0005, ${ctx.in('fDec')}) * sampleRate));
            const _kFR = 1 - Math.exp(-7 / (Math.max(0.0005, ${ctx.in('fRel')}) * sampleRate));
            const _kAA = 1 - Math.exp(-7 / (Math.max(0.0005, ${ctx.in('aAtk')}) * sampleRate));
            const _kAD = 1 - Math.exp(-7 / (Math.max(0.0005, ${ctx.in('aDec')}) * sampleRate));
            const _kAR = 1 - Math.exp(-7 / (Math.max(0.0005, ${ctx.in('aRel')}) * sampleRate));
            const _fS  = ${ctx.in('fSus')};
            const _aS  = ${ctx.in('aSus')};
        `)
        // Filter ADSR state machine.
        ctx.line(`
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

        // Cutoff = base · 2^(envAmt · envLevel). Envelope amount in
        // octaves keeps the knob's musical meaning independent of the
        // base cutoff. Then convert to ladder coefficient via the
        // standard 1 - exp(-2π·fc/SR) approximation.
        ctx.line(`
            const _cut = Math.max(20, Math.min(20000, (${ctx.in('cutoff')}) * Math.pow(2, (${ctx.in('fEnvAmt')}) * ${fLevel})));
            const _g = 1 - Math.exp(-2 * Math.PI * _cut / sampleRate);
        `)

        // Saturated-input 4-pole ladder. Tanh on the input gives the
        // soft compression that resonance leans into; cascading four
        // one-pole LPs with feedback completes the Moog ladder shape.
        // Resonance maps 0→0 and 1→4 (self-oscillation onset).
        const fy1 = ctx.state('fy1')
        const fy2 = ctx.state('fy2')
        const fy3 = ctx.state('fy3')
        const fy4 = ctx.state('fy4')
        ctx.line(`
            const _q  = (${ctx.in('resonance')}) * 4;
            const _in = Math.tanh(_mix - _q * ${fy4});
            ${fy1} += _g * (_in    - ${fy1});
            ${fy2} += _g * (${fy1} - ${fy2});
            ${fy3} += _g * (${fy2} - ${fy3});
            ${fy4} += _g * (${fy3} - ${fy4});
        `)

        // Velocity smoother — 5 ms one-pole de-clicks the per-note
        // amplitude step on legato (where the gate stays high but
        // vel changes). Coefficient is sample-rate dependent so we
        // can't bake a literal.
        ctx.line(`
            const _kVel = 1 - Math.exp(-1 / (0.005 * sampleRate));
            ${ctx.state('velSmooth')} += (${ctx.state('vel')} - ${ctx.state('velSmooth')}) * _kVel;
        `)

        // VCA: amp env × smoothed velocity × master gain. Output also
        // goes into state so genAudio's read is a state pull (no
        // risk of re-evaluating the whole DSP chain when this output
        // is referenced more than once).
        ctx.line(`${ctx.state('outSample')} = ${fy4} * ${aLevel} * ${ctx.state('velSmooth')} * (${ctx.in('gain')});`)
    }
})
