import {registerNode} from '../registry.js'

registerNode({
    slug: 'hue',
    icon: '🦜',
    label: 'Hue',
    tooltip: 'Extracts the hue (color) of the input image.',
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
    
    // Convert RGB to HSL - we only need the H component
    float maxVal = max(max(color.r, color.g), color.b);
    float minVal = min(min(color.r, color.g), color.b);
    float delta = maxVal - minVal;
    
    float h = 0.0;
    if (delta > 0.0) {
        if (maxVal == color.r) {
            h = mod((color.g - color.b) / delta, 6.0);
        } else if (maxVal == color.g) {
            h = (color.b - color.r) / delta + 2.0;
        } else {
            h = (color.r - color.g) / delta + 4.0;
        }
        h = h / 6.0;
    }
    
    return h;
}`
            }
        }
    }
})