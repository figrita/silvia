import {registerNode} from '../../registry.js'

/**
 * Clip — three flavors of amplitude limiting, applied per channel.
 *   • Soft  — tanh waveshaper. Smooth, "tube-like" rolloff at the top.
 *   • Hard  — straight clamp at ±threshold. Brick-wall, gritty.
 *   • Fold  — wavefolding. Anything past threshold gets reflected back,
 *             producing inharmonic overtones (West Coast / Buchla flavor).
 *
 * Drive scales the input before the shaper, so any mode can be pushed
 * harder without touching the source level.
 *
 * State is doubled per channel (`outL`, `outR`) so L and R can carry
 * independent transformations without one stomping the other.
 */
registerNode({
    slug: 'audio-clip',
    icon: '✂️',
    label: 'Clip',
    tooltip: 'Soft, hard, or wavefolding amplitude limiter. Drive sets pre-gain; threshold sets the limit. Per channel.',
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
            genAudio(ctx){ return {l: ctx.state('outL'), r: ctx.state('outR')} }
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

    audioState: { outL: 0, outR: 0 },

    genAudioSetup(ctx){
        const a = ctx.in('audio')
        const d = ctx.in('drive')
        const t = ctx.in('threshold')
        const outL = ctx.state('outL')
        const outR = ctx.state('outR')
        switch(ctx.option('mode')){
            case 'hard':
                ctx.line(`
                    const _xL = (${a.l}) * (${d.l});
                    const _xR = (${a.r}) * (${d.r});
                    const _tL = Math.max(0.001, ${t.l});
                    const _tR = Math.max(0.001, ${t.r});
                    ${outL} = _xL > _tL ? _tL : (_xL < -_tL ? -_tL : _xL);
                    ${outR} = _xR > _tR ? _tR : (_xR < -_tR ? -_tR : _xR);
                `)
                break
            case 'fold':
                // Bounded reflection — at most 8 folds, plenty for any
                // reasonable drive setting.
                ctx.line(`
                    let _yL = (${a.l}) * (${d.l});
                    let _yR = (${a.r}) * (${d.r});
                    const _tL = Math.max(0.001, ${t.l});
                    const _tR = Math.max(0.001, ${t.r});
                    for(let _k = 0; _k < 8 && (_yL > _tL || _yL < -_tL); _k++){
                        if(_yL > _tL) _yL = 2 * _tL - _yL;
                        else _yL = -2 * _tL - _yL;
                    }
                    for(let _k = 0; _k < 8 && (_yR > _tR || _yR < -_tR); _k++){
                        if(_yR > _tR) _yR = 2 * _tR - _yR;
                        else _yR = -2 * _tR - _yR;
                    }
                    ${outL} = _yL;
                    ${outR} = _yR;
                `)
                break
            case 'soft':
            default:
                ctx.line(`
                    const _xL = (${a.l}) * (${d.l});
                    const _xR = (${a.r}) * (${d.r});
                    const _tL = Math.max(0.001, ${t.l});
                    const _tR = Math.max(0.001, ${t.r});
                    ${outL} = _tL * Math.tanh(_xL / _tL);
                    ${outR} = _tR * Math.tanh(_xR / _tR);
                `)
        }
    }
})
