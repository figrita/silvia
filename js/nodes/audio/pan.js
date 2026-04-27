import {registerNode} from '../../registry.js'

/**
 * Pan — constant-power stereo panning of a (typically mono) source.
 *
 * Collapses the input to mono ((L + R) / 2), then redistributes it across
 * L and R using equal-power gains: gainL = cos(t·π/2), gainR = sin(t·π/2),
 * where t = (pan + 1) / 2 maps the bipolar control to [0, 1]. At pan = 0
 * the signal sits dead-centre at -3 dB on each side (the natural sum
 * loudness for a uncorrelated stereo source); pan = ±1 hard-routes to
 * one side.
 *
 * Pan is mono CV, smoothed with a longer-than-default τ to keep dial
 * sweeps click-free even at extreme settings.
 */
registerNode({
    slug: 'audio-pan',
    icon: '⇄',
    label: 'Pan',
    tooltip: 'Constant-power stereo pan. Collapses input to mono and redistributes across L/R via equal-power curves. Pan in [-1, +1].',
    workspaceType: 'audio',

    input: {
        'audio': {label: 'Audio', type: 'audio', control: null},
        'pan':   {label: 'Pan',   type: 'audio', control: {default: 0, min: -1, max: 1, step: 0.001, smoothMs: 15}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                return {l: ctx.state('outL'), r: ctx.state('outR')}
            }
        }
    },

    audioState: { outL: 0, outR: 0 },

    genAudioSetup(ctx){
        const a = ctx.in('audio')
        const pan = ctx.inL('pan')
        ctx.line(`
            const _mono = ((${a.l}) + (${a.r})) * 0.5;
            const _t = ((${pan}) + 1) * 0.5;
            const _angle = _t * HALF_PI;
            ${ctx.state('outL')} = _mono * Math.cos(_angle);
            ${ctx.state('outR')} = _mono * Math.sin(_angle);
        `)
    }
})
