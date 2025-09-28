import {registerNode} from '../registry.js'

registerNode({
    slug: 'posterize',
    icon: '🎭',
    label: 'Posterize',
    tooltip: 'Reduces the number of color levels in the input image, creating a posterized effect. Adjustable levels, dithering, and gamma correction for fine-tuning.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'levels': {
            label: 'Levels',
            type: 'float',
            control: {default: 4, min: 2, max: 32, step: 1}
        },
        'dither': {
            label: 'Dither Amount',
            type: 'float',
            control: {default: 0, min: 0, max: 0.1, step: 0.001}
        },
        'gamma': {
            label: 'Gamma',
            type: 'float',
            control: {default: 1.0, min: 0.5, max: 2, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)
                const levels = this.getInput('levels', cc)
                const dither = this.getInput('dither', cc)
                const gamma = this.getInput('gamma', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};
    float levelsFloat = ${levels};
    float ditherAmount = ${dither};
    float gammaVal = ${gamma};
    
    // Apply gamma correction
    vec3 gammaCorrected = pow(color.rgb, vec3(gammaVal));
    
    // Add dithering noise if enabled
    vec3 dithered = gammaCorrected;
    if (ditherAmount > 0.0) {
        // Simple ordered dithering pattern
        float ditherPattern = fract(sin(dot(uv * 1000.0, vec2(12.9898, 78.233))) * 43758.5453);
        dithered += (ditherPattern - 0.5) * ditherAmount;
    }
    
    // Posterize each color channel
    vec3 posterized;
    posterized.r = floor(dithered.r * levelsFloat + 0.5) / levelsFloat;
    posterized.g = floor(dithered.g * levelsFloat + 0.5) / levelsFloat;
    posterized.b = floor(dithered.b * levelsFloat + 0.5) / levelsFloat;
    
    // Apply inverse gamma correction
    posterized = pow(posterized, vec3(1.0 / gammaVal));
    
    return vec4(clamp(posterized, 0.0, 1.0), color.a);
}`
            }
        }
    }
})