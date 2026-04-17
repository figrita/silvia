import {registerNode} from '../registry.js'

registerNode({
    slug: 'motionblur',
    icon: '💨',
    label: 'Motion Blur',
    tooltip: 'Blurs the image along a direction vector, simulating camera or object motion.',
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
            control: {default: 10.0, min: 0.0, max: 100.0, step: 0.1}
        },
        'angle': {
            label: 'Angle',
            type: 'float',
            control: {default: 0.0, min: -4.0, max: 4.0, step: 0.001, unit: 'π'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const amount = this.getInput('amount', cc)
                const angle = this.getInput('angle', cc)
                const inputCall = this.getInput('input', cc, 'uv')

                return `vec4 ${funcName}(vec2 uv) {
    float a = ${angle} * PI;
    vec2 dir = vec2(cos(a), sin(a)) * ${amount} / u_resolution;
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
