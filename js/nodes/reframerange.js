import {registerNode} from '../registry.js'

registerNode({
    slug: 'reframerange',
    icon: '⇆',
    label: 'Reframe Range',
    tooltip: 'Maps number input values through customizable ranges for parameter control.',
    input: {
        'input': {
            label: 'Input',
            type: 'float',
            control: {default: 0.5, min: -1000.0, max: 1000.0, step: 0.01}
        },
        'inMin': {
            label: 'Input Min',
            type: 'float',
            control: {default: 0.0, min: -1000.0, max: 1000.0, step: 0.01}
        },
        'inMax': {
            label: 'Input Max',
            type: 'float',
            control: {default: 1.0, min: -1000.0, max: 1000.0, step: 0.01}
        },
        'outMin': {
            label: 'Output Min',
            type: 'float',
            control: {default: -1.0, min: -1000.0, max: 1000.0, step: 0.01}
        },
        'outMax': {
            label: 'Output Max',
            type: 'float',
            control: {default: 1.0, min: -1000.0, max: 1000.0, step: 0.01}
        }
    },
    options: {
        'clamp': {
            label: 'Clamp Output',
            type: 'select',
            default: 'off',
            choices: [
                {value: 'off', name: 'Off'},
                {value: 'on', name: 'On'}
            ]
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                // Get the GLSL representation for each input. This will be either a
                // literal value (from an s-number control) or a function call to a connected node.
                const val = this.getInput('input', cc)
                const inMin = this.getInput('inMin', cc)
                const inMax = this.getInput('inMax', cc)
                const outMin = this.getInput('outMin', cc)
                const outMax = this.getInput('outMax', cc)
                
                // Check if clamping is enabled
                const shouldClamp = this.optionValues?.clamp === 'on'

                // This GLSL function performs the linear remapping.
                return `float ${funcName}(vec2 uv) {
    float v_in = ${val};
    float min_in = ${inMin};
    float max_in = ${inMax};
    float min_out = ${outMin};
    float max_out = ${outMax};

    float in_range = max_in - min_in;

    // Prevent division by zero if the input range is flat.
    // In this case, we just return the minimum of the output range.
    if (abs(in_range) < 0.00001) {
        return min_out; 
    }

    // First, normalize the input value to a 0.0-1.0 range (we'll call it 't').
    float t = (v_in - min_in) / in_range;

    // Then, use 't' to linearly interpolate within the output range.
    // The GLSL mix() function handles this perfectly. It will also extrapolate
    // if the input value is outside the specified input range.
    float result = mix(min_out, max_out, t);
    
    ${shouldClamp ? `// Clamp the output to the specified range
    return clamp(result, min(min_out, max_out), max(min_out, max_out));` : `return result;`}
}`
            }
        }
    }
})