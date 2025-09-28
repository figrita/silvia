import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'colorshift',
    icon: '🧪',
    label: 'Color Shift',
    tooltip: 'HSV color adjustment tool. Shift hue (color wheel rotation), adjust saturation (color intensity), and modify value (brightness).',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'hue': {
            label: 'Hue Shift',
            type: 'float',
            control: {default: 0.0, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'saturation': {
            label: 'Saturation',
            type: 'float',
            control: {default: 1.0, min: 0, max: 2, step: 0.01}
        },
        'value': {
            label: 'Value',
            type: 'float',
            control: {default: 1.0, min: 0, max: 2, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.input.input.connection
                    ? this.getInput('input', cc)
                    : 'vec4(0.0, 0.0, 0.0, 1.0)' // Fallback to black
                const hue = this.getInput('hue', cc)
                const saturation = this.getInput('saturation', cc)
                const value = this.getInput('value', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};
    vec3 hsv = rgb2hsv(color.rgb);
    
    // Apply transformations
    hsv.x = mod(hsv.x + (${hue}) / 2.0, 1.0); // Hue shift (π-radians)
    hsv.y = clamp(hsv.y * ${saturation}, 0.0, 1.0); // Saturation multiply
    hsv.z = clamp(hsv.z * ${value}, 0.0, 1.0); // Value (brightness) multiply
    
    vec3 finalRgb = hsv2rgb(hsv);
    return vec4(finalRgb, color.a);
}`
            }
        }
    },
    // Declare the GLSL helper functions this node depends on.
    shaderUtils: [shaderUtils.RGB2HSV, shaderUtils.HSV2RGB]
})