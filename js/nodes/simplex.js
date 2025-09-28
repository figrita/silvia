import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'simplex',
    icon: '🌊',
    label: 'Simplex Noise',
    tooltip: 'Generates improved noise patterns with better visual properties than Perlin noise.',
    
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
        'offsetX': {
            label: 'Offset X',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.1, unit: '⬓'}
        },
        'offsetY': {
            label: 'Offset Y',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.1, unit: '⬓'}
        },
        'contrast': {
            label: 'Contrast',
            type: 'float',
            control: {default: 1, min: 0, max: 5, step: 0.01}
        }
    },
    
    output: {
        'color': {
            label: 'Color',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    vec4 foreground = ${this.getInput('foreground', cc)};
    vec4 background = ${this.getInput('background', cc)};
    float scale = ${this.getInput('scale', cc)};
    float timeSpeed = ${this.getInput('timeSpeed', cc)};
    float offsetX = ${this.getInput('offsetX', cc)};
    float offsetY = ${this.getInput('offsetY', cc)};
    float contrast = ${this.getInput('contrast', cc)};
    
    // Apply scale and offset
    vec2 p = (uv + vec2(offsetX, offsetY)) * scale;
    
    // Use 3D simplex with time as Z coordinate for smooth evolution
    vec3 p3d = vec3(p, u_time * timeSpeed);
    
    // Generate simplex noise
    float noise = snoise3(p3d) * 0.5 + 0.5; // Normalize to 0-1
    
    // Apply contrast
    noise = (noise - 0.5) * contrast + 0.5;
    noise = clamp(noise, 0.0, 1.0);
    
    return mix(background, foreground, noise);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float scale = ${this.getInput('scale', cc)};
    float timeSpeed = ${this.getInput('timeSpeed', cc)};
    float offsetX = ${this.getInput('offsetX', cc)};
    float offsetY = ${this.getInput('offsetY', cc)};
    float contrast = ${this.getInput('contrast', cc)};
    
    // Apply scale and offset
    vec2 p = (uv + vec2(offsetX, offsetY)) * scale;
    
    // Use 3D simplex with time as Z coordinate for smooth evolution
    vec3 p3d = vec3(p, u_time * timeSpeed);
    
    // Generate simplex noise
    float noise = snoise3(p3d) * 0.5 + 0.5; // Normalize to 0-1
    
    // Apply contrast
    noise = (noise - 0.5) * contrast + 0.5;
    noise = clamp(noise, 0.0, 1.0);
    
    return noise;
}`
            }
        }
    }
})