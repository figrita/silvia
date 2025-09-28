import {registerNode} from '../registry.js'

registerNode({
    slug: 'lerp',
    icon: '∝',
    label: 'Lerp',
    tooltip: 'Linear interpolation between A and B based on factor T. When T=0, output is A. When T=1, output is B.',

    input: {
        'a': {
            label: 'A',
            type: 'float',
            control: {default: 0, min: -10, max: 10, step: 0.01}
        },
        'b': {
            label: 'B',
            type: 'float',
            control: {default: 1, min: -10, max: 10, step: 0.01}
        },
        't': {
            label: 'T',
            type: 'float',
            control: {default: 0.5, min: 0, max: 1, step: 0.01}
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float a = ${this.getInput('a', cc)};
    float b = ${this.getInput('b', cc)};
    float t = ${this.getInput('t', cc)};
    return mix(a, b, t);
}`
            }
        }
    }
})