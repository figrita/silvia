import {registerNode} from '../../registry.js'

/**
 * Bitcrush — lo-fi degradation, per channel. Two independent axes:
 *   • Bits  — quantize amplitude to 2^bits steps (1 = square, 16 = clean).
 *   • Rate  — sample-rate reduction. 1.0 keeps every sample; 0.1 only
 *             updates the held output once every ~10 samples (≈ 4.8kHz
 *             effective at a 48kHz context).
 *
 * The sample-rate counter is shared across channels so L and R latch
 * together — preserves stereo phase, keeps the lo-fi "pixel grid"
 * coherent across the field.
 *
 * Combine for classic 8-bit Game Boy / Casio FZ aesthetics, or push
 * Bits to 1 for a square-ish noise generator out of any input.
 */
registerNode({
    slug: 'audio-bitcrush',
    icon: '📉',
    label: 'Bitcrush',
    tooltip: 'Lo-fi degradation: bit-depth reduction + sample-rate reduction. Both CV-modulatable. Stereo, latched in lockstep.',
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
            genAudio(ctx){ return {l: ctx.state('heldL'), r: ctx.state('heldR')} }
        }
    },

    audioState: {
        heldL: 0,
        heldR: 0,
        counter: 0
    },

    genAudioSetup(ctx){
        const a = ctx.in('audio')
        const bits = ctx.inL('bits')
        const rate = ctx.inL('rate')
        const heldL = ctx.state('heldL')
        const heldR = ctx.state('heldR')
        const counter = ctx.state('counter')
        ctx.line(`
            ${counter} -= Math.max(0.001, ${rate});
            if(${counter} <= 0){
                const _q = Math.pow(2, Math.max(1, Math.min(16, ${bits})) - 1);
                ${heldL} = Math.round((${a.l}) * _q) / _q;
                ${heldR} = Math.round((${a.r}) * _q) / _q;
                ${counter} += 1;
            }
        `)
    }
})
