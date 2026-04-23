import {registerNode} from '../registry.js'

/**
 * Echo — guitar-pedal style echo with built-in dry/wet and feedback
 * regen. Self-contained: no manual feedback wiring required. Patch
 * "Mic → Echo → Synth Out" and crank Feedback for trailing repeats.
 *
 * Internally a delay line whose write captures (input + delayed * fb),
 * so each tap regenerates back into the buffer. The Mix knob blends
 * dry input against the wet (delayed) signal at the output.
 *
 * Feedback is clamped to 0.99 to prevent runaway, but values near 1.0
 * intentionally produce long ambient washes.
 */

const MAX_DELAY_SECONDS = 2.0

registerNode({
    slug: 'audio-echo',
    icon: '🪞',
    label: 'Echo',
    tooltip: 'Guitar-pedal echo with feedback regen and dry/wet mix. One node, no extra wiring needed.',
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
                const audio = ctx.in('audio')
                const mix = ctx.in('mix')
                const cur = ctx.state('cur')
                return `(${audio}) * (1 - (${mix})) + (${cur}) * (${mix})`
            }
        }
    },

    audioState: {
        buf: null,
        head: 0,
        cur: 0
    },

    genAudioSetup(ctx){
        const audio = ctx.in('audio')
        const time  = ctx.in('time')
        const fb    = ctx.in('feedback')
        const buf   = ctx.state('buf')
        const head  = ctx.state('head')
        const cur   = ctx.state('cur')
        ctx.line(`
            if(!${buf}) ${buf} = new Float32Array(Math.ceil(${MAX_DELAY_SECONDS} * sampleRate) + 1);
            const _len = ${buf}.length;
            const _samp = Math.max(1, Math.min(_len - 1, Math.round((${time}) * sampleRate)));
            ${cur} = ${buf}[(${head} - _samp + _len) % _len];
            ${buf}[${head}] = (${audio}) + ${cur} * Math.max(0, Math.min(0.99, ${fb}));
            ${head} = (${head} + 1) % _len;
        `)
    }
})
