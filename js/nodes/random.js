import {registerNode} from '../registry.js'

registerNode({
    slug: 'random',
    icon: '🎲',
    label: 'Random',
    tooltip: 'Outputs a pseudo-random float value between the specified Min and Max range. The Seed input allows for different random sequences.',
    
    input: {
        'seed': {
            label: 'Seed',
            type: 'float',
            control: {default: 0, min: 0, max: 1000, step: 1}
        },
        'min': {
            label: 'Min',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        },
        'max': {
            label: 'Max',
            type: 'float',
            control: {default: 1, min: -100, max: 100, step: 0.01}
        }
    },
    
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float seed = ${this.getInput('seed', cc)};
    float minVal = ${this.getInput('min', cc)};
    float maxVal = ${this.getInput('max', cc)};
    
    // Hash function for pseudo-random values
    float hash = fract(sin(dot(vec2(seed, seed * 1.1), vec2(12.9898, 78.233))) * 43758.5453);
    
    return minVal + hash * (maxVal - minVal);
}`
            }
        }
    }
})