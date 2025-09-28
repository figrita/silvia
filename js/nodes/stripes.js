import {registerNode} from '../registry.js'

registerNode({
    slug: 'stripes',
    icon: '💈',
    label: 'Stripes',
    tooltip: 'Generates rotating stripe patterns with adjustable phase, frequency and rotation.',
    input: {
        'frequency': {
            label: 'Frequency',
            type: 'float',
            control: {default: 8.0, min: 1, max: 64, step: 1, unit: '/⬓'}
        },
        'phase': {
            label: 'Phase',
            type: 'float',
            control: {default: 0.50, min: 0, max: 1, step: 0.01}
        },
        'rotation': {
            label: 'Rotation',
            type: 'float',
            control: {default: 0.0, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'color1': {
            label: 'Color 1',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'color2': {
            label: 'Color 2',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'smoothing': {
            label: 'Smoothing',
            type: 'float',
            control: {default: 0.01, min: 0, max: 1, step: 0.001, 'log-scale': true}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    float freq = ${this.getInput('frequency', cc)};
    float phase = ${this.getInput('phase', cc)};
    float rot = ${this.getInput('rotation', cc)} * PI;
    vec4 c1 = ${this.getInput('color1', cc)};
    vec4 c2 = ${this.getInput('color2', cc)};
    float smoothing = ${this.getInput('smoothing', cc)};

    // Center UV coordinates
    vec2 centered_uv = uv - 0.5;

    // Apply rotation
    vec2 rotated_uv = vec2(
        centered_uv.x * cos(rot) - centered_uv.y * sin(rot),
        centered_uv.x * sin(rot) + centered_uv.y * cos(rot)
    );

    // Generate stripes using modulo pattern with phase control
    float stripe_pos = (rotated_uv.x + 0.5) * freq;
    float stripe_cycle = mod(stripe_pos, 1.0);

    // Center-out stripe width control using phase with user-controllable smoothing
    float half_phase = phase * 0.5;
    float edge_width = smoothing * freq * 0.05; // Scale smoothing based on frequency
    float stripe_mask = smoothstep(0.5 - half_phase - edge_width, 0.5 - half_phase + edge_width, stripe_cycle) *
                       (1.0 - smoothstep(0.5 + half_phase - edge_width, 0.5 + half_phase + edge_width, stripe_cycle));

    return mix(c2, c1, stripe_mask);
}`
            }
        }
    }
})