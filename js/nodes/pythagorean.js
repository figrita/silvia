import {registerNode} from '../registry.js'

registerNode({
    slug: 'pythagorean',
    icon: '📐',
    label: 'Pythagorean',
    tooltip: 'Calculates the hypotenuse using Pythagorean theorem: √(A² + B²). Useful for distance calculations from world coordinates.',

    input: {
        'a': {
            label: 'A',
            type: 'float',
            control: {default: 0, min: -10, max: 10, step: 0.01}
        },
        'b': {
            label: 'B',
            type: 'float',
            control: {default: 0, min: -10, max: 10, step: 0.01}
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
    return sqrt(a * a + b * b);
}`
            }
        }
    }
})