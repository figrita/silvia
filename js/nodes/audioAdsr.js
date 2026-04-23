import {registerNode} from '../registry.js'
import {audioRuntime} from '../audioRuntime.js'

/**
 * Analog-style ADSR envelope.
 *
 * Lives as four per-instance state fields inside the compiled worklet:
 *   gate     — current gate value, pushed from the UI via port.postMessage
 *              on the action input's down/up callbacks.
 *   lastGate — previous gate sample, for edge detection inside the loop.
 *   stage    — 0 idle | 1 attack | 2 decay | 3 sustain | 4 release.
 *   env      — the envelope's current level (this is the output).
 *
 * Shape:
 *   attack  linear ramp toward max at a constant rate (max / atk / SR).
 *   decay   exponential approach to sustain level, τ = dec / 5.
 *   release exponential approach to 0, τ = rel / 5.
 *
 * Minimum 3 ms on attack/decay/release prevents per-sample instant jumps
 * that would show up as clicks.
 */
registerNode({
    slug: 'audio-adsr',
    icon: '🎹',
    label: 'ADSR',
    tooltip: 'Per-sample ADSR. Linear attack, exponential decay/release. No clicks on retrigger.',
    workspaceType: 'audio',

    input: {
        'gate': {
            label: 'Gate',
            type: 'action',
            control: {},
            downCallback(){ audioRuntime.postGate(this.id, 'gate', 1) },
            upCallback(){   audioRuntime.postGate(this.id, 'gate', 0) }
        },
        'attack':  {label: 'Attack',  type: 'float', control: {default: 0.01, min: 0, max: 5, step: 0.001, unit: 's'}},
        'decay':   {label: 'Decay',   type: 'float', control: {default: 0.2,  min: 0.001, max: 5, step: 0.001, unit: 's'}},
        'sustain': {label: 'Sustain', type: 'float', control: {default: 0.6,  min: 0, max: 1, step: 0.01}},
        'release': {label: 'Release', type: 'float', control: {default: 0.3,  min: 0.001, max: 5, step: 0.001, unit: 's'}},
        'max':     {label: 'Max',     type: 'float', control: {default: 1.0,  min: 0, max: 10, step: 0.01}}
    },

    output: {
        // Historical key name — keep it 'output' so patches saved by the
        // pre-codegen ADSR keep their cables after this refactor.
        'output': {
            label: 'Out',
            type: 'float',
            genAudio(ctx){ return ctx.state('env') }
        }
    },

    audioState: {
        gate: 0,
        lastGate: 0,
        stage: 0,
        env: 0
    },

    genAudioSetup(ctx){
        const atk = ctx.in('attack')
        const dec = ctx.in('decay')
        const sus = ctx.in('sustain')
        const rel = ctx.in('release')
        const max = ctx.in('max')

        const gate = ctx.state('gate')
        const lg   = ctx.state('lastGate')
        const st   = ctx.state('stage')
        const env  = ctx.state('env')

        ctx.line(`
            if(${gate} !== ${lg}){
                if(${gate} > 0.5) ${st} = 1;
                else              ${st} = 4;
                ${lg} = ${gate};
            }
            const _m  = Math.max(0, ${max});
            const _s  = Math.max(0, Math.min(1, ${sus})) * _m;
            const _dt = 1 / sampleRate;
            if(${st} === 1){
                const _a = Math.max(0.003, ${atk});
                ${env} += _m * _dt / _a;
                if(${env} >= _m){ ${env} = _m; ${st} = 2; }
            } else if(${st} === 2){
                const _d = Math.max(0.003, ${dec});
                const _k = 1 - Math.exp(-_dt * 5 / _d);
                ${env} += (_s - ${env}) * _k;
                if(Math.abs(${env} - _s) < 1e-4){ ${env} = _s; ${st} = 3; }
            } else if(${st} === 3){
                ${env} = _s;
            } else if(${st} === 4){
                const _r = Math.max(0.003, ${rel});
                const _k = 1 - Math.exp(-_dt * 5 / _r);
                ${env} -= ${env} * _k;
                if(${env} < 1e-5){ ${env} = 0; ${st} = 0; }
            }
        `)
    }
})
