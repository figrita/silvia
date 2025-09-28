import {registerNode} from '../registry.js'

registerNode({
    slug: 'radialgradient',
    icon: '⭕',
    label: 'Radial Gradient',
    tooltip: 'Generates a radial gradient between two colors, centered at specified coordinates with adjustable radius. Choose loop mode for gradient behavior beyond the radius.',
    input: {
        'centerColor': {
            label: 'Center Color',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'edgeColor': {
            label: 'Edge Color',
            type: 'color',
            control: {default: '#000000ff'}
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
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 5.0, step: 0.01, unit: '⬓'}
        },
        'offset': {
            label: 'Offset',
            type: 'float',
            control: {default: 0.0, min: -5.0, max: 5.0, step: 0.01, unit: '⬓'}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const centerColor = this.getInput('centerColor', cc)
                const edgeColor = this.getInput('edgeColor', cc)
                const centerX = this.getInput('centerX', cc)
                const centerY = this.getInput('centerY', cc)
                const radius = this.getInput('radius', cc)
                const offset = this.getInput('offset', cc)

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
    // Calculate distance from the specified center point (in world space)
    vec2 center = vec2(${centerX}, ${centerY});
    float dist = length(uv - center);
    
    // Normalize distance by radius and add offset
    float t_raw = (dist / ${radius}) + ${offset};
    
    float final_t;
    ${loopModeLogic}
    
    return mix(${centerColor}, ${edgeColor}, final_t);
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