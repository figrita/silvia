import {registerNode} from '../registry.js'

registerNode({
    slug: 'zoom',
    icon: '🔎',
    label: 'Zoom',
    tooltip: 'Scales the input image. Values >1 zoom in, <1 zoom out.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'zoom': {
            label: 'Zoom',
            type: 'float',
            control: {default: 1.0, min: 0.01, max: 100.0, step: 0.01, logScale: true}
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
                return `vec4 ${funcName}(vec2 uv) {
    vec2 center = vec2(${this.getInput('centerX', cc)}, ${this.getInput('centerY', cc)});
    vec2 zoomedUV = (uv - center) / ${this.getInput('zoom', cc)} + center;
    return ${this.getInput('input', cc, 'zoomedUV')};
}`
            }
        }
    }
})