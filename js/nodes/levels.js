import {registerNode} from '../registry.js'

registerNode({
    slug: 'levels',
    icon: '📊',
    label: 'Levels',
    tooltip: 'Remaps the tonal range of the image. Input levels clip and stretch the incoming range; output levels set the target black and white points.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'inBlack': {
            label: 'In Black',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 0.001}
        },
        'inWhite': {
            label: 'In White',
            type: 'float',
            control: {default: 1.0, min: 0.0, max: 1.0, step: 0.001}
        },
        'gamma': {
            label: 'Midtones',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 5.0, step: 0.01}
        },
        'outBlack': {
            label: 'Out Black',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 0.001}
        },
        'outWhite': {
            label: 'Out White',
            type: 'float',
            control: {default: 1.0, min: 0.0, max: 1.0, step: 0.001}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)
                const inBlack = this.getInput('inBlack', cc)
                const inWhite = this.getInput('inWhite', cc)
                const gamma = this.getInput('gamma', cc)
                const outBlack = this.getInput('outBlack', cc)
                const outWhite = this.getInput('outWhite', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};
    float inRange = max(${inWhite} - ${inBlack}, 0.0001);
    vec3 t = clamp((color.rgb - ${inBlack}) / inRange, 0.0, 1.0);
    t = pow(t, vec3(1.0 / max(${gamma}, 0.0001)));
    vec3 result = ${outBlack} + t * (${outWhite} - ${outBlack});
    return vec4(result, color.a);
}`
            }
        }
    }
})
