import {registerNode} from '../registry.js'

registerNode({
    slug: 'houndstooth',
    icon: '🦷',
    label: 'Houndstooth',
    tooltip: 'Generates a houndstooth pattern with adjustable scale and offset.',
    input: {
        'colorA': {
            label: 'Color A',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'colorB': {
            label: 'Color B',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'scale': {
            label: 'Frequency',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 10.0, step: 0.01, unit: '/⬓'}
        },
        'offsetX': {
            label: 'Offset X',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01, unit: '⬓'}
        },
        'offsetY': {
            label: 'Offset Y',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01, unit: '⬓'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    vec4 colorA = ${this.getInput('colorA', cc)};
    vec4 colorB = ${this.getInput('colorB', cc)};
    float scale = ${this.getInput('scale', cc)};
    float offsetX = ${this.getInput('offsetX', cc)};
    float offsetY = ${this.getInput('offsetY', cc)};
    
    // Apply offset and scale
    vec2 scaledUV = (uv + vec2(offsetX, offsetY)) * scale;
    
    // Wrap UV coordinates to create repeating pattern
    scaledUV = fract(scaledUV);
    
    vec3 finalColor;

    // Top-Left Quadrant
    if (scaledUV.x < 0.5 && scaledUV.y > 0.5) {
        finalColor = colorA.rgb;
    } 
    // Bottom-Right Quadrant
    else if (scaledUV.x > 0.5 && scaledUV.y < 0.5) {
        finalColor = colorB.rgb;
    } 
    // Striped Quadrants
    else {
        // Create 45-degree stripes. Multiplying by 2.0 creates two
        // thick stripes diagonally, which is the key to the houndstooth effect.
        float stripeValue = (scaledUV.x + scaledUV.y) * 2.0;
        
        // Use step and fract to create hard-edged stripes
        float stripeMix = step(0.5, fract(stripeValue));

        // Bottom-Left Quadrant
        if (scaledUV.x < 0.5 && scaledUV.y < 0.5) {
            finalColor = mix(colorA.rgb, colorB.rgb, stripeMix);
        } 
        // Top-Right Quadrant (opposite coloring creates the "break")
        else {
            finalColor = mix(colorB.rgb, colorA.rgb, stripeMix);
        }
    }

    return vec4(finalColor, 1.0);
}`
            }
        }
    }
})