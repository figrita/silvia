import {registerNode} from '../registry.js'

registerNode({
    slug: 'luminosity',
    icon: '🕯️',
    label: 'Luminosity',
    tooltip: 'Extracts brightness information from color input. Outputs perceptually-weighted luminance as a number value.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    vec4 color = ${this.getInput('input', cc)};
    // Standard sRGB luminosity formula
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}`
            }
        }
    }
})