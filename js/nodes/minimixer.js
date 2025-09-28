import {registerNode} from '../registry.js'

registerNode({
    slug: 'minimixer',
    icon: '🎛️',
    label: 'Mini Mixer',
    tooltip: 'Wipes between two inputs with various transition directions and softness control.',

    input: {
        'a': {
            label: 'A',
            type: 'color',
            control: null
        },
        'b': {
            label: 'B',
            type: 'color',
            control: null
        },
        'select': {
            label: 'Select',
            type: 'float',
            control: {default: 0, min: 0, max: 1, step: 0.01}
        },
        'transition': {
            label: 'Transition',
            type: 'float',
            control: {default: 0, min: 0, max: 1, step: 0.01}
        }
    },

    options: {
        'wipeDirection': {
            label: 'Wipe Direction',
            type: 'select',
            default: 'horizontal',
            choices: [
                {value: 'horizontal', name: 'Horizontal'},
                {value: 'vertical', name: 'Vertical'},
                {value: 'diagonal', name: 'Diagonal'},
                {value: 'radial', name: 'Radial'}
            ]
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const wipeDirection = this.getOption('wipeDirection')
                return `vec4 ${funcName}(vec2 uv) {
    vec4 inputA = ${this.getInput('a', cc, 'uv')};
    vec4 inputB = ${this.getInput('b', cc, 'uv')};
    float select = ${this.getInput('select', cc)};
    float transition = ${this.getInput('transition', cc)};

    // Convert worldspace to screen space properly like feedback node
    float aspect = u_resolution.x / u_resolution.y;
    vec2 screenUV = vec2((uv.x / aspect + 1.0) * 0.5, (uv.y + 1.0) * 0.5);

    // Wipe transition - fixed to actually cover full plane
    float wipePos;
    ${wipeDirection === 'vertical' ? `
    // Horizontal wipe left-to-right
    wipePos = screenUV.x;
    ` : wipeDirection === 'diagonal' ? `
    // Diagonal wipe corner-to-corner - needs to account for aspect stretched coordinates
    wipePos = (screenUV.x + screenUV.y) * 0.5;
    ` : wipeDirection === 'radial' ? `
    // Radial wipe from center, accounting for aspect ratio properly
    vec2 center = vec2(0.5, 0.5);
    vec2 offset = screenUV - center;
    // Maximum distance to corner in aspect-corrected space
    float maxDist = length(vec2(0.5 / aspect, 0.5));
    float dist = length(vec2(offset.x / aspect, offset.y));
    wipePos = dist / maxDist;
    ` : `
    // Vertical wipe bottom-to-top
    wipePos = screenUV.y;
    `}

    // Position transition completely off-screen at extremes
    // At select=0: transition should end at 0, so start at -transition
    // At select=1: transition should start at 1, so end at 1+transition
    float transitionStart = select - transition * (1.0 - select);
    float transitionEnd = select + transition * select;
    float edge = smoothstep(transitionStart, transitionEnd, wipePos);
    return mix(inputA, inputB, edge);
}`
            }
        }
    }
})