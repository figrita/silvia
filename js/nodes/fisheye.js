import {registerNode} from '../registry.js'

registerNode({
    slug: 'fisheye',
    icon: '🐠',
    label: 'Fisheye Lens',
    tooltip: 'Applies fisheye lens distortion effect. Positive values create barrel distortion, negative creates pincushion distortion.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'distortion': {
            label: 'Distortion',
            type: 'float',
            control: {default: 0.5, min: -1.0, max: 1.0, step: 0.01}
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 1.0, min: 0.01, max: 3.0, step: 0.01, unit: '⬓'}
        },
        'centerX': {
            label: 'Center X',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01, unit: '⬓'}
        },
        'centerY': {
            label: 'Center Y',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01, unit: '⬓'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const distortion = this.getInput('distortion', cc)
                const radius = this.getInput('radius', cc)
                const centerX = this.getInput('centerX', cc)
                const centerY = this.getInput('centerY', cc)

                return `vec4 ${funcName}(vec2 uv) {    
    vec2 center = vec2(${centerX}, ${centerY});
    vec2 centered_uv = uv - center;
    float r = length(centered_uv);
    
    if (r == 0.0) { // Avoid division by zero at the center
        return ${this.getInput('input', cc, 'uv')};
    }
    
    // Normalize radius to 0-1 based on the effect radius
    float normalizedR = r / ${radius};
    
    // Smoothstep the distortion amount based on distance from center
    float distortionAmount = ${distortion} * (1.0 - smoothstep(0.7, 1.0, normalizedR));
    
    // Apply the distortion formula using pow for a curved effect
    float r_distorted = pow(normalizedR, 1.0 + distortionAmount) * ${radius};
    
    // Calculate new UVs by scaling the centered vector by the distorted radius over the original radius
    vec2 distorted_centered_uv = centered_uv * (r_distorted / r);
    vec2 distorted_uv = distorted_centered_uv + center;
    
    return ${this.getInput('input', cc, 'distorted_uv')};
}`
            }
        }
    }
})