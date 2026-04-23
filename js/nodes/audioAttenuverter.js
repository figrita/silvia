import {registerNode} from '../registry.js'
/**
 * Attenuverter — out = in * scale + offset, per-sample. Negative scale
 * inverts; bias an LFO's ±1 swing into a ±5000 Hz cutoff spread around 2000 Hz,
 * or flip an envelope upside down, etc. Both knobs take CV themselves.
 */
registerNode({
    slug: 'audio-attenuverter',
    icon: '⚖️',
    label: 'Attenuverter',
    tooltip: 'Scale + offset a CV signal. Out = In × Scale + Offset, sample-accurate.',
    workspaceType: 'audio',

    input: {
        'input':  {label: 'In',     type: 'float', control: null},
        'scale':  {label: 'Scale',  type: 'float', control: {default: 1.0, min: -10, max: 10, step: 0.01}},
        'offset': {label: 'Offset', type: 'float', control: {default: 0.0, min: -5000, max: 5000, step: 0.01}}
    },

    output: {
        'out': {label: 'Out', type: 'float'}
    },

    audioState: {},

    genAudio(ctx){
        const i = ctx.in('input')
        const s = ctx.in('scale')
        const o = ctx.in('offset')
        return { out: `(${i}) * (${s}) + (${o})` }
    }
})
