import {registerNode} from '../../registry.js'

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
                const wav = ctx.waveform(ctx.state('phase'), ctx.option('waveform'))
                return `(${wav}) * (${ctx.in('amplitude')})`
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
        ctx.phasor(ctx.in('rate'))
    }
})
