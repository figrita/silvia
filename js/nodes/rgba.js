import {registerNode} from '../registry.js'

registerNode({
    slug: 'rgba',
    icon: '🪢',
    label: 'RGBA',
    tooltip: 'Combines four number inputs into a single RGBA color. Connect separate red, green, blue, and alpha values.',
    input: {
        'r': {
            label: 'R',
            type: 'float',
            range: '[0, 1]',
            control: {default: 0.0, min: 0, max: 1, step: 0.01}
        },
        'g': {
            label: 'G',
            type: 'float',
            range: '[0, 1]',
            control: {default: 0.0, min: 0, max: 1, step: 0.01}
        },
        'b': {
            label: 'B',
            type: 'float',
            range: '[0, 1]',
            control: {default: 0.0, min: 0, max: 1, step: 0.01}
        },
        'a': {
            label: 'A',
            type: 'float',
            range: '[0, 1]',
            control: {default: 1.0, min: 0, max: 1, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                // Get the GLSL code for each of the four float inputs.
                // This will either be a literal float or a function call to a connected node.
                const r = this.getInput('r', cc)
                const g = this.getInput('g', cc)
                const b = this.getInput('b', cc)
                const a = this.getInput('a', cc)

                // Construct a new vec4 color from the inputs.
                return `vec4 ${funcName}(vec2 uv) {
    return vec4(${r}, ${g}, ${b}, ${a});
}`
            }
        }
    }
})