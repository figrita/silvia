import {registerNode} from '../registry.js'

registerNode({
    slug: 'static',
    icon: '🌨️',
    label: 'Static',
    tooltip: 'Generates TV static/noise effect. Adjust density for grain amount and speed for animation rate.',
    
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
        'seed': {
            label: 'Seed',
            type: 'float',
            control: {default: 0, min: 0, max: 1000, step: 1}
        },
        'scale': {
            label: 'Scale',
            type: 'float',
            control: {default: 10, min: 1, max: 100, step: 0.1}
        },
        'timeSpeed': {
            label: 'Time Speed',
            type: 'float',
            control: {default: 0, min: 0, max: 60, step: 0.1}
        },
        'smoothness': {
            label: 'Smoothness',
            type: 'float',
            control: {default: 0, min: 0, max: 1, step: 0.01}
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
    float seed = ${this.getInput('seed', cc)};
    float scale = ${this.getInput('scale', cc)};
    float timeSpeed = ${this.getInput('timeSpeed', cc)};
    float smoothness = ${this.getInput('smoothness', cc)};
    
    // Grid-based random
    vec2 gridUV = uv * scale;
    vec2 gridCell = floor(gridUV);
    vec2 gridFract = fract(gridUV);
    
    // Animate seed with discrete time steps
    float animSeed = seed;
    if (timeSpeed > 0.001) {
        animSeed += floor(u_time * timeSpeed);
    }
    
    float value;
    if (smoothness > 0.001) {
        // Smooth interpolation between neighboring cells
        float tl = fract(sin(dot(gridCell + vec2(0.0, 0.0), vec2(12.9898, 78.233)) + animSeed) * 43758.5453);
        float tr = fract(sin(dot(gridCell + vec2(1.0, 0.0), vec2(12.9898, 78.233)) + animSeed) * 43758.5453);
        float bl = fract(sin(dot(gridCell + vec2(0.0, 1.0), vec2(12.9898, 78.233)) + animSeed) * 43758.5453);
        float br = fract(sin(dot(gridCell + vec2(1.0, 1.0), vec2(12.9898, 78.233)) + animSeed) * 43758.5453);
        
        // Smoothstep interpolation
        vec2 smoothed = smoothstep(0.0, 1.0, gridFract);
        float top = mix(tl, tr, smoothed.x);
        float bottom = mix(bl, br, smoothed.x);
        value = mix(top, bottom, smoothed.y);
    } else {
        // Hard cell values - just use the current cell
        value = fract(sin(dot(gridCell, vec2(12.9898, 78.233)) + animSeed) * 43758.5453);
    }
    
    return mix(background, foreground, value);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float seed = ${this.getInput('seed', cc)};
    float scale = ${this.getInput('scale', cc)};
    float timeSpeed = ${this.getInput('timeSpeed', cc)};
    float smoothness = ${this.getInput('smoothness', cc)};
    
    // Grid-based random
    vec2 gridUV = uv * scale;
    vec2 gridCell = floor(gridUV);
    vec2 gridFract = fract(gridUV);
    
    // Animate seed with discrete time steps
    float animSeed = seed;
    if (timeSpeed > 0.001) {
        animSeed += floor(u_time * timeSpeed);
    }
    
    float value;
    if (smoothness > 0.001) {
        // Smooth interpolation between neighboring cells
        float tl = fract(sin(dot(gridCell + vec2(0.0, 0.0), vec2(12.9898, 78.233)) + animSeed) * 43758.5453);
        float tr = fract(sin(dot(gridCell + vec2(1.0, 0.0), vec2(12.9898, 78.233)) + animSeed) * 43758.5453);
        float bl = fract(sin(dot(gridCell + vec2(0.0, 1.0), vec2(12.9898, 78.233)) + animSeed) * 43758.5453);
        float br = fract(sin(dot(gridCell + vec2(1.0, 1.0), vec2(12.9898, 78.233)) + animSeed) * 43758.5453);
        
        // Smoothstep interpolation
        vec2 smoothed = smoothstep(0.0, 1.0, gridFract);
        float top = mix(tl, tr, smoothed.x);
        float bottom = mix(bl, br, smoothed.x);
        value = mix(top, bottom, smoothed.y);
    } else {
        // Hard cell values - just use the current cell
        value = fract(sin(dot(gridCell, vec2(12.9898, 78.233)) + animSeed) * 43758.5453);
    }
    
    return value;
}`
            }
        }
    }
})