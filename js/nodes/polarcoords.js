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
                const mode = this.getOption('mode')
                const scale = this.getInput('scale', cc)
                
                const centerX = this.getInput('centerX', cc)
                const centerY = this.getInput('centerY', cc)

                let transformCode = ''
                if(mode === 'to_polar'){
                    transformCode = `
        vec2 cuv = uv - center;
        float r = length(cuv) / ${scale};
        float theta = atan(cuv.y, cuv.x) / PI;
        sampleUV = vec2(theta, r * 2.0 - 1.0);`
                } else if(mode === 'from_polar'){
                    transformCode = `
        float theta = uv.x * PI;
        float r = (uv.y + 1.0) * 0.5 * ${scale};
        sampleUV = vec2(cos(theta) * r, sin(theta) * r) + center;`
                } else if(mode === 'to_log_polar'){
                    transformCode = `
        vec2 cuv = uv - center;
        float r = length(cuv);
        float logR = log(max(r, 0.001)) / ${scale};
        float theta = atan(cuv.y, cuv.x) / PI;
        sampleUV = vec2(theta, logR);`
                } else if(mode === 'from_log_polar'){
                    transformCode = `
        float theta = uv.x * PI;
        float r = exp(uv.y * ${scale});
        sampleUV = vec2(cos(theta) * r, sin(theta) * r) + center;`
                }
                
                return `vec4 ${funcName}(vec2 uv) {
    vec2 center = vec2(${centerX}, ${centerY});
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