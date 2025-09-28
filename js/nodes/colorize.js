import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'colorize',
    icon: '🖌️',
    label: 'Colorize',
    tooltip: 'Applies color tinting to grayscale or color images with adjustable blend modes.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'tint': {
            label: 'Tint Color',
            type: 'color',
            control: {default: '#ff00ff'}
        },
        'amount': {
            label: 'Amount',
            type: 'float',
            control: {default: 0.5, min: 0, max: 1, step: 0.01}
        },
        'preserveLuminance': {
            label: 'Preserve Luminance',
            type: 'float',
            control: {default: 0.5, min: 0, max: 1, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)
                const tintColor = this.getInput('tint', cc)
                const amount = this.getInput('amount', cc)
                const preserveLum = this.getInput('preserveLuminance', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};
    vec4 tint = ${tintColor};
    float amt = ${amount};
    float preserveLum = ${preserveLum};
    
    // Calculate original luminance
    float originalLum = rgb2lum(color.rgb);
    
    // Convert to grayscale
    vec3 gray = vec3(originalLum);
    
    // Apply tint to grayscale
    vec3 tinted = gray * tint.rgb;
    
    // Mix between original color and tinted version
    vec3 result = mix(color.rgb, tinted, amt);
    
    // Optionally preserve original luminance
    float newLum = rgb2lum(result);
    float lumScale = originalLum / max(newLum, 0.001);
    result = mix(result, result * lumScale, preserveLum);
    
    return vec4(clamp(result, 0.0, 1.0), color.a);
}`
            }
        }
    },
    shaderUtils: [shaderUtils.RGB2LUM]
})