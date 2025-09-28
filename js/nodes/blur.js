import {registerNode} from '../registry.js'

registerNode({
    slug: 'blur',
    icon: '🕶️',
    label: 'Blur',
    tooltip: 'Applies box blur effect to input. Separate X/Y blur controls allow for directional blurring or motion blur effects.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'blurX': {
            label: 'Blur X',
            type: 'float',
            control: {default: 1.0, min: 0.0, max: 50.0, step: 0.1}
        },
        'blurY': {
            label: 'Blur Y',
            type: 'float',
            control: {default: 1.0, min: 0.0, max: 50.0, step: 0.1}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const blurX = this.getInput('blurX', cc)
                const blurY = this.getInput('blurY', cc)
                const inputCall = this.getInput('input', cc, 'uv')

                return `vec4 ${funcName}(vec2 uv) {
    vec2 texelSize = 1.0 / u_resolution;
    vec2 blurSize = vec2(${blurX}, ${blurY}) * texelSize;
    
    vec4 color = vec4(0.0);
    
    // 3x3 box blur - 9 samples total
    for(float x = -1.0; x <= 1.0; x += 1.0) {
        for(float y = -1.0; y <= 1.0; y += 1.0) {
            vec2 offset = vec2(x, y) * blurSize;
            color += ${inputCall.replace('uv', '(uv + offset)')};
        }
    }
    
    return color / 9.0;
}`
            }
        }
    }
})