import {registerNode} from '../registry.js'

registerNode({
    slug: 'smoothstep',
    icon: '🪜',
    label: 'Smoothstep',
    tooltip: 'Hermite interpolation between two edges. Returns 0 below Edge A, 1 above Edge B, and a smooth curve in between. Essential for soft masks, easing curves, and shaping signals.',

    input: {
        'input': {
            label: 'Input',
            type: 'float',
            control: {default: 0.5, min: -1, max: 1, step: 0.01}
        },
        'edgeA': {
            label: 'Edge A',
            type: 'float',
            control: {default: 0, min: -1, max: 1, step: 0.01}
        },
        'edgeB': {
            label: 'Edge B',
            type: 'float',
            control: {default: 1, min: -1, max: 1, step: 0.01}
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float x = ${this.getInput('input', cc)};
    float a = ${this.getInput('edgeA', cc)};
    float b = ${this.getInput('edgeB', cc)};
    return smoothstep(a, b, x);
}`
            }
        }
    }
})
