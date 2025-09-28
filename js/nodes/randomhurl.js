import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'randomhurl',
    icon: '🤢',
    label: 'Random Hurl',
    tooltip: 'Generates fully uncorrelated RGB noise with independent random values for each color channel at every pixel.',

    input: {
        'seed': {
            label: 'Seed',
            type: 'float',
            control: {default: 0, min: 0, max: 1000, step: 1}
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    float seed = ${this.getInput('seed', cc)};

    // Use screen coordinates for scale-independent noise
    vec2 screenCoord = uv;

    // Generate three independent random values for R, G, B
    // Add different offsets to break correlation between channels
    float r = random_rng(screenCoord + vec2(seed, 0.0));
    float g = random_rng(screenCoord + vec2(0.0, seed + 1.0));
    float b = random_rng(screenCoord + vec2(seed + 2.0, seed + 3.0));

    return vec4(r, g, b, 1.0);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float seed = ${this.getInput('seed', cc)};

    // Use screen coordinates for scale-independent noise
    vec2 screenCoord = uv;

    // Generate three independent random values for R, G, B
    // Add different offsets to break correlation between channels
    float r = random_rng(screenCoord + vec2(seed, 0.0));
    float g = random_rng(screenCoord + vec2(0.0, seed + 1.0));
    float b = random_rng(screenCoord + vec2(seed + 2.0, seed + 3.0));

    // Convert to luminosity using standard weights
    return dot(vec3(r, g, b), vec3(0.299, 0.587, 0.114));
}`
            }
        }
    },

    shaderUtils: [shaderUtils.HASH_RANDOM]
})