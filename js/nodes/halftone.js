import {registerNode} from '../registry.js'

registerNode({
    slug: 'halftone',
    icon: '🦸‍♀️',
    label: 'Halftone',
    tooltip: 'Creates retro halftone dot patterns based on input brightness. Adjust dot size and spacing for different print-like effects.',
    
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'dotSize': {
            label: 'Dot Size',
            type: 'float',
            control: {default: 5, min: 2, max: 20, step: 0.1}
        },
        'angle': {
            label: 'Angle',
            type: 'float',
            control: {default: 0.25, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'smoothness': {
            label: 'Smoothness',
            type: 'float',
            control: {default: 0.1, min: 0.01, max: 0.5, step: 0.01}
        }
    },
    
    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'mono',
            choices: [
                {value: 'mono', name: 'Monochrome'},
                {value: 'cmyk', name: 'CMYK'},
                {value: 'rgb', name: 'RGB'}
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
    vec4 color = ${this.getInput('input', cc, 'uv')};
    float dotSize = ${this.getInput('dotSize', cc)};
    float angle = ${this.getInput('angle', cc)} * PI;
    float smoothness = ${this.getInput('smoothness', cc)};
    
    vec2 resolution = u_resolution;
    vec2 screenUV = gl_FragCoord.xy;
    
    ${mode === 'cmyk' ? `
    // CMYK halftone
    vec3 cmyk = 1.0 - color.rgb;
    float k = min(min(cmyk.r, cmyk.g), cmyk.b);
    cmyk = (cmyk - k) / (1.0 - k + 0.001);
    
    vec4 angles = vec4(15.0, 75.0, 0.0, 45.0) / 180.0 * PI;
    vec4 dots = vec4(0.0);
    
    for (int i = 0; i < 4; i++) {
        float a = angles[i];
        vec2 rotUV = vec2(
            screenUV.x * cos(a) - screenUV.y * sin(a),
            screenUV.x * sin(a) + screenUV.y * cos(a)
        );
        
        vec2 cell = floor(rotUV / dotSize) * dotSize;
        vec2 cellCenter = cell + dotSize * 0.5;
        float dist = length(rotUV - cellCenter) / dotSize;
        
        float value = i == 0 ? cmyk.r : i == 1 ? cmyk.g : i == 2 ? cmyk.b : k;
        float radius = sqrt(value) * 0.7;
        dots[i] = 1.0 - smoothstep(radius - smoothness, radius + smoothness, dist);
    }
    
    vec3 result = vec3(1.0);
    result = mix(result, vec3(0.0, 1.0, 1.0), dots.r);
    result = mix(result, vec3(1.0, 0.0, 1.0), dots.g);
    result = mix(result, vec3(1.0, 1.0, 0.0), dots.b);
    result = mix(result, vec3(0.0, 0.0, 0.0), dots.a);
    
    return vec4(result, color.a);
    ` : mode === 'rgb' ? `
    // RGB halftone
    vec3 angles = vec3(15.0, 75.0, 45.0) / 180.0 * PI;
    vec3 dots = vec3(0.0);
    
    for (int i = 0; i < 3; i++) {
        float a = angles[i];
        vec2 rotUV = vec2(
            screenUV.x * cos(a) - screenUV.y * sin(a),
            screenUV.x * sin(a) + screenUV.y * cos(a)
        );
        
        vec2 cell = floor(rotUV / dotSize) * dotSize;
        vec2 cellCenter = cell + dotSize * 0.5;
        float dist = length(rotUV - cellCenter) / dotSize;
        
        float value = color[i];
        float radius = sqrt(value) * 0.7;
        dots[i] = smoothstep(radius + smoothness, radius - smoothness, dist);
    }
    
    return vec4(dots, color.a);
    ` : `
    // Monochrome halftone
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    
    vec2 rotUV = vec2(
        screenUV.x * cos(angle) - screenUV.y * sin(angle),
        screenUV.x * sin(angle) + screenUV.y * cos(angle)
    );
    
    vec2 cell = floor(rotUV / dotSize) * dotSize;
    vec2 cellCenter = cell + dotSize * 0.5;
    float dist = length(rotUV - cellCenter) / dotSize;
    
    float radius = sqrt(gray) * 0.7;
    float dot = 1.0 - smoothstep(radius - smoothness, radius + smoothness, dist);
    
    return vec4(vec3(dot), color.a);
    `}
}`
            }
        }
    }
})