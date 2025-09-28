import {registerNode} from '../registry.js'

registerNode({
    slug: 'stretchskew',
    icon: '⚟',
    label: 'Stretch/Skew',
    tooltip: 'Applies stretching and skewing transformations to distort the input image geometry.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'stretchX': {
            label: 'Stretch X',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 3.0, step: 0.01}
        },
        'stretchY': {
            label: 'Stretch Y',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 3.0, step: 0.01}
        },
        'skewX': {
            label: 'Skew X',
            type: 'float',
            control: {default: 0.0, min: -1.0, max: 1.0, step: 0.01}
        },
        'skewY': {
            label: 'Skew Y',
            type: 'float',
            control: {default: 0.0, min: -1.0, max: 1.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const stretchX = this.getInput('stretchX', cc)
                const stretchY = this.getInput('stretchY', cc)
                const skewX = this.getInput('skewX', cc)
                const skewY = this.getInput('skewY', cc)

                return `vec4 ${funcName}(vec2 uv) {
    // Apply inverse transformation to sample the correct texel
    // First apply stretch
    vec2 stretchedUV = vec2(uv.x * ${stretchX}, uv.y * ${stretchY});
    
    // Then apply skew
    vec2 skewedUV = vec2(
        stretchedUV.x + stretchedUV.y * ${skewX},
        stretchedUV.y + stretchedUV.x * ${skewY}
    );
    
    return ${this.getInput('input', cc, 'skewedUV')};
}`
            }
        }
    }
})