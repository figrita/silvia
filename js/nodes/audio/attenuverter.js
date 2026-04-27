import {registerNode} from '../../registry.js'
/**
 * Attenuverter — out = in * scale + offset, per-sample, per-channel.
 * Negative scale inverts; bias an LFO's ±1 swing into a ±5000 Hz cutoff
 * spread around 2000 Hz, or flip an envelope upside down, etc. Both
 * knobs take CV themselves.
 *
 * Stateless. Stereo: each channel is shaped independently by the matching
 * channel of scale and offset. With mono knobs/CV the same transform
 * lands on both sides.
 */
registerNode({
    slug: 'audio-attenuverter',
    icon: '⚖️',
    label: 'Attenuverter',
    tooltip: 'Scale + offset a CV signal per channel. Out = In × Scale + Offset, sample-accurate.',
    workspaceType: 'audio',

    input: {
        'input':  {label: 'In',     type: 'audio', control: null},
        'scale':  {label: 'Scale',  type: 'audio', control: {default: 1.0, min: -10, max: 10, step: 0.01}},
        'offset': {label: 'Offset', type: 'audio', control: {default: 0.0, min: -5000, max: 5000, step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                const x = ctx.in('input')
                const s = ctx.in('scale')
                const o = ctx.in('offset')
                return {
                    l: `(${x.l}) * (${s.l}) + (${o.l})`,
                    r: `(${x.r}) * (${s.r}) + (${o.r})`
                }
            }
        }
    },

    audioState: {}
})
