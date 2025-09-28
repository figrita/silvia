import {registerNode} from '../registry.js'

registerNode({
    slug: 'rotate',
    icon: '🔄',
    label: 'Rotate',
    tooltip: 'Rotates the input image around its center. Angle in π-radians (1.0 = 180°) - positive clockwise, negative counter-clockwise.',
    input: {
        'angle': {
            label: 'Angle',
            type: 'float',
            control: {default: 0.0, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    float angleRad = ${this.getInput('angle', cc)} * PI;
    float s = sin(angleRad);
    float c = cos(angleRad);
    mat2 rotMat = mat2(c, -s, s, c);
    vec2 rotatedUV = rotMat * (uv);
    return ${this.getInput('input', cc, 'rotatedUV')};
}`
            }
        }
    }
})