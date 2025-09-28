import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'fractalnoise',
    icon: '🏔️',
    label: 'Fractal Noise',
    tooltip: 'Fractal Brownian Motion - layers multiple noise octaves for complex natural textures.',
    
    shaderUtils: [shaderUtils.SIMPLEX3D],
    
    input: {
        'foreground': {
            label: 'Foreground',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'background': {
            label: 'Background',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'scale': {
            label: 'Scale',
            type: 'float',
            control: {default: 5, min: 0.1, max: 50, step: 0.1}
        },
        'timeSpeed': {
            label: 'Time Speed',
            type: 'float',
            control: {default: 0, min: 0, max: 5, step: 0.01}
        },
        'octaves': {
            label: 'Octaves',
            type: 'float',
            control: {default: 4, min: 1, max: 8, step: 1}
        },
        'lacunarity': {
            label: 'Lacunarity',
            type: 'float',
            control: {default: 2, min: 1, max: 4, step: 0.1}
        },
        'gain': {
            label: 'Gain',
            type: 'float',
            control: {default: 0.5, min: 0.1, max: 1, step: 0.01}
        },
        'contrast': {
            label: 'Contrast',
            type: 'float',
            control: {default: 1, min: 0, max: 5, step: 0.01}
        }
    },
    
    options: {
        'type': {
            label: 'Type',
            type: 'select',
            default: 'standard',
            choices: [
                {value: 'standard', name: 'Standard'},
                {value: 'turbulence', name: 'Turbulence'},
                {value: 'ridged', name: 'Ridged'}
            ]
        }
    },
    
    output: {
        'color': {
            label: 'Color',
            type: 'color',
            genCode(cc, funcName){
                const type = this.getOption('type')
                return `vec4 ${funcName}(vec2 uv) {
    vec4 foreground = ${this.getInput('foreground', cc)};
    vec4 background = ${this.getInput('background', cc)};
    float scale = ${this.getInput('scale', cc)};
    float timeSpeed = ${this.getInput('timeSpeed', cc)};
    int octaves = int(${this.getInput('octaves', cc)});
    float lacunarity = ${this.getInput('lacunarity', cc)};
    float gain = ${this.getInput('gain', cc)};
    float contrast = ${this.getInput('contrast', cc)};
    
    vec2 p = uv * scale;
    
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float maxValue = 0.0;
    
    for (int i = 0; i < octaves; i++) {
        // Use 3D simplex noise with time as Z coordinate
        vec3 sp3d = vec3(p * frequency, u_time * timeSpeed + float(i) * 0.3);
        
        // Generate high-quality simplex noise
        float noise = snoise3(sp3d) * 0.5 + 0.5; // Normalize to 0-1
        
        ${type === 'turbulence' ? `
        // Turbulence: use absolute value
        noise = abs(noise * 2.0 - 1.0);
        ` : type === 'ridged' ? `
        // Ridged: invert the absolute value
        noise = 1.0 - abs(noise * 2.0 - 1.0);
        noise = noise * noise;
        ` : `
        // Standard noise
        `}
        
        value += noise * amplitude;
        maxValue += amplitude;
        
        frequency *= lacunarity;
        amplitude *= gain;
    }
    
    value = value / maxValue;
    
    // Apply contrast
    value = (value - 0.5) * contrast + 0.5;
    value = clamp(value, 0.0, 1.0);
    
    return mix(background, foreground, value);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                const type = this.getOption('type')
                return `float ${funcName}(vec2 uv) {
    float scale = ${this.getInput('scale', cc)};
    float timeSpeed = ${this.getInput('timeSpeed', cc)};
    int octaves = int(${this.getInput('octaves', cc)});
    float lacunarity = ${this.getInput('lacunarity', cc)};
    float gain = ${this.getInput('gain', cc)};
    float contrast = ${this.getInput('contrast', cc)};
    
    vec2 p = uv * scale;
    
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float maxValue = 0.0;
    
    for (int i = 0; i < octaves; i++) {
        // Use 3D simplex noise with time as Z coordinate
        vec3 sp3d = vec3(p * frequency, u_time * timeSpeed + float(i) * 0.3);
        
        // Generate high-quality simplex noise
        float noise = snoise3(sp3d) * 0.5 + 0.5; // Normalize to 0-1
        
        ${type === 'turbulence' ? `
        // Turbulence: use absolute value
        noise = abs(noise * 2.0 - 1.0);
        ` : type === 'ridged' ? `
        // Ridged: invert the absolute value
        noise = 1.0 - abs(noise * 2.0 - 1.0);
        noise = noise * noise;
        ` : `
        // Standard noise
        `}
        
        value += noise * amplitude;
        maxValue += amplitude;
        
        frequency *= lacunarity;
        amplitude *= gain;
    }
    
    value = value / maxValue;
    
    // Apply contrast
    value = (value - 0.5) * contrast + 0.5;
    value = clamp(value, 0.0, 1.0);
    
    return value;
}`
            }
        }
    }
})