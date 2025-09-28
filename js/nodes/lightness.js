import {registerNode} from '../registry.js'

registerNode({
    slug: 'lightness',
    icon: '💡',
    label: 'Lightness',
    tooltip: 'Extracts the lightness/brightness of colors.',
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
    
    // Convert RGB to HSL - we only need the L component
    float maxVal = max(max(color.r, color.g), color.b);
    float minVal = min(min(color.r, color.g), color.b);
    
    // Lightness is the average of max and min RGB values
    float l = (maxVal + minVal) / 2.0;
    
    return l;
}`
            }
        }
    }
})