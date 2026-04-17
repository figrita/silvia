import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'vibrance',
    icon: '✨',
    label: 'Vibrance',
    tooltip: 'Boosts saturation of muted colors while protecting already-saturated areas. Unlike Saturate, vibrance is gentle on skin tones and vivid colors.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'amount': {
            label: 'Amount',
            type: 'float',
            control: {default: 0.0, min: -1.0, max: 1.0, step: 0.01}
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
    // Positive amount boosts dull colors more; negative pulls vivid colors down more
    float weight = ${amount} >= 0.0 ? (1.0 - hsv.y) : hsv.y;
    hsv.y = clamp(hsv.y + ${amount} * weight, 0.0, 1.0);
    return vec4(hsv2rgb(hsv), color.a);
}`
            }
        }
    },
    shaderUtils: [shaderUtils.RGB2HSV, shaderUtils.HSV2RGB]
})
