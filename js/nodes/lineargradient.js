import {registerNode} from '../registry.js'

registerNode({
    slug: 'lineargradient',
    icon: '▧',
    label: 'Linear Gradient',
    tooltip: 'Generates a linear color gradient between two colors. Adjust angle to control gradient direction.',
    input: {
        'startColor': {
            label: 'Start Color',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'endColor': {
            label: 'End Color',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'angle': {
            label: 'Angle',
            type: 'float',
            control: {default: 0.5, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'frequency': {
            label: 'Frequency',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 20.0, step: 0.1, unit: '/⬓'}
        },
        'offset': {
            label: 'Offset',
            type: 'float',
            control: {default: 0.0, min: -5.0, max: 5.0, step: 0.01, unit: '⬓'}
        },
        'center': {
            label: 'Center',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01, unit: '⬓'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const start = this.getInput('startColor', cc)
                const end = this.getInput('endColor', cc)
                const angle = this.getInput('angle', cc)
                const frequency = this.getInput('frequency', cc)
                const offset = this.getInput('offset', cc)
                const center = this.getInput('center', cc)

                const loopModeLogic = (() => {
                    switch(this.getOption('loop_mode')){
                        case 'repeat':
                            return 'final_t = fract(t_raw);'
                        case 'mirror':
                            return `
    float progress = t_raw;
    final_t = fract(progress);
    if (mod(floor(progress), 2.0) == 1.0) {
        final_t = 1.0 - final_t;
    }`
                        case 'once':
                        default:
                            return 'final_t = clamp(t_raw, 0.0, 1.0);'
                    }
                })()

                return `vec4 ${funcName}(vec2 uv) {
    // Use UV directly since it's already centered on 0,0 in world space
    vec2 p = uv;
    float angle_rad = ${angle} * PI;
    vec2 dir = vec2(cos(angle_rad), sin(angle_rad));
    
    // Calculate distance from center point along the gradient direction
    // Center parameter shifts the reference point along the gradient direction
    float t_raw = ((dot(p, dir) - ${center}) * ${frequency}) + ${offset};
    
    float final_t;
    ${loopModeLogic}
    
    return mix(${start}, ${end}, final_t);
}`
            }
        }
    },
    options: {
        'loop_mode': {
            label: 'Loop Mode',
            type: 'select',
            default: 'once',
            choices: [
                {value: 'once', name: 'Once (Clamp)'},
                {value: 'repeat', name: 'Repeat'},
                {value: 'mirror', name: 'Mirror (Ping-Pong)'}
            ]
        }
    }
})