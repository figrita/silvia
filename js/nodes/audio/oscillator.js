import {registerNode} from '../../registry.js'

/**
 * Audio Oscillator — a single polyphase voice whose sample-by-sample math
 * is compiled into the worklet processor alongside every other audio node
 * in the graph. Phase accumulator lives in worklet state so phase survives
 * recompiles (cable edits, option changes), keeping modulation coherent.
 *
 * Mono source: the same waveform is emitted on both stereo channels. For
 * a wider sound, fan two oscillators with slightly detuned freq into a
 * Pan or run them through Mix at hard L/R gains.
 *
 * Frequency, detune and gain are exposed as CV-capable inputs: leave them
 * knob-driven or patch an LFO/ADSR in. Waveform is a baked-in option
 * (recompile on change).
 */
registerNode({
    slug: 'audio-osc',
    icon: '〰️',
    label: 'Oscillator',
    tooltip: 'Single-voice oscillator, sample-accurate. Mono — same wave on L and R. Freq/Detune/Gain take CV.',
    workspaceType: 'audio',

    input: {
        'freq':   {label: 'Freq',   type: 'audio', control: {default: 220, min: 20, max: 20000, step: 0.01, unit: 'Hz', logScale: true}},
        'detune': {label: 'Detune', type: 'audio', control: {default: 0,   min: -1200, max: 1200, step: 1, unit: '¢'}},
        'gain':   {label: 'Gain',   type: 'audio', control: {default: 0.3, min: 0, max: 1, step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                const wav = ctx.waveform(ctx.state('phase'), ctx.option('waveform'))
                const expr = `(${wav}) * (${ctx.inL('gain')})`
                return {l: expr, r: expr}
            }
        }
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

    genAudioSetup(ctx){
        const freq = ctx.inL('freq')
        const detune = ctx.inL('detune')
        ctx.phasor(`(${freq}) * Math.pow(2, (${detune}) / 1200)`)
    }
})
