import {registerNode} from '../registry.js'

registerNode({
    slug: 'bloom',
    icon: '🌟',
    label: 'Bloom',
    tooltip: 'Adds glowing bloom effect to bright areas. Adjust threshold to control which areas glow, intensity for glow strength.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'threshold': {
            label: 'Threshold',
            type: 'float',
            control: {default: 0.7, min: 0.0, max: 1.0, step: 0.01}
        },
        'intensity': {
            label: 'Intensity',
            type: 'float',
            control: {default: 1.0, min: 0.0, max: 3.0, step: 0.01}
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 0.01, min: 0.001, max: 0.05, step: 0.001, unit: '⬓'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const threshold = this.getInput('threshold', cc)
                const intensity = this.getInput('intensity', cc)
                const radius = this.getInput('radius', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 original = ${this.getInput('input', cc, 'uv')};
    vec4 bloom = vec4(0.0);
    float samples = 0.0;
    
    // Sample in a circular pattern for bloom effect
    for(float angle = 0.0; angle < 6.28318; angle += 0.39269) {
        for(float r = ${radius} * 0.2; r <= ${radius}; r += ${radius} * 0.2) {
            vec2 offset = vec2(cos(angle), sin(angle)) * r;
            vec4 texSample = ${this.getInput('input', cc, 'uv + offset')};
            
            // Extract bright parts above threshold
            float brightness = dot(texSample.rgb, vec3(0.299, 0.587, 0.114));
            if(brightness > ${threshold}) {
                bloom += texSample * (brightness - ${threshold});
                samples += 1.0;
            }
        }
    }
    
    if(samples > 0.0) {
        bloom /= samples;
    }
    
    // Combine original with bloom
    return original + bloom * ${intensity};
}`
            }
        }
    }
})