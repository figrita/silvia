import {registerNode} from '../registry.js'

registerNode({
    slug: 'wave',
    icon: '〰️',
    label: 'Wave',
    tooltip: 'Creates wave distortion effects. Adjust frequency for wave count, amplitude for distortion strength, speed for animation.',
    
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
        'angle': {
            label: 'Angle',
            type: 'float',
            control: {default: 0, min: -4, max: 4, step: 0.001, unit: 'π'}
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
        'axis': {
            label: 'Axis',
            type: 'select',
            default: 'horizontal',
            choices: [
                {value: 'horizontal', name: 'Horizontal'},
                {value: 'vertical', name: 'Vertical'},
                {value: 'both', name: 'Both'},
                {value: 'radial', name: 'Radial'}
            ]
        }
    },
    
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const waveform = this.getOption('waveform')
                const axis = this.getOption('axis')
                return `vec4 ${funcName}(vec2 uv) {
    float amplitude = ${this.getInput('amplitude', cc)};
    float frequency = ${this.getInput('frequency', cc)};
    float phase = ${this.getInput('phase', cc)} * PI;
    float angle = ${this.getInput('angle', cc)} * PI;
    
    // Rotate coordinates for angled waves
    float cs = cos(angle);
    float sn = sin(angle);
    vec2 rotUV = vec2(
        uv.x * cs - uv.y * sn,
        uv.x * sn + uv.y * cs
    );
    
    // Calculate wave position
    ${axis === 'radial' ? `
    float dist = length(uv);
    float wavePos = dist * frequency + phase;
    ` : axis === 'both' ? `
    float wavePos = (rotUV.x + rotUV.y) * frequency + phase;
    ` : axis === 'vertical' ? `
    float wavePos = rotUV.x * frequency + phase;
    ` : `
    float wavePos = rotUV.y * frequency + phase;
    `}
    
    // Calculate wave displacement
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
    
    // Apply displacement
    vec2 displacedUV = uv;
    ${axis === 'radial' ? `
    vec2 radialDir = normalize(uv);
    displacedUV += radialDir * wave * amplitude;
    ` : axis === 'both' ? `
    vec2 displaceDir = normalize(vec2(1.0, 1.0));
    float cs2 = cos(-angle);
    float sn2 = sin(-angle);
    displaceDir = vec2(
        displaceDir.x * cs2 - displaceDir.y * sn2,
        displaceDir.x * sn2 + displaceDir.y * cs2
    );
    displacedUV += displaceDir * wave * amplitude;
    ` : axis === 'vertical' ? `
    displacedUV.x += wave * amplitude;
    ` : `
    displacedUV.y += wave * amplitude;
    `}
    
    return ${this.getInput('input', cc, 'displacedUV')};
}`
            }
        }
    }
})