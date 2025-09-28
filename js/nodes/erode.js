import {registerNode} from '../registry.js'

registerNode({
    slug: 'erode',
    icon: '⊖',
    label: 'Erode',
    tooltip: 'Contracts bright areas. Opposite of dilate operation.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 0.005, min: 0.001, max: 0.05, step: 0.001, unit: '⬓'}
        },
        'threshold': {
            label: 'Threshold',
            type: 'float',
            control: {default: 0.5, min: 0.0, max: 1.0, step: 0.01}
        },
        'intensity': {
            label: 'Intensity',
            type: 'float',
            control: {default: 1.0, min: 0.0, max: 1.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const radius = this.getInput('radius', cc)
                const threshold = this.getInput('threshold', cc)
                const intensity = this.getInput('intensity', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 original = ${this.getInput('input', cc, 'uv')};
    vec4 minValue = original;
    
    // Sample in a cross pattern for efficiency
    for(float i = -1.0; i <= 1.0; i += 1.0) {
        for(float j = -1.0; j <= 1.0; j += 1.0) {
            if(abs(i) + abs(j) <= 1.0) { // Cross pattern
                vec2 offset = vec2(i, j) * ${radius};
                vec4 texSample = ${this.getInput('input', cc, 'uv + offset')};
                
                // Erode: take minimum value
                float sampleBrightness = dot(texSample.rgb, vec3(0.299, 0.587, 0.114));
                float minBrightness = dot(minValue.rgb, vec3(0.299, 0.587, 0.114));
                
                if(sampleBrightness < minBrightness) {
                    minValue = texSample;
                }
            }
        }
    }
    
    // Apply threshold and intensity
    float originalBrightness = dot(original.rgb, vec3(0.299, 0.587, 0.114));
    float erodedBrightness = dot(minValue.rgb, vec3(0.299, 0.587, 0.114));
    
    if(originalBrightness - erodedBrightness > ${threshold}) {
        return mix(original, minValue, ${intensity});
    } else {
        return original;
    }
}`
            }
        }
    }
})