import {registerNode} from '../../registry.js'

/**
 * Noise — white, pink, or brown random source. Stereo: L and R draw
 * independent random sequences with separate filter state, so the two
 * channels are decorrelated for a wide, full-field noise bed (mono
 * noise sounds narrow and centered; this opens it up).
 *
 * Pink uses Paul Kellet's three-stage economy filter (1/f spectrum,
 * ~0.5 dB/octave error). Brown is integrated white with a soft bound
 * so DC drift can't run away.
 *
 * Useful as a percussion source (gate a noise burst with an envelope),
 * a hi-hat ingredient (band-pass filter the white output), or a
 * texture under tonal material (low-passed pink).
 */
registerNode({
    slug: 'audio-noise',
    icon: '❄️',
    label: 'Noise',
    tooltip: 'Random source. White (flat spectrum), pink (1/f), or brown (1/f²). Stereo, decorrelated L/R.',
    workspaceType: 'audio',

    input: {
        'level': {label: 'Level', type: 'audio', control: {default: 0.5, min: 0, max: 2, step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                const lv = ctx.in('level')
                return {
                    l: `${ctx.state('outL')} * (${lv.l})`,
                    r: `${ctx.state('outR')} * (${lv.r})`
                }
            }
        }
    },

    options: {
        type: {
            label: 'Type',
            type: 'select',
            default: 'white',
            choices: [
                {value: 'white', name: 'White'},
                {value: 'pink',  name: 'Pink'},
                {value: 'brown', name: 'Brown'}
            ]
        }
    },

    audioState: {
        outL: 0, outR: 0,
        pinkB0L: 0, pinkB1L: 0, pinkB2L: 0,
        pinkB0R: 0, pinkB1R: 0, pinkB2R: 0,
        brownL: 0, brownR: 0
    },

    genAudioSetup(ctx){
        const outL = ctx.state('outL')
        const outR = ctx.state('outR')
        switch(ctx.option('type')){
            case 'pink': {
                const b0L = ctx.state('pinkB0L'), b1L = ctx.state('pinkB1L'), b2L = ctx.state('pinkB2L')
                const b0R = ctx.state('pinkB0R'), b1R = ctx.state('pinkB1R'), b2R = ctx.state('pinkB2R')
                ctx.line(`
                    const _wL = Math.random() * 2 - 1;
                    const _wR = Math.random() * 2 - 1;
                    ${b0L} = 0.99765 * ${b0L} + _wL * 0.0990460;
                    ${b1L} = 0.96300 * ${b1L} + _wL * 0.2965164;
                    ${b2L} = 0.57000 * ${b2L} + _wL * 1.0526913;
                    ${b0R} = 0.99765 * ${b0R} + _wR * 0.0990460;
                    ${b1R} = 0.96300 * ${b1R} + _wR * 0.2965164;
                    ${b2R} = 0.57000 * ${b2R} + _wR * 1.0526913;
                    ${outL} = (${b0L} + ${b1L} + ${b2L} + _wL * 0.1848) * 0.11;
                    ${outR} = (${b0R} + ${b1R} + ${b2R} + _wR * 0.1848) * 0.11;
                `)
                break
            }
            case 'brown': {
                const brL = ctx.state('brownL'), brR = ctx.state('brownR')
                ctx.line(`
                    ${brL} = Math.max(-1, Math.min(1, ${brL} + (Math.random() * 2 - 1) * 0.02));
                    ${brR} = Math.max(-1, Math.min(1, ${brR} + (Math.random() * 2 - 1) * 0.02));
                    ${outL} = ${brL} * 3.5;
                    ${outR} = ${brR} * 3.5;
                `)
                break
            }
            default:
                ctx.line(`
                    ${outL} = Math.random() * 2 - 1;
                    ${outR} = Math.random() * 2 - 1;
                `)
        }
    }
})
