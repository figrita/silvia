import {registerNode} from '../registry.js'
/**
 * VCA — per-sample multiplication of the audio input by a CV gain. Audio
 * passes right through when the Gain input is at 1.0; anything below 1
 * attenuates, anything above it amplifies. Typical patch: ADSR or LFO into
 * Gain, oscillator into Audio.
 */
registerNode({
    slug: 'audio-vca',
    icon: '🎚️',
    label: 'VCA',
    tooltip: 'Voltage-controlled amplifier. Out = Audio * Gain, sample-accurate.',
    workspaceType: 'audio',

    input: {
        'audio': {label: 'Audio', type: 'audio', control: null},
        'gain':  {label: 'Gain',  type: 'float', control: {default: 1.0, min: 0, max: 2, step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                return `(${ctx.in('audio')}) * (${ctx.in('gain')})`
            }
        }
    },

    audioState: {}
})
