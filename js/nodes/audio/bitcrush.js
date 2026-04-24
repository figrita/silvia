import {registerNode} from '../../registry.js'

/**
 * Bitcrush — lo-fi degradation. Two independent axes:
 *   • Bits  — quantize amplitude to 2^bits steps (1 = square, 16 = clean).
 *   • Rate  — sample-rate reduction. 1.0 keeps every sample; 0.1 only
 *             updates the held output once every ~10 samples (≈ 4.8kHz
 *             effective at a 48kHz context).
 *
 * Combine for classic 8-bit Game Boy / Casio FZ aesthetics, or push
 * Bits to 1 for a square-ish noise generator out of any input.
 */
registerNode({
    slug: 'audio-bitcrush',
    icon: '📉',
    label: 'Bitcrush',
    tooltip: 'Lo-fi degradation: bit-depth reduction + sample-rate reduction. Both CV-modulatable.',
    workspaceType: 'audio',

    input: {
        'audio': {label: 'Audio', type: 'audio', control: null},
        'bits':  {label: 'Bits',  type: 'audio', control: {default: 8.0, min: 1.0, max: 16.0, step: 0.01}},
        'rate':  {label: 'Rate',  type: 'audio', control: {default: 0.5, min: 0.001, max: 1.0, step: 0.001, logScale: true}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){ return ctx.state('held') }
        }
    },

    audioState: {
        held: 0,
        counter: 0
    },

    genAudioSetup(ctx){
        const audio = ctx.in('audio')
        const bits = ctx.in('bits')
        const rate = ctx.in('rate')
        const held = ctx.state('held')
        const counter = ctx.state('counter')
        ctx.line(`
            ${counter} -= Math.max(0.001, ${rate});
            if(${counter} <= 0){
                const _q = Math.pow(2, Math.max(1, Math.min(16, ${bits})) - 1);
                ${held} = Math.round((${audio}) * _q) / _q;
                ${counter} += 1;
            }
        `)
    }
})
