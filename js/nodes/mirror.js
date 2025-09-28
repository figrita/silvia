// nodes/mirror.js - WITH MIX CONTROL
import {registerNode} from '../registry.js'

registerNode({
    slug: 'mirror',
    icon: '🪞',
    label: 'Mirror',
    tooltip: 'Creates mirror reflections along X and/or Y axes.',
    
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'mix': {
            label: 'Mix',
            type: 'float',
            control: {default: 1.0, min: 0.0, max: 1.0, step: 0.01}
        }
    },
    
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const mixAmount = this.getInput('mix', cc)
                const mode = this.getOption('mode')
                
                let transformCode = ''
                switch(mode) {
                    case 'mirror_x':
                        transformCode = 'transformedUV.x = abs(transformedUV.x);'
                        break
                    case 'mirror_y':
                        transformCode = 'transformedUV.y = abs(transformedUV.y);'
                        break
                    case 'mirror_xy':
                        transformCode = 'transformedUV = abs(transformedUV);'
                        break
                    case 'flip_x':
                        transformCode = 'transformedUV.x = -transformedUV.x;'
                        break
                    case 'flip_y':
                        transformCode = 'transformedUV.y = -transformedUV.y;'
                        break
                    case 'flip_xy':
                        transformCode = 'transformedUV = -transformedUV;'
                        break
                    case 'mirror_x_flip_y':
                        transformCode = 'transformedUV.x = abs(transformedUV.x); transformedUV.y = -transformedUV.y;'
                        break
                    case 'mirror_y_flip_x':
                        transformCode = 'transformedUV.y = abs(transformedUV.y); transformedUV.x = -transformedUV.x;'
                        break
                    case 'quadrant':
                        transformCode = 'transformedUV = abs(transformedUV);'
                        break
                    default:
                        transformCode = '// No transform'
                }

                return `vec4 ${funcName}(vec2 uv) {
    vec2 originalUV = uv;
    vec2 transformedUV = uv;
    
    ${transformCode}
    
    // Mix between original and transformed coordinates
    vec2 finalUV = mix(originalUV, transformedUV, ${mixAmount});
    
    return ${this.getInput('input', cc, 'finalUV')};
}`
            }
        }
    },
    
    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'mirror_x',
            choices: [
                {value: 'mirror_x', name: 'Mirror X'},
                {value: 'mirror_y', name: 'Mirror Y'},
                {value: 'mirror_xy', name: 'Mirror X+Y'},
                {value: 'flip_x', name: 'Flip X'},
                {value: 'flip_y', name: 'Flip Y'},
                {value: 'flip_xy', name: 'Flip X+Y'},
                {value: 'mirror_x_flip_y', name: 'Mirror X + Flip Y'},
                {value: 'mirror_y_flip_x', name: 'Mirror Y + Flip X'},
                {value: 'quadrant', name: 'Quadrant (All Positive)'}
            ]
        }
    }
})