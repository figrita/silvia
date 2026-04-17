import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'saturate',
    icon: '🧂',
    label: 'Saturate',
    tooltip: 'Multiplies the saturation of an input color. 0 = fully desaturated (grayscale), 1 = unchanged, >1 = hypersaturated.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'amount': {
            label: 'Amount',
            type: 'float',
            control: {default: 1.0, min: 0, max: 2, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)
                const amount = this.getInput('amount', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};
    vec3 hsv = rgb2hsv(color.rgb);
    hsv.y = clamp(hsv.y * ${amount}, 0.0, 1.0);
    return vec4(hsv2rgb(hsv), color.a);
}`
            }
        }
    },
    shaderUtils: [shaderUtils.RGB2HSV, shaderUtils.HSV2RGB]
})
