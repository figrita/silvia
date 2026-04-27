import {registerNode} from '../../registry.js'

/**
 * Echo — guitar-pedal style echo with built-in dry/wet and feedback
 * regen. Self-contained: no manual feedback wiring required. Patch
 * "Mic → Echo → Synth Out" and crank Feedback for trailing repeats.
 *
 * Stereo: independent delay lines per channel (bufL/bufR with their own
 * heads). Each tap regenerates back into its own buffer, so a stereo
 * source preserves its image through the repeats. Time, feedback and
 * mix are mono CV, equally affecting both sides.
 *
 * Internally each side is a delay line whose write captures
 * (input + delayed * fb), so each tap regenerates back into the buffer.
 * The Mix knob blends dry input against the wet (delayed) signal at
 * the output.
 *
 * Feedback is clamped to 0.99 to prevent runaway, but values near 1.0
 * intentionally produce long ambient washes.
 */

const MAX_DELAY_SECONDS = 2.0

registerNode({
    slug: 'audio-echo',
    icon: '🪞',
    label: 'Echo',
    tooltip: 'Guitar-pedal echo with feedback regen and dry/wet mix, stereo. One node, no extra wiring needed.',
    workspaceType: 'audio',

    input: {
        'audio':    {label: 'Audio',    type: 'audio', control: null},
        'time':     {label: 'Time',     type: 'audio', control: {default: 0.3, min: 0.001, max: MAX_DELAY_SECONDS, step: 0.0001, unit: 's', logScale: true}},
        'feedback': {label: 'Feedback', type: 'audio', control: {default: 0.4, min: 0,     max: 0.99, step: 0.01}},
        'mix':      {label: 'Mix',      type: 'audio', control: {default: 0.4, min: 0,     max: 1,    step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                const a = ctx.in('audio')
                const mix = ctx.inL('mix')
                const curL = ctx.state('curL')
                const curR = ctx.state('curR')
                return {
                    l: `(${a.l}) * (1 - (${mix})) + (${curL}) * (${mix})`,
                    r: `(${a.r}) * (1 - (${mix})) + (${curR}) * (${mix})`
                }
            }
        }
    },

    audioState: {
        bufL: {type: 'ring', seconds: MAX_DELAY_SECONDS},
        bufR: {type: 'ring', seconds: MAX_DELAY_SECONDS},
        curL: 0,
        curR: 0
    },

    genAudioSetup(ctx){
        const a = ctx.in('audio')
        const time = ctx.inL('time')
        const fb   = ctx.inL('feedback')
        const curL = ctx.state('curL')
        const curR = ctx.state('curR')
        const rL = ctx.ring('bufL')
        const rR = ctx.ring('bufR')
        ctx.line(`
            const _samp = Math.max(1, Math.min(${rL.length} - 1, Math.round((${time}) * sampleRate)));
            const _fb = Math.max(0, Math.min(0.99, ${fb}));
            ${curL} = ${rL.read('_samp')};
            ${curR} = ${rR.read('_samp')};
            ${rL.push(`(${a.l}) + ${curL} * _fb`)}
            ${rR.push(`(${a.r}) + ${curR} * _fb`)}
        `)
    }
})
