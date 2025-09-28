import {registerNode} from '../registry.js'

registerNode({
    slug: 'emboss',
    icon: '⛰️',
    label: 'Emboss',
    tooltip: 'Creates embossed 3D-like effect by highlighting edges and depth information. Try with Text and Overlay Layer Blend.',
    
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'strength': {
            label: 'Strength',
            type: 'float',
            control: {default: 1, min: 0, max: 5, step: 0.1}
        },
        'angle': {
            label: 'Light Angle',
            type: 'float',
            control: {default: 0.25, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'offset': {
            label: 'Offset',
            type: 'float',
            control: {default: 0.5, min: 0, max: 1, step: 0.01}
        }
    },
    
    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'emboss',
            choices: [
                {value: 'emboss', name: 'Emboss'},
                {value: 'deboss', name: 'Deboss'}
            ]
        }
    },
    
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const mode = this.getOption('mode')
                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${this.getInput('input', cc, 'uv')};
    float strength = ${this.getInput('strength', cc)};
    float angle = ${this.getInput('angle', cc)} * PI;
    float offset = ${this.getInput('offset', cc)};

    vec2 texelSize = 1.0 / u_resolution;

    // Direction of light
    vec2 lightDir = vec2(cos(angle), sin(angle));
    vec2 sampleOffset = lightDir * texelSize * 2.0;

    // Sample neighboring pixels
    vec4 colorN = ${this.getInput('input', cc, 'uv + sampleOffset')};
    vec4 colorS = ${this.getInput('input', cc, 'uv - sampleOffset')};

    // Calculate luminance for height map
    float lumC = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float lumN = dot(colorN.rgb, vec3(0.299, 0.587, 0.114));
    float lumS = dot(colorS.rgb, vec3(0.299, 0.587, 0.114));

    // Calculate emboss effect
    float emboss = (lumN - lumS) * strength;
    ${mode === 'deboss' ? 'emboss = -emboss;' : ''}
    vec3 result = vec3(emboss + offset);
    return vec4(result, color.a);
    }`
        }
        }
    }
})