import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'colormapping',
    icon: '👥',
    label: 'Color Mapping',
    tooltip: 'Color grading tool. Dark areas use shadow color, bright areas use highlight color, with midtones blending between. Great for cinematic looks and stylistic color transformations.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'shadows': {
            label: 'Shadows',
            type: 'color',
            control: {default: '#0000ff'}
        },
        'midtones': {
            label: 'Midtones',
            type: 'color',
            control: {default: '#808080'}
        },
        'highlights': {
            label: 'Highlights',
            type: 'color',
            control: {default: '#ffff00'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)
                const shadows = this.getInput('shadows', cc)
                const midtones = this.getInput('midtones', cc)
                const highlights = this.getInput('highlights', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};
    vec4 shadowColor = ${shadows};
    vec4 midColor = ${midtones};
    vec4 highlightColor = ${highlights};
    
    // Calculate luminance to determine which range we're in
    float lum = rgb2lum(color.rgb);
    
    vec3 result;
    
    if (lum < 0.5) {
        // Blend between shadows and midtones
        float t = lum * 2.0; // Map 0-0.5 to 0-1
        result = mix(shadowColor.rgb, midColor.rgb, t);
    } else {
        // Blend between midtones and highlights
        float t = (lum - 0.5) * 2.0; // Map 0.5-1 to 0-1
        result = mix(midColor.rgb, highlightColor.rgb, t);
    }
    
    // Mix based on original color saturation to preserve some original character
    vec3 colorHSV = rgb2hsv(color.rgb);
    float saturation = colorHSV.y;
    result = mix(result, color.rgb, saturation * 0.3);
    
    return vec4(clamp(result, 0.0, 1.0), color.a);
}`
            }
        }
    },
    shaderUtils: [shaderUtils.RGB2LUM, shaderUtils.RGB2HSV]
})