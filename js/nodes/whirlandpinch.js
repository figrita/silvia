import {registerNode} from '../registry.js'

registerNode({
    slug: 'whirlandpinch',
    icon: '🌌',
    label: 'Whirl & Pinch',
    tooltip: 'Combines whirl (spiral twist) and pinch (scale) distortions. Adjust center position and effect strength. Negative pinch is cool!',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'whirl': {
            label: 'Whirl Angle',
            type: 'float',
            control: {default: 0.5, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'pinch': {
            label: 'Pinch Amount',
            type: 'float',
            control: {default: 0.0, min: -1.0, max: 1.0, step: 0.01}
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 0.5, min: 0.01, max: 1.5, step: 0.01, unit: '⬓'}
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
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const radius = this.getInput('radius', cc)

                const centerX = this.getInput('centerX', cc)
                const centerY = this.getInput('centerY', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec2 center = vec2(${centerX}, ${centerY});
    vec2 cuv = uv - center;
    float dist = length(cuv);

    // If we're outside the effect radius, do nothing.
    if (dist > ${radius}) {
        return ${this.getInput('input', cc, 'uv')};
    }

    // Calculate a smooth falloff from the center to the edge of the radius
    float falloff = 1.0 - smoothstep(0.0, ${radius}, dist);

    // Convert to polar coordinates
    float angle = atan(cuv.y, cuv.x);

    // Apply Whirl: Rotate the angle based on falloff
    float whirl_rad = (${this.getInput('whirl', cc)} * PI) * falloff;
    angle += whirl_rad;

    // Apply Pinch: Modify the distance from the center based on falloff
    dist += ${this.getInput('pinch', cc)} * falloff;

    // Convert back to Cartesian coordinates
    vec2 result = vec2(cos(angle), sin(angle)) * dist + center;

    return ${this.getInput('input', cc, 'result')};
}`
            }
        }
    }
})