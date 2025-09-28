import {registerNode} from '../registry.js'

registerNode({
    slug: 'sharpen',
    icon: '🪒',
    label: 'Sharpen',
    tooltip: 'Enhances edge definition and detail in the input image.',
    
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'amount': {
            label: 'Amount',
            type: 'float',
            control: {default: 1, min: 0, max: 10, step: 0.1}
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 1, min: 0.5, max: 5, step: 0.1}
        },
        'threshold': {
            label: 'Threshold',
            type: 'float',
            control: {default: 0, min: 0, max: 1, step: 0.01}
        }
    },
    
    options: {
        'method': {
            label: 'Method',
            type: 'select',
            default: 'unsharp',
            choices: [
                {value: 'simple', name: 'Simple'},
                {value: 'unsharp', name: 'Unsharp Mask'},
                {value: 'highpass', name: 'High Pass'}
            ]
        }
    },
    
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const method = this.getOption('method')
                return `vec4 ${funcName}(vec2 uv) {
    vec4 center = ${this.getInput('input', cc, 'uv')};
    float amount = ${this.getInput('amount', cc)};
    float radius = ${this.getInput('radius', cc)};
    float threshold = ${this.getInput('threshold', cc)};
    
    vec2 texelSize = 1.0 / u_resolution;
    
    ${method === 'simple' ? `
    // Simple 3x3 sharpen kernel
    vec4 color = center * (1.0 + 4.0 * amount);
    
    color -= ${this.getInput('input', cc, 'uv + vec2(-texelSize.x, 0.0)')} * amount;
    color -= ${this.getInput('input', cc, 'uv + vec2(texelSize.x, 0.0)')} * amount;
    color -= ${this.getInput('input', cc, 'uv + vec2(0.0, -texelSize.y)')} * amount;
    color -= ${this.getInput('input', cc, 'uv + vec2(0.0, texelSize.y)')} * amount;
    
    return vec4(clamp(color.rgb, 0.0, 1.0), center.a);
    ` : method === 'highpass' ? `
    // High pass filter sharpening
    vec4 blurred = vec4(0.0);
    float totalWeight = 0.0;
    
    // Gaussian blur for high pass
    for (float x = -2.0; x <= 2.0; x++) {
        for (float y = -2.0; y <= 2.0; y++) {
            vec2 offset = vec2(x, y) * texelSize * radius;
            float weight = exp(-(x*x + y*y) / (2.0 * radius * radius));
            blurred += ${this.getInput('input', cc, 'uv + offset')} * weight;
            totalWeight += weight;
        }
    }
    blurred /= totalWeight;
    
    // High pass = original - blurred
    vec4 highpass = center - blurred;
    
    // Apply threshold
    float edge = length(highpass.rgb);
    float mask = smoothstep(threshold, threshold + 0.01, edge);
    
    // Add high frequency detail back
    vec3 sharpened = center.rgb + highpass.rgb * amount * mask;
    
    return vec4(clamp(sharpened, 0.0, 1.0), center.a);
    ` : `
    // Unsharp mask
    vec4 blurred = vec4(0.0);
    float totalWeight = 0.0;
    
    // Variable radius Gaussian blur
    float samples = ceil(radius * 2.0);
    for (float x = -samples; x <= samples; x++) {
        for (float y = -samples; y <= samples; y++) {
            vec2 offset = vec2(x, y) * texelSize;
            float dist = length(vec2(x, y));
            if (dist <= samples) {
                float weight = exp(-(dist * dist) / (2.0 * radius * radius));
                blurred += ${this.getInput('input', cc, 'uv + offset')} * weight;
                totalWeight += weight;
            }
        }
    }
    blurred /= totalWeight;
    
    // Calculate difference
    vec4 diff = center - blurred;
    
    // Apply threshold
    float edge = length(diff.rgb);
    float mask = smoothstep(threshold, threshold + 0.01, edge);
    
    // Apply unsharp mask
    vec3 sharpened = center.rgb + diff.rgb * amount * mask;
    
    return vec4(clamp(sharpened, 0.0, 1.0), center.a);
    `}
}`
            }
        }
    }
})