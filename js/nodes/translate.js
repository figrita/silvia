import {registerNode} from '../registry.js'

registerNode({
    slug: 'translate',
    icon: '✥',
    label: 'Translate',
    tooltip: 'Moves/shifts the input image by X and Y amounts. Positive X moves image left, positive Y moves image down (UV sampling offset).',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null // This input must be connected
        },
        'x': {
            label: 'X Offset',
            type: 'float',
            control: {default: 0.0, min: -1.0, max: 1.0, step: 0.01, unit: '⬓'}
        },
        'y': {
            label: 'Y Offset',
            type: 'float',
            control: {default: 0.0, min: -1.0, max: 1.0, step: 0.01, unit: '⬓'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                // Get the GLSL for the X and Y float inputs.
                const x = this.getInput('x', cc)
                const y = this.getInput('y', cc)

                // Construct the GLSL function for this node.
                return `vec4 ${funcName}(vec2 uv) {
    vec2 translation = vec2(${x}, ${y});
    vec2 translatedUV = uv - translation;
    return ${this.getInput('input', cc, 'translatedUV')};
}`
            }
        }
    }
})