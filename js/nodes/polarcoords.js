// nodes/polarcoords.js
import {registerNode} from '../registry.js'

registerNode({
    slug: 'polarcoords',
    icon: '🎯',
    label: 'Polar Coordinates',
    tooltip: 'Converts between Cartesian and Polar coordinate systems. Supports standard and logarithmic polar transformations with adjustable scaling.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'scale': {
            label: 'Scale',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 5.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const mode = this.getOption('mode')
                const scale = this.getInput('scale', cc)
                
                let transformCode = ''
                if(mode === 'to_polar'){
                    // Cartesian to Polar
                    // Map angle to X axis (-1 to 1)
                    // Map radius to Y axis (scaled to fit viewport)
                    transformCode = `
        float r = length(uv) / ${scale};
        float theta = atan(uv.y, uv.x) / PI; // Maps to [-1, 1]
        sampleUV = vec2(theta, r * 2.0 - 1.0); // Scale radius to [-1, 1] range`
                } else if(mode === 'from_polar'){
                    // Polar to Cartesian
                    // X is angle (-1 to 1 represents -PI to PI)
                    // Y is radius (-1 to 1 represents 0 to scale)
                    transformCode = `
        float theta = uv.x * PI;
        float r = (uv.y + 1.0) * 0.5 * ${scale}; // Map from [-1,1] to [0, scale]
        sampleUV = vec2(cos(theta) * r, sin(theta) * r);`
                } else if(mode === 'to_log_polar'){
                    // Logarithmic polar (useful for rotation/scale invariant effects)
                    transformCode = `
        float r = length(uv);
        float logR = log(max(r, 0.001)) / ${scale}; // Logarithmic radius
        float theta = atan(uv.y, uv.x) / PI;
        sampleUV = vec2(theta, logR);`
                } else if(mode === 'from_log_polar'){
                    // Inverse logarithmic polar
                    transformCode = `
        float theta = uv.x * PI;
        float r = exp(uv.y * ${scale});
        sampleUV = vec2(cos(theta) * r, sin(theta) * r);`
                }
                
                return `vec4 ${funcName}(vec2 uv) {
    vec2 sampleUV;
    ${transformCode}
    
    return ${this.getInput('input', cc, 'sampleUV')};
}`
            }
        }
    },
    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'to_polar',
            choices: [
                {value: 'to_polar', name: 'Cartesian → Polar'},
                {value: 'from_polar', name: 'Polar → Cartesian'},
                {value: 'to_log_polar', name: 'Cartesian → Log-Polar'},
                {value: 'from_log_polar', name: 'Log-Polar → Cartesian'}
            ]
        }
    }
})