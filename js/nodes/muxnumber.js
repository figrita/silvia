import {registerNode} from '../registry.js'

registerNode({
    slug: 'muxnumber',
    icon: '👉',
    label: 'Mux (Number)',
    tooltip: 'Selects between 4 color inputs based on a number input (0-3, wraps around).',

    input: {
        'input0': {label: 'Input 1', type: 'color', control: {default: '#ff0000ff'}},
        'input1': {label: 'Input 2', type: 'color', control: {default: '#00ff00ff'}},
        'input2': {label: 'Input 3', type: 'color', control: {default: '#0000ffff'}},
        'input3': {label: 'Input 4', type: 'color', control: {default: '#ffff00ff'}},
        'select': {
            label: 'Select',
            type: 'float',
            range: '[0, 3]',
            control: {default: 0, min: 0, max: 3, step: 1}
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName) {
                return `vec4 ${funcName}(vec2 uv) {
    int channel = int(mod(floor(${this.getInput('select', cc)}), 4.0));
    if (channel == 0) return ${this.getInput('input0', cc)};
    if (channel == 1) return ${this.getInput('input1', cc)};
    if (channel == 2) return ${this.getInput('input2', cc)};
    return ${this.getInput('input3', cc)};
}`
            }
        }
    }
})