import {registerNode} from '../../registry.js'

/**
 * Mix 4 — sums four audio signals with independent gains. Stateless.
 * Out = A·gA + B·gB + C·gC + D·gD.
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
    tooltip: 'Sums four audio signals with independent gains. Out = A·gA + B·gB + C·gC + D·gD.',
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
                return `(${ctx.in('a')}) * (${ctx.in('gainA')}) + ` +
                       `(${ctx.in('b')}) * (${ctx.in('gainB')}) + ` +
                       `(${ctx.in('c')}) * (${ctx.in('gainC')}) + ` +
                       `(${ctx.in('d')}) * (${ctx.in('gainD')})`
            }
        }
    },

    audioState: {}
})
