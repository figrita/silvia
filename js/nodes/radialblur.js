import {registerNode} from '../registry.js'

registerNode({
    slug: 'radialblur',
    icon: '💫',
    label: 'Radial Blur',
    tooltip: 'Blurs the image radially outward from a center point, creating a zoom or explosion effect.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null,
            samplingCost: '16'
        },
        'amount': {
            label: 'Amount',
            type: 'float',
            control: {default: 0.1, min: 0.0, max: 1.0, step: 0.001}
        },
        'centerX': {
            label: 'Center X',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01, unit: '⬓'}
        },
        'centerY': {
            label: 'Center Y',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01, unit: '⬓'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const amount = this.getInput('amount', cc)
                const centerX = this.getInput('centerX', cc)
                const centerY = this.getInput('centerY', cc)
                const inputCall = this.getInput('input', cc, 'uv')

                return `vec4 ${funcName}(vec2 uv) {
    vec2 center = vec2(${centerX}, ${centerY});
    vec2 dir = (uv - center) * ${amount};
    vec4 color = vec4(0.0);
    for (int i = 0; i < 16; i++) {
        float t = (float(i) / 15.0) - 0.5;
        vec2 sampleUV = uv + dir * t;
        color += ${inputCall.replace('uv', 'sampleUV')};
    }
    return color / 16.0;
}`
            }
        }
    }
})
