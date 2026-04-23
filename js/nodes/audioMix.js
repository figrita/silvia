import {registerNode} from '../registry.js'

/**
 * Mix — sums two audio signals with independent gains. Stateless,
 * sample-accurate. Out = A·gainA + B·gainB.
 *
 * The bridge node for feedback patches: run A from your dry source, B
 * from a VCA fed by the delay's output, and the Mix output back into
 * the delay's input. Adjust gainB to set feedback amount.
 */
registerNode({
    slug: 'audio-mix',
    icon: '➕',
    label: 'Mix',
    tooltip: 'Sums two audio signals with independent gains. Out = A·gainA + B·gainB.',
    workspaceType: 'audio',

    input: {
        'a':     {label: 'A',     type: 'audio', control: null},
        'b':     {label: 'B',     type: 'audio', control: null},
        'gainA': {label: 'A Gain', type: 'audio', control: {default: 0.5, min: 0, max: 2, step: 0.01}},
        'gainB': {label: 'B Gain', type: 'audio', control: {default: 0.5, min: 0, max: 2, step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                return `(${ctx.in('a')}) * (${ctx.in('gainA')}) + (${ctx.in('b')}) * (${ctx.in('gainB')})`
            }
        }
    },

    audioState: {}
})
