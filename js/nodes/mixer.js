import {registerNode} from '../registry.js'

registerNode({
    slug: 'mixer',
    icon: '🎚️',
    label: 'Mixer',
    tooltip: 'Fade between multiple color inputs.',
    input: {
        'deckA': {label: 'Deck A', type: 'color', control: null},
        'deckB': {label: 'Deck B', type: 'color', control: null},
        'fade': {
            label: 'Fade',
            type: 'float',
            range: '[0, 1]',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                // Get the GLSL for the two input visual chains (Deck A and Deck B)
                const deckA = this.getInput('deckA', cc)
                const deckB = this.getInput('deckB', cc)
                const fade = this.getInput('fade', cc)
                return `vec4 ${funcName}(vec2 uv) {
                    return mix(${deckA}, ${deckB}, ${fade});
                }`
            }
        }
    }
})