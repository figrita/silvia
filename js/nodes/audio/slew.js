import {registerNode} from '../../registry.js'

/**
 * Slew — asymmetric slew limiter / portamento / glide. Smooths a CV
 * with separately tunable rise (input increasing) and fall (input
 * decreasing) time constants, processed independently per channel.
 * Useful for:
 *   • Glide between sequencer notes (rise = fall = 30–200 ms)
 *   • Smoothing a stepped LFO (audio-rate input → smooth lag)
 *   • One-pole low-pass on a CV (rise = fall, set the corner via 1/(2π·t))
 *
 * Times are τ values — 63% of the way to target after t seconds.
 */
registerNode({
    slug: 'audio-slew',
    icon: '📐',
    label: 'Slew',
    tooltip: 'Asymmetric slew limiter, per channel. Independent rise/fall time constants for glide, smoothing, and lag.',
    workspaceType: 'audio',

    input: {
        'input': {label: 'In',   type: 'audio', control: {default: 0.0, min: -10, max: 10, step: 0.01}},
        'rise':  {label: 'Rise', type: 'audio', control: {default: 0.05, min: 0.0001, max: 5, step: 0.001, unit: 's', logScale: true}},
        'fall':  {label: 'Fall', type: 'audio', control: {default: 0.05, min: 0.0001, max: 5, step: 0.001, unit: 's', logScale: true}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){ return {l: ctx.state('outL'), r: ctx.state('outR')} }
        }
    },

    audioState: { outL: 0, outR: 0 },

    genAudioSetup(ctx){
        const x = ctx.in('input')
        const rise = ctx.inL('rise')
        const fall = ctx.inL('fall')
        const outL = ctx.state('outL')
        const outR = ctx.state('outR')
        ctx.line(`
            const _dL = (${x.l}) - ${outL};
            const _dR = (${x.r}) - ${outR};
            const _tL = (_dL > 0) ? Math.max(0.0001, ${rise}) : Math.max(0.0001, ${fall});
            const _tR = (_dR > 0) ? Math.max(0.0001, ${rise}) : Math.max(0.0001, ${fall});
            const _kL = 1 - Math.exp(-1 / (sampleRate * _tL));
            const _kR = 1 - Math.exp(-1 / (sampleRate * _tR));
            ${outL} += _dL * _kL;
            ${outR} += _dR * _kR;
        `)
    }
})
