import {registerNode} from '../registry.js'
import {audioRuntime} from '../audioRuntime.js'

/**
 * Noise — white, pink, or brown random source. Pink uses Paul Kellet's
 * three-stage economy filter (1/f spectrum, ~0.5 dB/octave error).
 * Brown is integrated white with a soft bound so DC drift can't run
 * away.
 *
 * Useful as a percussion source (gate a noise burst with an envelope),
 * a hi-hat ingredient (band-pass filter the white output), or a
 * texture under tonal material (low-passed pink).
 */
registerNode({
    slug: 'audio-noise',
    icon: '❄️',
    label: 'Noise',
    tooltip: 'Random source. White (flat spectrum), pink (1/f), or brown (1/f²).',
    workspaceType: 'audio',

    input: {
        'level': {label: 'Level', type: 'audio', control: {default: 0.5, min: 0, max: 2, step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){ return `${ctx.state('out')} * (${ctx.in('level')})` }
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
        out: 0,
        pinkB0: 0, pinkB1: 0, pinkB2: 0,
        brown: 0
    },

    genAudioSetup(ctx){
        const out = ctx.state('out')
        switch(ctx.option('type')){
            case 'pink': {
                const b0 = ctx.state('pinkB0')
                const b1 = ctx.state('pinkB1')
                const b2 = ctx.state('pinkB2')
                ctx.line(`
                    const _w = Math.random() * 2 - 1;
                    ${b0} = 0.99765 * ${b0} + _w * 0.0990460;
                    ${b1} = 0.96300 * ${b1} + _w * 0.2965164;
                    ${b2} = 0.57000 * ${b2} + _w * 1.0526913;
                    ${out} = (${b0} + ${b1} + ${b2} + _w * 0.1848) * 0.11;
                `)
                break
            }
            case 'brown': {
                const br = ctx.state('brown')
                ctx.line(`
                    ${br} = Math.max(-1, Math.min(1, ${br} + (Math.random() * 2 - 1) * 0.02));
                    ${out} = ${br} * 3.5;
                `)
                break
            }
            default:
                ctx.line(`${out} = Math.random() * 2 - 1;`)
        }
    },

    onOptionChange(){ audioRuntime.invalidate() }
})
