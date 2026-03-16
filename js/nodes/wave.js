import {registerNode} from '../registry.js'

registerNode({
    slug: 'wave',
    icon: '〰️',
    label: 'Wave',
    tooltip: 'Wave distortion. Rotation controls wave direction. Amplitude controls strength, frequency controls density, phase offsets the wave.',

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'amplitude': {
            label: 'Amplitude',
            type: 'float',
            control: {default: 0.1, min: 0, max: 1, step: 0.001}
        },
        'frequency': {
            label: 'Frequency',
            type: 'float',
            control: {default: 10, min: 0.1, max: 100, step: 0.1, unit: '/⬓'}
        },
        'phase': {
            label: 'Phase',
            type: 'float',
            control: {default: 0, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'rotation': {
            label: 'Rotation',
            type: 'float',
            control: {default: 0, min: -2, max: 2, step: 0.001, unit: 'π'}
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

    options: {
        'waveform': {
            label: 'Waveform',
            type: 'select',
            default: 'sine',
            choices: [
                {value: 'sine', name: 'Sine'},
                {value: 'triangle', name: 'Triangle'},
                {value: 'square', name: 'Square'},
                {value: 'sawtooth', name: 'Sawtooth'},
                {value: 'noise', name: 'Noise'}
            ]
        },
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'linear',
            choices: [
                {value: 'linear', name: 'Linear'},
                {value: 'radial', name: 'Radial'}
            ]
        },
        'displacement': {
            label: 'Displacement',
            type: 'select',
            default: 'wiggle',
            choices: [
                {value: 'wiggle', name: 'Wiggle'},
                {value: 'ripple', name: 'Ripple'}
            ]
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const waveform = this.getOption('waveform')
                const mode = this.getOption('mode')
                const displacement = this.getOption('displacement')
                return `vec4 ${funcName}(vec2 uv) {
    float amplitude = ${this.getInput('amplitude', cc)};
    float frequency = ${this.getInput('frequency', cc)};
    float phase = ${this.getInput('phase', cc)} * PI;
    float rotation = ${this.getInput('rotation', cc)} * PI;
    vec2 center = vec2(${this.getInput('centerX', cc)}, ${this.getInput('centerY', cc)});
    vec2 cuv = uv - center;

    ${mode === 'radial' ? `
    // Radial: wave based on distance from center
    float wavePos = length(cuv) * frequency + phase;
    ` : `
    // Linear: rotate UV, sample along Y, displace along Y, rotate back
    // At rotation=0 wave fronts are horizontal (displacement is vertical)
    // Rotation spins the whole pattern
    float cs = cos(rotation);
    float sn = sin(rotation);
    vec2 rotUV = vec2(
        cuv.x * cs + cuv.y * sn,
       -cuv.x * sn + cuv.y * cs
    );
    float wavePos = rotUV.y * frequency + phase;
    `}

    // Evaluate waveform
    float wave;
    ${waveform === 'triangle' ? `
    wave = 2.0 * abs(mod(wavePos / PI, 2.0) - 1.0) - 1.0;
    ` : waveform === 'square' ? `
    wave = sign(sin(wavePos));
    ` : waveform === 'sawtooth' ? `
    wave = 2.0 * fract(wavePos / (2.0 * PI)) - 1.0;
    ` : waveform === 'noise' ? `
    wave = fract(sin(wavePos * 12.9898) * 43758.5453) * 2.0 - 1.0;
    ` : `
    wave = sin(wavePos);
    `}

    // Displace
    vec2 displacedUV;
    ${mode === 'radial' ? (displacement === 'wiggle' ? `
    // Radial wiggle: displace tangentially (perpendicular to radial direction)
    vec2 radialDir = length(cuv) > 0.0 ? normalize(cuv) : vec2(0.0);
    vec2 tangentDir = vec2(-radialDir.y, radialDir.x);
    displacedUV = uv + tangentDir * wave * amplitude;
    ` : `
    // Radial ripple: displace along radial direction (zoom in/out with distance)
    vec2 radialDir = length(cuv) > 0.0 ? normalize(cuv) : vec2(0.0);
    displacedUV = uv + radialDir * wave * amplitude;
    `) : (displacement === 'wiggle' ? `
    // Wiggle: displace along X in rotated space (perpendicular to wave direction)
    vec2 displaced = vec2(rotUV.x + wave * amplitude, rotUV.y);
    displacedUV = vec2(
        displaced.x * cs - displaced.y * sn,
        displaced.x * sn + displaced.y * cs
    ) + center;
    ` : `
    // Ripple: displace along Y in rotated space (parallel to wave direction)
    vec2 displaced = vec2(rotUV.x, rotUV.y + wave * amplitude);
    displacedUV = vec2(
        displaced.x * cs - displaced.y * sn,
        displaced.x * sn + displaced.y * cs
    ) + center;
    `)}

    return ${this.getInput('input', cc, 'displacedUV')};
}`
            }
        }
    }
})