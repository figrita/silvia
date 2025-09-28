import {registerNode} from '../registry.js'

registerNode({
    slug: 'chromaticaberration',
    icon: '🔭',
    label: 'Chromatic Aberration',
    tooltip: 'Creates chromatic aberration effect by separating RGB channels with configurable offset and direction. Simulates lens distortion found in optical systems.',

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'offset': {
            label: 'Offset',
            type: 'float',
            control: {default: 0.01, min: 0, max: 0.1, step: 0.001}
        },
        'angle': {
            label: 'Angle',
            type: 'float',
            control: {default: 0, min: -4, max: 4, step: 0.001, unit: 'π'}
        }
    },

    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'radial',
            choices: [
                {value: 'radial', name: 'Radial'},
                {value: 'linear', name: 'Linear'},
                {value: 'barrel', name: 'Barrel Distortion'}
            ]
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const mode = this.getOption('mode')
                return `vec4 ${funcName}(vec2 uv) {
    vec4 inputColor = ${this.getInput('input', cc, 'uv')};
    float offset = ${this.getInput('offset', cc)};
    float angle = ${this.getInput('angle', cc)} * PI;

    ${mode === 'radial' ? `
    // Radial chromatic aberration - stronger at edges
    vec2 center = vec2(0.5);
    vec2 toCenter = uv - center;
    float dist = length(toCenter);

    // Calculate offset direction (outward from center)
    vec2 offsetDir = normalize(toCenter);
    if (dist < 0.001) offsetDir = vec2(1.0, 0.0); // Prevent division by zero

    // Rotate the offset direction by the angle
    vec2 rotatedDir = vec2(
        offsetDir.x * cos(angle) - offsetDir.y * sin(angle),
        offsetDir.x * sin(angle) + offsetDir.y * cos(angle)
    );

    // Apply distance-based scaling
    float scaledOffset = offset * dist;

    // Sample RGB channels with different offsets
    float r = ${this.getInput('input', cc, 'uv - rotatedDir * scaledOffset')}.r;
    float g = ${this.getInput('input', cc, 'uv')}.g;
    float b = ${this.getInput('input', cc, 'uv + rotatedDir * scaledOffset')}.b;

    return vec4(r, g, b, inputColor.a);
    ` : mode === 'linear' ? `
    // Linear chromatic aberration in specified direction
    vec2 offsetDir = vec2(cos(angle), sin(angle));

    // Sample RGB channels with linear offsets
    float r = ${this.getInput('input', cc, 'uv - offsetDir * offset')}.r;
    float g = ${this.getInput('input', cc, 'uv')}.g;
    float b = ${this.getInput('input', cc, 'uv + offsetDir * offset')}.b;

    return vec4(r, g, b, inputColor.a);
    ` : `
    // Barrel distortion chromatic aberration
    vec2 center = vec2(0.5);
    vec2 toCenter = uv - center;

    // Barrel distortion coefficients for each channel
    float k_r = 1.0 + offset * 0.5;
    float k_g = 1.0;
    float k_b = 1.0 - offset * 0.5;

    // Apply barrel distortion to each channel
    vec2 uv_r = center + toCenter * k_r;
    vec2 uv_g = center + toCenter * k_g;
    vec2 uv_b = center + toCenter * k_b;

    float r = ${this.getInput('input', cc, 'uv_r')}.r;
    float g = ${this.getInput('input', cc, 'uv_g')}.g;
    float b = ${this.getInput('input', cc, 'uv_b')}.b;

    return vec4(r, g, b, inputColor.a);
    `}
}`
            }
        }
    }
})