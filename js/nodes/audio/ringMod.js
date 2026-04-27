import {registerNode} from '../../registry.js'

/**
 * Ring Modulator — multiplies two audio signals sample-by-sample.
 * Stateless. Two periodic inputs at frequencies f1 and f2 produce sum
 * and difference frequencies (f1+f2 and |f1-f2|) with the original
 * tones suppressed: the classic "robot voice" / Daleks effect.
 *
 * Stereo: L of A multiplied by L of B, R of A by R of B. With mono
 * inputs both channels carry the same product; with stereo inputs the
 * modulation differs per side, useful for animated stereo textures.
 *
 * Also useful as a four-quadrant amplitude modulator (LFO into B,
 * audio into A) for tremolo and stuttering effects.
 */
registerNode({
    slug: 'audio-ringmod',
    icon: '💍',
    label: 'Ring Mod',
    tooltip: 'Multiplies two audio signals per channel. Sum and difference frequencies, no carriers — classic ring-mod sound.',
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
                const a = ctx.in('a')
                const b = ctx.in('b')
                return {
                    l: `(${a.l}) * (${b.l})`,
                    r: `(${a.r}) * (${b.r})`
                }
            }
        }
    },

    audioState: {}
})
