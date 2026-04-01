import {registerNode} from '../registry.js'

registerNode({
    slug: 'wavefold',
    icon: '🪭',
    label: 'Wavefold',
    tooltip: 'Steepens gradients and makes them ping-pong when they hit the ceiling. Higher drive = more folds = more repeating bands of detail from a single gradient.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'drive': {
            label: 'Drive',
            type: 'float',
            control: {default: 2.0, min: 1.0, max: 20.0, step: 0.1}
        },
        'bias': {
            label: 'Bias',
            type: 'float',
            control: {default: 0.0, min: -1.0, max: 1.0, step: 0.01}
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
                const inputColor = this.getInput('input', cc)
                const drive = this.getInput('drive', cc)
                const bias = this.getInput('bias', cc)
                const mix = this.getInput('mix', cc)
                const mode = this.getOption('mode')
                const channel = this.getOption('channel')

                const foldFunc = {
                    'triangle': `vec3 hd_fold(vec3 x) {
    return abs(mod(x + 1.0, 4.0) - 2.0) - 1.0;
}`,
                    'sine': `vec3 hd_fold(vec3 x) {
    return sin(x * 3.14159265);
}`,
                    'tanh': `vec3 hd_fold(vec3 x) {
    return tanh(x);
}`,
                    'chebyshev': `vec3 hd_fold(vec3 x) {
    // T5 Chebyshev polynomial: 16x^5 - 20x^3 + 5x — rich odd harmonics
    vec3 x2 = x * x;
    vec3 x3 = x2 * x;
    vec3 x5 = x3 * x2;
    return clamp(16.0 * x5 - 20.0 * x3 + 5.0 * x, -1.0, 1.0);
}`
                }[mode]

                const driveExpr = channel === 'rgb'
                    ? `vec3 driven = (color.rgb - 0.5 + ${bias}) * ${drive};
    vec3 folded = hd_fold(driven) * 0.5 + 0.5;
    vec3 result = mix(color.rgb, folded, ${mix});`
                    : `float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float driven_lum = (lum - 0.5 + ${bias}) * ${drive};
    float folded_lum = hd_fold(vec3(driven_lum)).x * 0.5 + 0.5;
    float lum_ratio = lum > 0.001 ? folded_lum / lum : 1.0;
    vec3 result = mix(color.rgb, color.rgb * lum_ratio, ${mix});`

                return `${foldFunc}
vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};
    ${driveExpr}
    return vec4(clamp(result, 0.0, 1.0), color.a);
}`
            }
        }
    },
    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'triangle',
            choices: [
                {value: 'triangle', name: 'Triangle Fold'},
                {value: 'sine', name: 'Sine Fold'},
                {value: 'tanh', name: 'Soft Clip (tanh)'},
                {value: 'chebyshev', name: 'Chebyshev T5'}
            ]
        },
        'channel': {
            label: 'Channel',
            type: 'select',
            default: 'rgb',
            choices: [
                {value: 'rgb', name: 'Per Channel'},
                {value: 'luminance', name: 'Luminance'}
            ]
        }
    }
})
