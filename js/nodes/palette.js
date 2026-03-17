import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

// 8 output slots with short labels
const SLOT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function makeOutput(index, total) {
    return {
        label: SLOT_LABELS[index],
        type: 'color',
        genCode(cc, funcName) {
            const input = this.getInput('input', cc)
            const spread   = this.getInput('spread', cc)
            const shift    = this.getInput('shift', cc)
            const curve    = this.getInput('curve', cc)
            const lSpread  = this.getInput('l_spread', cc)
            const cSpread  = this.getInput('c_spread', cc)

            // t goes from 0.0 to 1.0 across the 8 slots
            const t = (index / (total - 1)).toFixed(6)
            // centered t: -1 to +1, with slot 0 = -1, slot 7 = +1
            const tc = ((index / (total - 1)) * 2.0 - 1.0).toFixed(6)

            return `vec4 ${funcName}(vec2 uv) {
    vec4 src = ${input};
    vec3 lab = srgb2oklab(src.rgb);

    // polar form: chroma + hue
    float C = length(lab.yz);
    float H = atan(lab.z, lab.y);

    // curve: 1.0 = linear, <1 clusters near center, >1 pushes to edges
    float t = ${t};
    float curveVal = max(${curve}, 0.01);
    float shaped = pow(t, curveVal);

    // hue: spread across an arc, shifted
    float hueArc = ${spread} * 6.28318530718;
    float hueShift = ${shift} * 6.28318530718;
    H += hueShift + (shaped - 0.5) * hueArc;

    // lightness & chroma fans centered on the original
    float tc = ${tc};
    lab.x = clamp(lab.x + tc * ${lSpread} * 0.5, 0.0, 1.0);
    C = max(C + tc * ${cSpread} * 0.2, 0.0);

    lab.yz = C * vec2(cos(H), sin(H));
    return vec4(oklab2srgb(lab), src.a);
}`
        }
    }
}

const outputs = {}
for (let i = 0; i < 8; i++) {
    outputs['c' + i] = makeOutput(i, 8)
}

registerNode({
    slug: 'palette',
    icon: '🎨',
    label: 'Palette',
    tooltip: 'Per-pixel OKLCH palette generator. Feeds one color through 8 harmonious variations. Connect spread, shift, curve, lightness and chroma to oscillators or audio for animated palettes.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: {default: '#4488ccff'}
        },
        'spread': {
            label: 'Spread',
            type: 'float',
            control: {default: 1.0, min: 0, max: 4, step: 0.01},
            tooltip: 'Hue arc width. 1 = full wheel, 0 = monochrome, 0.15 = analogous, 0.5 = half wheel'
        },
        'shift': {
            label: 'Shift',
            type: 'float',
            control: {default: 0.0, min: -2, max: 2, step: 0.01},
            tooltip: 'Rotates the whole palette around the color wheel'
        },
        'curve': {
            label: 'Curve',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 4, step: 0.01},
            tooltip: 'Distribution shape. 1 = even, <1 = clusters near input, >1 = pushes apart'
        },
        'l_spread': {
            label: 'L Spread',
            type: 'float',
            control: {default: 0.0, min: -2, max: 2, step: 0.01},
            tooltip: 'Fans lightness across outputs. Positive = A dark, H bright'
        },
        'c_spread': {
            label: 'C Spread',
            type: 'float',
            control: {default: 0.0, min: -2, max: 2, step: 0.01},
            tooltip: 'Fans chroma across outputs. Positive = A muted, H vivid'
        }
    },
    output: outputs,
    shaderUtils: [shaderUtils.SRGB2OKLAB, shaderUtils.OKLAB2SRGB]
})
