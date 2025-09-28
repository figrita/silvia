import {registerNode} from '../registry.js'

registerNode({
    slug: 'color',
    icon: '🎨',
    label: 'Color',
    tooltip: 'Outputs a constant color value. Use the color picker control to select HSLA values. Connect to other nodes that accept color inputs.',
    input: {
        'color': {
            label: 'Color',
            type: 'color',
            control: {default: '1,0,0.5,1'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    return ${this.getInput('color', cc)};
}`
            }
        }
    }
})