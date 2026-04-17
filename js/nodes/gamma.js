import {registerNode} from '../registry.js'

registerNode({
    slug: 'gamma',
    icon: '☀️',
    label: 'Gamma',
    tooltip: 'Applies a gamma power curve to the image. Values above 1.0 brighten midtones, below 1.0 darken them. Alpha is unaffected.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'gamma': {
            label: 'Gamma',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 5.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)
                const gamma = this.getInput('gamma', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};
    vec3 corrected = pow(max(color.rgb, 0.0), vec3(1.0 / max(${gamma}, 0.0001)));
    return vec4(corrected, color.a);
}`
            }
        }
    }
})
