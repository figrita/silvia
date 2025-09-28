import {registerNode} from '../registry.js'

registerNode({
    slug: 'shakycam',
    icon: '🤳',
    label: 'Shaky Cam',
    tooltip: 'Adds camera shake effects with adjustable intensity and frequency.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'xSpeed': {
            label: 'X Speed',
            type: 'float',
            control: {default: 1.0, min: -5.0, max: 5.0, step: 0.01}
        },
        'ySpeed': {
            label: 'Y Speed',
            type: 'float',
            control: {default: 1.0, min: -5.0, max: 5.0, step: 0.01}
        },
        'sinCoeff': {
            label: 'Sin Coefficient',
            type: 'float',
            control: {default: 1.0, min: -2.0, max: 2.0, step: 0.01}
        },
        'cosCoeff': {
            label: 'Cos Coefficient', 
            type: 'float',
            control: {default: 1.0, min: -2.0, max: 2.0, step: 0.01}
        },
        'amplitude': {
            label: 'Amplitude',
            type: 'float',
            control: {default: 0.1, min: 0.0, max: 1.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const xSpeed = this.getInput('xSpeed', cc)
                const ySpeed = this.getInput('ySpeed', cc)
                const sinCoeff = this.getInput('sinCoeff', cc)
                const cosCoeff = this.getInput('cosCoeff', cc)
                const amplitude = this.getInput('amplitude', cc)

                return `vec4 ${funcName}(vec2 uv) {
    float time = u_time;
    
    // Calculate X offset using sin/cos modulation
    float xOffset = sin(time * ${xSpeed}) * ${sinCoeff} * ${amplitude};
    xOffset += cos(time * ${xSpeed} * 0.7) * ${cosCoeff} * ${amplitude} * 0.5;
    
    // Calculate Y offset using sin/cos modulation with different frequencies
    float yOffset = sin(time * ${ySpeed} * 0.8) * ${sinCoeff} * ${amplitude};
    yOffset += cos(time * ${ySpeed} * 1.2) * ${cosCoeff} * ${amplitude} * 0.5;
    
    // Apply shake offset to UV coordinates
    vec2 transformedUV = uv + vec2(xOffset, yOffset);
    
    return ${this.getInput('input', cc, 'transformedUV')};
}`
            }
        }
    }
})