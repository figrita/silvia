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
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    vec2 zoomedUV = uv / ${this.getInput('zoom', cc)};
    return ${this.getInput('input', cc, 'zoomedUV')};
}`
            }
        }
    }
})