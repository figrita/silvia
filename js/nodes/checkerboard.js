import {registerNode} from '../registry.js'

registerNode({
    slug: 'checkerboard',
    icon: '🏁',
    label: 'Checkerboard',
    tooltip: 'Generates an alternating checkerboard pattern. Adjust frequency to control grid resolution and set custom colors for odd/even squares.',
    input: {
        'frequency': {
            label: 'Frequency',
            type: 'float',
            control: {default: 8.0, min: 1, max: 64, step: 1, unit: '/⬓'}
        },
        'color1': {
            label: 'Odd Color',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'color2': {
            label: 'Even Color',
            type: 'color',
            control: {default: '#000000ff'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {

    float frequency = ${this.getInput('frequency', cc)};
    vec2 scaled_uv = uv * ( frequency / 2.0 );
    vec2 grid = floor(scaled_uv);
    float checker = mod(grid.x + grid.y, 2.0);
    vec4 c1 = ${this.getInput('color1', cc)};
    vec4 c2 = ${this.getInput('color2', cc)};
    return mix(c1, c2, checker);
}`
            }
        }
    }
})