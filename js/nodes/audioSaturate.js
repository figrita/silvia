import {registerNode} from '../registry.js'

/**
 * Saturate — pure tanh waveshaper. Stateless. With Drive at 1.0 the
 * output is the same as the input for small signals and gently rolls
 * off as the input approaches ±1. Higher drive pushes harder into the
 * curve, adding harmonic warmth before things get crunchy.
 *
 * Differs from Clip→Soft in that there is no threshold knob and no
 * normalization — the curve is always y = tanh(x · drive). For a
 * limiter, use Clip; for "warming," use this.
 */
registerNode({
    slug: 'audio-saturate',
    icon: '🟠',
    label: 'Saturate',
    tooltip: 'Tanh waveshaper. Adds harmonic warmth; pushes into soft-saturation as Drive increases.',
    workspaceType: 'audio',

    input: {
        'audio': {label: 'Audio', type: 'audio', control: null},
        'drive': {label: 'Drive', type: 'audio', control: {default: 1.5, min: 0.1, max: 20, step: 0.01, logScale: true}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                return `Math.tanh((${ctx.in('audio')}) * (${ctx.in('drive')}))`
            }
        }
    },

    audioState: {}
})
