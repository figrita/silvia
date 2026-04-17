import {registerNode} from '../registry.js'

registerNode({
    slug: 'vignette',
    icon: '🔦',
    label: 'Vignette',
    tooltip: 'Darkens or brightens the edges of the image. Strength controls intensity, radius controls where the effect begins.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'strength': {
            label: 'Strength',
            type: 'float',
            control: {default: 0.8, min: -2.0, max: 2.0, step: 0.01}
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 0.8, min: 0.0, max: 3.0, step: 0.01, unit: '⬓'}
        },
        'softness': {
            label: 'Softness',
            type: 'float',
            control: {default: 0.5, min: 0.01, max: 2.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)
                const strength = this.getInput('strength', cc)
                const radius = this.getInput('radius', cc)
                const softness = this.getInput('softness', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};
    float d = length(uv);
    float vignette = 1.0 - smoothstep(${radius} - ${softness}, ${radius} + ${softness}, d) * ${strength};
    return vec4(color.rgb * vignette, color.a);
}`
            }
        }
    }
})
