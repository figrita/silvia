import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'hsla',
    icon: '🌈',
    label: 'HSLA',
    tooltip: 'Combines Hue, Saturation, Lightness, and Alpha values into a color using HSL color space.',
    shaderUtils: [shaderUtils.HSV2RGB],
    input: {
        'h': {
            label: 'Hue',
            type: 'float',
            range: '[0, 1]',
            control: {default: 0, min: 0, max: 1, step: 0.01}
        },
        's': {
            label: 'Saturation',
            type: 'float',
            range: '[0, 1]',
            control: {default: 0, min: 0, max: 1, step: 0.01}
        },
        'l': {
            label: 'Lightness',
            type: 'float',
            range: '[0, 1]',
            control: {default: 0, min: 0, max: 1, step: 0.01}
        },
        'a': {
            label: 'Alpha',
            type: 'float',
            range: '[0, 1]',
            control: {default: 1, min: 0, max: 1, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    float h = ${this.getInput('h', cc)};
    float s = ${this.getInput('s', cc)};
    float l = ${this.getInput('l', cc)};
    float a = ${this.getInput('a', cc)};
    
    // HSL to RGB conversion
    vec3 rgb;
    if (s == 0.0) {
        rgb = vec3(l); // achromatic
    } else {
        float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
        float p = 2.0 * l - q;
        
        // Convert hue to RGB - inline calculation
        float r_t = h + 1.0/3.0;
        float g_t = h;
        float b_t = h - 1.0/3.0;
        
        // Process red
        if (r_t < 0.0) r_t += 1.0;
        if (r_t > 1.0) r_t -= 1.0;
        if (r_t < 1.0/6.0) rgb.r = p + (q - p) * 6.0 * r_t;
        else if (r_t < 1.0/2.0) rgb.r = q;
        else if (r_t < 2.0/3.0) rgb.r = p + (q - p) * (2.0/3.0 - r_t) * 6.0;
        else rgb.r = p;
        
        // Process green
        if (g_t < 0.0) g_t += 1.0;
        if (g_t > 1.0) g_t -= 1.0;
        if (g_t < 1.0/6.0) rgb.g = p + (q - p) * 6.0 * g_t;
        else if (g_t < 1.0/2.0) rgb.g = q;
        else if (g_t < 2.0/3.0) rgb.g = p + (q - p) * (2.0/3.0 - g_t) * 6.0;
        else rgb.g = p;
        
        // Process blue
        if (b_t < 0.0) b_t += 1.0;
        if (b_t > 1.0) b_t -= 1.0;
        if (b_t < 1.0/6.0) rgb.b = p + (q - p) * 6.0 * b_t;
        else if (b_t < 1.0/2.0) rgb.b = q;
        else if (b_t < 2.0/3.0) rgb.b = p + (q - p) * (2.0/3.0 - b_t) * 6.0;
        else rgb.b = p;
    }
    
    return vec4(rgb, a);
}`
            }
        }
    }
})