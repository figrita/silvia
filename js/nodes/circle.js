import {registerNode} from '../registry.js'

registerNode({
    slug: 'circle',
    icon: '🔵',
    label: 'Circle',
    tooltip: 'Creates a circle shape with adjustable radius, position, and edge softness. Outputs both colored result and mask for compositing.',
    
    input: {
        'foreground': {
            label: 'Foreground',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'background': {
            label: 'Background',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 0.5, min: 0, max: 2, step: 0.01, unit: '⬓'}
        },
        'softness': {
            label: 'Softness',
            type: 'float',
            control: {default: 0.01, min: 0, max: 0.5, step: 0.001}
        },
        'centerX': {
            label: 'Center X',
            type: 'float',
            control: {default: 0, min: -2, max: 2, step: 0.01, unit: '⬓'}
        },
        'centerY': {
            label: 'Center Y',
            type: 'float',
            control: {default: 0, min: -2, max: 2, step: 0.01, unit: '⬓'}
        }
    },
    
    output: {
        'color': {
            label: 'Color',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    vec4 foreground = ${this.getInput('foreground', cc)};
    vec4 background = ${this.getInput('background', cc)};
    float radius = ${this.getInput('radius', cc)};
    float softness = ${this.getInput('softness', cc)};
    float centerX = ${this.getInput('centerX', cc)};
    float centerY = ${this.getInput('centerY', cc)};
    
    vec2 center = vec2(centerX, centerY);
    float dist = length(uv - center);
    
    float mask = 1.0 - smoothstep(radius - softness, radius + softness, dist);
    
    return mix(background, foreground, mask);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float radius = ${this.getInput('radius', cc)};
    float softness = ${this.getInput('softness', cc)};
    float centerX = ${this.getInput('centerX', cc)};
    float centerY = ${this.getInput('centerY', cc)};
    
    vec2 center = vec2(centerX, centerY);
    float dist = length(uv - center);
    
    return 1.0 - smoothstep(radius - softness, radius + softness, dist);
}`
            }
        }
    }
})