import {registerNode} from '../registry.js'

registerNode({
    slug: 'channelsplitter',
    icon: '✂️',
    label: 'Channel Splitter',
    tooltip: 'Splits a color input into separate RGBA number outputs. Useful for isolating and processing individual color channels.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        }
    },
    output: {
        'r': {
            label: 'R',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return ${this.getInput('input', cc)}.r;
}`
            }
        },
        'g': {
            label: 'G',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return ${this.getInput('input', cc)}.g;
}`
            }
        },
        'b': {
            label: 'B',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return ${this.getInput('input', cc)}.b;
}`
            }
        },
        'a': {
            label: 'A',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return ${this.getInput('input', cc)}.a;
}`
            }
        }
    }
})