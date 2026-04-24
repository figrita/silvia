import {registerNode} from '../../registry.js'

/**
 * Clip — three flavors of amplitude limiting.
 *   • Soft  — tanh waveshaper. Smooth, "tube-like" rolloff at the top.
 *   • Hard  — straight clamp at ±threshold. Brick-wall, gritty.
 *   • Fold  — wavefolding. Anything past threshold gets reflected back,
 *             producing inharmonic overtones (West Coast / Buchla flavor).
 *
 * Drive scales the input before the shaper, so any mode can be pushed
 * harder without touching the source level.
 */
registerNode({
    slug: 'audio-clip',
    icon: '✂️',
    label: 'Clip',
    tooltip: 'Soft, hard, or wavefolding amplitude limiter. Drive sets pre-gain; threshold sets the limit.',
    workspaceType: 'audio',

    input: {
        'audio':     {label: 'Audio',     type: 'audio', control: null},
        'drive':     {label: 'Drive',     type: 'audio', control: {default: 1.0,  min: 0.1, max: 20, step: 0.01, logScale: true}},
        'threshold': {label: 'Threshold', type: 'audio', control: {default: 0.8,  min: 0.01, max: 1, step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){ return ctx.state('out') }
        }
    },

    options: {
        mode: {
            label: 'Mode',
            type: 'select',
            default: 'soft',
            choices: [
                {value: 'soft', name: 'Soft (tanh)'},
                {value: 'hard', name: 'Hard'},
                {value: 'fold', name: 'Fold'}
            ]
        }
    },

    audioState: { out: 0 },

    genAudioSetup(ctx){
        const audio = ctx.in('audio')
        const drive = ctx.in('drive')
        const thresh = ctx.in('threshold')
        const out = ctx.state('out')
        switch(ctx.option('mode')){
            case 'hard':
                ctx.line(`
                    const _x = (${audio}) * (${drive});
                    const _t = Math.max(0.001, ${thresh});
                    ${out} = _x > _t ? _t : (_x < -_t ? -_t : _x);
                `)
                break
            case 'fold':
                // Bounded reflection — at most 8 folds, plenty for any
                // reasonable drive setting.
                ctx.line(`
                    const _x = (${audio}) * (${drive});
                    const _t = Math.max(0.001, ${thresh});
                    let _y = _x;
                    for(let _k = 0; _k < 8 && (_y > _t || _y < -_t); _k++){
                        if(_y > _t) _y = 2 * _t - _y;
                        else _y = -2 * _t - _y;
                    }
                    ${out} = _y;
                `)
                break
            case 'soft':
            default:
                ctx.line(`
                    const _x = (${audio}) * (${drive});
                    const _t = Math.max(0.001, ${thresh});
                    ${out} = _t * Math.tanh(_x / _t);
                `)
        }
    }
})
