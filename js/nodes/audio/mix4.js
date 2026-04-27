import {registerNode} from '../../registry.js'

/**
 * Mix 4 — sums four audio signals with independent gains. Stateless,
 * stereo per channel. Out = A·gA + B·gB + C·gC + D·gD on each side.
 *
 * For just two signals use the simpler Mix node. Use this when chaining
 * multiple oscillators into a single voice, summing percussion layers,
 * or building a passive multi-tap delay (Mix 4 fed by four delays at
 * different times).
 */
registerNode({
    slug: 'audio-mix4',
    icon: '🟰',
    label: 'Mix 4',
    tooltip: 'Sums four audio signals with independent gains, per channel. Out = A·gA + B·gB + C·gC + D·gD.',
    workspaceType: 'audio',

    input: {
        'a': {label: 'A', type: 'audio', control: null},
        'b': {label: 'B', type: 'audio', control: null},
        'c': {label: 'C', type: 'audio', control: null},
        'd': {label: 'D', type: 'audio', control: null},
        'gainA': {label: 'A Gain', type: 'audio', control: {default: 0.25, min: 0, max: 2, step: 0.01}},
        'gainB': {label: 'B Gain', type: 'audio', control: {default: 0.25, min: 0, max: 2, step: 0.01}},
        'gainC': {label: 'C Gain', type: 'audio', control: {default: 0.25, min: 0, max: 2, step: 0.01}},
        'gainD': {label: 'D Gain', type: 'audio', control: {default: 0.25, min: 0, max: 2, step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                const a = ctx.in('a'),  b = ctx.in('b')
                const c = ctx.in('c'),  d = ctx.in('d')
                const gA = ctx.in('gainA'), gB = ctx.in('gainB')
                const gC = ctx.in('gainC'), gD = ctx.in('gainD')
                return {
                    l: `(${a.l}) * (${gA.l}) + (${b.l}) * (${gB.l}) + (${c.l}) * (${gC.l}) + (${d.l}) * (${gD.l})`,
                    r: `(${a.r}) * (${gA.r}) + (${b.r}) * (${gB.r}) + (${c.r}) * (${gC.r}) + (${d.r}) * (${gD.r})`
                }
            }
        }
    },

    audioState: {}
})
