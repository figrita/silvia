import {registerNode} from '../registry.js'

registerNode({
    slug: 'number',
    icon: '🔢',
    label: 'Number',
    tooltip: 'Outputs a constant numeric value. Adjust with the slider control or connect to number inputs on other nodes.',
    input: {
        'value': {
            label: 'Value',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return ${this.getInput('value', cc)};
}`
            }
        }
    }
})