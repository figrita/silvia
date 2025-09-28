import {registerNode} from '../registry.js'

registerNode({
    slug: 'sincfilter',
    icon: '👾',
    label: 'Sinc Filter',
    tooltip: 'High-quality antialiasing filter using the sinc function. Provides sharp, artifact-free filtering with adjustable kernel size and cutoff frequency.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'kernelSize': {
            label: 'Kernel Size',
            type: 'float',
            control: {default: 3.0, min: 1.0, max: 8.0, step: 1.0}
        },
        'cutoff': {
            label: 'Cutoff',
            type: 'float',
            control: {default: 0.5, min: 0.1, max: 1.0, step: 0.01}
        },
        'sharpness': {
            label: 'Sharpness',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 3.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const kernelSize = this.getInput('kernelSize', cc)
                const cutoff = this.getInput('cutoff', cc)
                const sharpness = this.getInput('sharpness', cc)

                return `vec4 ${funcName}(vec2 uv) {
    int kSize = int(${kernelSize});
    float cutoffFreq = ${cutoff};
    float sharpnessFactor = ${sharpness};
    
    vec4 result = vec4(0.0);
    float totalWeight = 0.0;
    
    vec2 texelSize = 1.0 / u_resolution;
    
    // Sample in a square kernel around the current pixel
    for(int x = -kSize; x <= kSize; x++) {
        for(int y = -kSize; y <= kSize; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            vec2 samplePos = uv + offset;
            
            // Calculate distance from center
            float dist = length(vec2(float(x), float(y)));
            
            // Sinc function: sin(pi * x) / (pi * x)
            float sincX = (dist == 0.0) ? 1.0 : sin(3.14159265 * dist * cutoffFreq * sharpnessFactor) / (3.14159265 * dist * cutoffFreq * sharpnessFactor);
            
            // Apply windowing function (Hamming window) to reduce ringing
            float window = 0.54 + 0.46 * cos(3.14159265 * dist / float(kSize));
            
            float weight = sincX * window;
            
            // Only sample if within kernel bounds
            if(dist <= float(kSize)) {
                result += ${this.getInput('input', cc, 'samplePos')} * weight;
                totalWeight += weight;
            }
        }
    }
    
    // Normalize by total weight
    if(totalWeight > 0.0) {
        result /= totalWeight;
    }
    
    return result;
}`
            }
        }
    }
})