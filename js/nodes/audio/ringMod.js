import {registerNode} from '../../registry.js'

/**
 * Ring Modulator — multiplies two audio signals sample-by-sample.
 * Stateless. Two periodic inputs at frequencies f1 and f2 produce sum
 * and difference frequencies (f1+f2 and |f1-f2|) with the original
 * tones suppressed: the classic "robot voice" / Daleks effect.
 *
 * Also useful as a four-quadrant amplitude modulator (LFO into B,
 * audio into A) for tremolo and stuttering effects.
 */
registerNode({
    slug: 'audio-ringmod',
    icon: '💍',
    label: 'Ring Mod',
    tooltip: 'Multiplies two audio signals. Sum and difference frequencies, no carriers — classic ring-mod sound.',
    workspaceType: 'audio',

    input: {
        'a': {label: 'A', type: 'audio', control: null},
        'b': {label: 'B', type: 'audio', control: null}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                return `(${ctx.in('a')}) * (${ctx.in('b')})`
            }
        }
    },

    audioState: {}
})
