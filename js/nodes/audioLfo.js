import {registerNode} from '../registry.js'
import {audioRuntime} from '../audioRuntime.js'

/**
 * LFO — low-frequency oscillator for modulation. Output is bipolar: a sine
 * at amplitude 1.0 swings from -1 to +1. Run it into an Attenuverter to
 * center it around a useful base before hitting a filter cutoff, or
 * straight into a VCA.gain to ping-pong the volume.
 *
 * Rate goes all the way up to 200 Hz, so this doubles as an audio-rate
 * modulator when you want to bend the "LFO" label.
 */
registerNode({
    slug: 'audio-lfo',
    icon: '🌀',
    label: 'LFO',
    tooltip: 'Low-frequency oscillator for modulation. Bipolar output, sample-accurate.',
    workspaceType: 'audio',

    input: {
        'rate':      {label: 'Rate',      type: 'audio', control: {default: 2, min: 0.01, max: 200, step: 0.01, unit: 'Hz', logScale: true}},
        'amplitude': {label: 'Amplitude', type: 'audio', control: {default: 1.0, min: 0, max: 10, step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                const phase = ctx.state('phase')
                const amp = ctx.in('amplitude')
                let wavExpr
                switch(ctx.option('waveform')){
                    case 'square':   wavExpr = `(${phase} < 3.141592653589793 ? 1 : -1)`; break
                    case 'sawtooth': wavExpr = `(${phase} / 3.141592653589793 - 1)`; break
                    case 'triangle': wavExpr = `(2 * Math.abs(${phase} / 3.141592653589793 - 1) - 1)`; break
                    case 'sine':
                    default:         wavExpr = `Math.sin(${phase})`
                }
                return `(${wavExpr}) * (${amp})`
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
        const rate = ctx.in('rate')
        const phase = ctx.state('phase')
        ctx.line(`${phase} += (${rate}) * 6.283185307179586 / sampleRate;`)
        ctx.line(`if(${phase} >= 6.283185307179586) ${phase} -= 6.283185307179586;`)
        ctx.line(`else if(${phase} < 0) ${phase} += 6.283185307179586;`)
    },

    onOptionChange(){ audioRuntime.invalidate() }
})
