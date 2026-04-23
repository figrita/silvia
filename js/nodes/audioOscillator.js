import {registerNode} from '../registry.js'
import {audioRuntime} from '../audioRuntime.js'

/**
 * Audio Oscillator — a single polyphase voice whose sample-by-sample math
 * is compiled into the worklet processor alongside every other audio node
 * in the graph. Phase accumulator lives in worklet state so phase survives
 * recompiles (cable edits, option changes), keeping modulation coherent.
 *
 * Frequency, detune and gain are exposed as CV-capable inputs: leave them
 * knob-driven or patch an LFO/ADSR in. Waveform is a baked-in option
 * (recompile on change).
 */
registerNode({
    slug: 'audio-osc',
    icon: '〰️',
    label: 'Oscillator',
    tooltip: 'Single-voice oscillator, sample-accurate. Freq/Detune/Gain take CV.',
    workspaceType: 'audio',

    input: {
        'freq':   {label: 'Freq',   type: 'float', control: {default: 220, min: 20, max: 20000, step: 0.01, unit: 'Hz', logScale: true}},
        'detune': {label: 'Detune', type: 'float', control: {default: 0,   min: -1200, max: 1200, step: 1, unit: '¢'}},
        'gain':   {label: 'Gain',   type: 'float', control: {default: 0.3, min: 0, max: 1, step: 0.01}}
    },

    output: {
        'out': {label: 'Out', type: 'audio'}
    },

    options: {
        waveform: {
            label: 'Waveform',
            type: 'select',
            default: 'sine',
            choices: [
                {value: 'sine',     name: 'Sine'},
                {value: 'square',   name: 'Square'},
                {value: 'sawtooth', name: 'Saw'},
                {value: 'triangle', name: 'Triangle'}
            ]
        }
    },

    audioState: { phase: 0 },

    genAudio(ctx){
        const freq = ctx.in('freq')
        const detune = ctx.in('detune')
        const gain = ctx.in('gain')
        const phase = ctx.state('phase')
        const wave = ctx.option('waveform')

        ctx.line(`const ef = (${freq}) * Math.pow(2, (${detune}) / 1200);`)
        ctx.line(`${phase} += ef * 6.283185307179586 / sampleRate;`)
        ctx.line(`if(${phase} >= 6.283185307179586) ${phase} -= 6.283185307179586;`)
        ctx.line(`else if(${phase} < 0) ${phase} += 6.283185307179586;`)

        let wavExpr
        switch(wave){
            case 'square':   wavExpr = `(${phase} < 3.141592653589793 ? 1 : -1)`; break
            case 'sawtooth': wavExpr = `(${phase} / 3.141592653589793 - 1)`; break
            case 'triangle': wavExpr = `(2 * Math.abs(${phase} / 3.141592653589793 - 1) - 1)`; break
            case 'sine':
            default:         wavExpr = `Math.sin(${phase})`
        }
        return { out: `(${wavExpr}) * (${gain})` }
    },

    onOptionChange(){
        audioRuntime.invalidate()
    }
})
