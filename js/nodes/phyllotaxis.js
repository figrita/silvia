import {registerNode} from '../registry.js'

registerNode({
    slug: 'phyllotaxis',
    icon: '🌻',
    label: 'Phyllotaxis',
    tooltip: 'Generates natural spiral patterns found in plants like sunflower seed arrangements and pine cones.',
    input: {
        'count': {
            label: 'Count',
            type: 'float',
            control: {default: 100, min: 1, max: 500, step: 1}
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 0.9, min: 0.01, max: 2.0, step: 0.01, unit: '⬓'}
        },
        'angle': {
            label: 'Angle',
            type: 'float',
            control: {default: 0.764, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'dotSize': {
            label: 'Dot Size',
            type: 'float',
            control: {default: 0.06, min: 0.005, max: 0.2, step: 0.001, unit: '⬓'}
        },
        'bg': {
            label: 'Background Color',
            type: 'color',
            control: {default: '#ffe066ff'}
        },
        'fg': {
            label: 'Dot Color',
            type: 'color',
            control: {default: '#000000ff'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName) {
                // 2-unit tall, 0,0-centered worldspace
                // Place N dots in phyllotaxis spiral, draw as soft circles
                return `vec4 ${funcName}(vec2 uv) {
    vec2 pos = uv;
    float count = ${this.getInput('count', cc)};
    float maxR = ${this.getInput('radius', cc)};
    float angle = ${this.getInput('angle', cc)} * PI;
    float dotSize = ${this.getInput('dotSize', cc)};
    vec4 bg = ${this.getInput('bg', cc)};
    vec4 fg = ${this.getInput('fg', cc)};
    float minDist = 100.0;
    for (float i = 0.0; i < count; i += 1.0) {
        float t = i / max(count - 1.0, 1.0);
        float r = maxR * sqrt(t);
        float a = i * angle;
        vec2 p = r * vec2(cos(a), sin(a));
        float d = length(pos - p);
        minDist = min(minDist, d);
    }
    float dotAlpha = smoothstep(dotSize, dotSize * 0.5, minDist);
    return mix(bg, fg, dotAlpha);
}`
            }
        }
    },
    categories: ['geometry', 'pattern'],
    description: 'Phyllotaxis spiral pattern in 2-unit worldspace, 0,0-centered. Dots are colored and anti-aliased.'
})
