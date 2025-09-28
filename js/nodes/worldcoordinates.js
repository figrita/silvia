import {registerNode} from '../registry.js'

registerNode({
    slug: 'worldcoordinates',
    icon: '🌍',
    label: 'World Coordinates',
    tooltip: 'Outputs the world UV coordinates as separate X and Y values. Useful for positional calculations and custom effects.',

    input: {},

    output: {
        'x': {
            label: 'X',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return uv.x;
}`
            }
        },
        'y': {
            label: 'Y',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return uv.y;
}`
            }
        }
    }
})