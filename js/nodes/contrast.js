import {registerNode} from '../registry.js'

registerNode({
    slug: 'contrast',
    icon: '🌗',
    label: 'Contrast',
    tooltip: 'Adjusts image contrast and brightness. Values above 1.0 increase contrast, below 1.0 decrease it.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null // This input must be connected
        },
        'contrast': {
            label: 'Contrast',
            type: 'float',
            control: {default: 1.0, min: 0, max: 3, step: 0.01}
        },
        'brightness': {
            label: 'Brightness',
            type: 'float',
            control: {default: 0.0, min: -1, max: 1, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)
                const contrast = this.getInput('contrast', cc)
                const brightness = this.getInput('brightness', cc)

                // Construct the GLSL function for this node.
                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};
    vec3 adjustedRgb = (color.rgb - 0.5) * ${contrast} + 0.5 + ${brightness};
    return vec4(clamp(adjustedRgb, 0.0, 1.0), color.a);
}`
            }
        }
    }
})