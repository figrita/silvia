import {registerNode} from '../../registry.js'

/**
 * Time Delay — pure delay-line primitive (NOT a guitar-pedal echo).
 * Output is "past-only" (reads from a ring buffer of previously written
 * samples), so it can sit in a feedback cycle without infinite
 * recursion. The compiler stops walking upstream at this node's output
 * and emits a tail step at the end of each loop iteration that
 * captures the current input into the buffer.
 *
 * Stereo: independent ring buffers per channel — bufL/bufR with their
 * own heads. Time and the read offset are mono CV (same delay length
 * on both sides), which keeps a stereo source phase-coherent through
 * the line. Modulating Time at audio rate gives chorus / flange /
 * vibrato effects.
 *
 * Time goes from a single sample (~21µs at 48kHz, useful for resonance
 * topologies) up to 2 seconds.
 *
 * For typical "echo with regen" use the Echo node, which has dry/wet
 * and feedback baked in. This node is the modular building block.
 */

const MAX_DELAY_SECONDS = 2.0

registerNode({
    slug: 'audio-delay',
    icon: '⏳',
    label: 'Time Delay',
    tooltip: 'Pure delay-line primitive, stereo. Past-only output is safe inside feedback cycles. For a guitar-pedal echo, use the Echo node.',
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
            genAudio(ctx){ return {l: ctx.state('curL'), r: ctx.state('curR')} }
        }
    },

    // bufL/bufR are declared as rings — the compiler emits the lazy alloc
    // (pow2-padded, bitmask-wrapped) and the head/mask state fields
    // automatically. After allocation, mergeState preserves the
    // buffer reference across recompiles, so the delay tail keeps
    // writing into the same physical buffers through graph edits.
    audioState: {
        bufL: {type: 'ring', seconds: MAX_DELAY_SECONDS},
        bufR: {type: 'ring', seconds: MAX_DELAY_SECONDS},
        curL: 0,
        curR: 0
    },

    genAudioSetup(ctx){
        const time = ctx.inL('time')
        const curL = ctx.state('curL')
        const curR = ctx.state('curR')
        const rL = ctx.ring('bufL')
        const rR = ctx.ring('bufR')
        ctx.line(`
            const _samp = Math.max(1, Math.min(${rL.length} - 1, Math.round((${time}) * sampleRate)));
            ${curL} = ${rL.read('_samp')};
            ${curR} = ${rR.read('_samp')};
        `)
    },

    genAudioTail(ctx){
        const a = ctx.in('audio')
        const rL = ctx.ring('bufL')
        const rR = ctx.ring('bufR')
        ctx.line(rL.push(a.l))
        ctx.line(rR.push(a.r))
    }
})
