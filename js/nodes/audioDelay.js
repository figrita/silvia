import {registerNode} from '../registry.js'

/**
 * Time Delay — pure delay-line primitive (NOT a guitar-pedal echo).
 * Output is "past-only" (reads from a ring buffer of previously written
 * samples), so it can sit in a feedback cycle without infinite
 * recursion. The compiler stops walking upstream at this node's output
 * and emits a tail step at the end of each loop iteration that
 * captures the current input into the buffer.
 *
 * Time goes from a single sample (~21µs at 48kHz, useful for resonance
 * topologies) up to 2 seconds. Modulating Time at audio rate gives
 * chorus / flange / vibrato effects.
 *
 * For typical "echo with regen" use the Echo node, which has dry/wet
 * and feedback baked in. This node is the modular building block.
 */

const MAX_DELAY_SECONDS = 2.0

registerNode({
    slug: 'audio-delay',
    icon: '⏳',
    label: 'Time Delay',
    tooltip: 'Pure delay-line primitive. Past-only output is safe inside feedback cycles. For a guitar-pedal echo, use the Echo node.',
    workspaceType: 'audio',

    input: {
        'audio': {label: 'Audio', type: 'audio', control: null},
        'time':  {label: 'Time',  type: 'audio', control: {default: 0.25, min: 0.0001, max: MAX_DELAY_SECONDS, step: 0.0001, unit: 's', logScale: true}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            feedback: true,
            genAudio(ctx){ return ctx.state('cur') }
        }
    },

    // buf is allocated lazily inside the worklet on first sample; it
    // can't live in audioState directly because deepClone doesn't
    // handle Float32Array. After allocation, mergeState preserves the
    // reference across recompiles, so the delay tail keeps writing
    // into the same physical buffer through graph edits.
    audioState: {
        buf: null,
        head: 0,
        cur: 0
    },

    genAudioSetup(ctx){
        const time = ctx.in('time')
        const buf  = ctx.state('buf')
        const head = ctx.state('head')
        const cur  = ctx.state('cur')
        ctx.line(`
            if(!${buf}) ${buf} = new Float32Array(Math.ceil(${MAX_DELAY_SECONDS} * sampleRate) + 1);
            const _len = ${buf}.length;
            const _samp = Math.max(1, Math.min(_len - 1, Math.round((${time}) * sampleRate)));
            ${cur} = ${buf}[(${head} - _samp + _len) % _len];
        `)
    },

    genAudioTail(ctx){
        const audio = ctx.in('audio')
        const buf   = ctx.state('buf')
        const head  = ctx.state('head')
        ctx.line(`
            ${buf}[${head}] = (${audio});
            ${head} = (${head} + 1) % ${buf}.length;
        `)
    }
})
