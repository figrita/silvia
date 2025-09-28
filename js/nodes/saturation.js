import {registerNode} from '../registry.js'

registerNode({
    slug: 'saturation',
    icon: '🧂',
    label: 'Saturation',
    tooltip: 'Extracts the saturation component from an input color. Outputs a float value between 0 (gray) and 1 (fully saturated).',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    vec4 color = ${this.getInput('input', cc)};
    
    // Convert RGB to HSL - we only need the S component
    float maxVal = max(max(color.r, color.g), color.b);
    float minVal = min(min(color.r, color.g), color.b);
    float delta = maxVal - minVal;
    float l = (maxVal + minVal) / 2.0;
    
    float s = 0.0;
    if (delta > 0.0) {
        s = delta / (1.0 - abs(2.0 * l - 1.0));
    }
    
    return s;
}`
            }
        }
    }
})