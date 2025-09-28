import {registerNode} from '../registry.js'

registerNode({
    slug: 'invert',
    icon: '🔳',
    label: 'Invert',
    tooltip: 'Inverts colors (creates negative effect).',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'mix': {
            label: 'Mix',
            type: 'float',
            range: '[0, 1]',
            control: {default: 1.0, min: 0.0, max: 1.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)
                const mixFactor = this.getInput('mix', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};
    vec3 inverted_rgb = 1.0 - color.rgb;
    vec3 final_rgb = mix(color.rgb, inverted_rgb, ${mixFactor});
    return vec4(final_rgb, color.a);
}`
            }
        }
    }
})