import {registerNode} from '../registry.js'

registerNode({
    slug: 'kuwahara',
    icon: '🎨',
    label: 'Kuwahara',
    tooltip: 'Painterly smoothing filter. Picks the smoothest quadrant around each pixel, preserving edges while creating an oil-painting effect.',

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null,
            samplingCost: '9-169'
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 3, min: 1, max: 6, step: 1}
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const radius = this.getInput('radius', cc)
                const inputSample = this.getInput('input', cc, 'kw_uv')

                return `vec4 ${funcName}(vec2 uv) {
    vec2 kw_texel = 1.0 / u_resolution;
    int kw_R = int(${radius});
    float kw_n = float((kw_R + 1) * (kw_R + 1));

    vec3 kw_mean0 = vec3(0.0), kw_mean1 = vec3(0.0), kw_mean2 = vec3(0.0), kw_mean3 = vec3(0.0);
    vec3 kw_sq0 = vec3(0.0), kw_sq1 = vec3(0.0), kw_sq2 = vec3(0.0), kw_sq3 = vec3(0.0);

    for (int x = -kw_R; x <= kw_R; x++) {
        for (int y = -kw_R; y <= kw_R; y++) {
            vec2 kw_uv = uv + vec2(float(x), float(y)) * kw_texel;
            vec3 c = (${inputSample}).rgb;
            if (x <= 0 && y <= 0) { kw_mean0 += c; kw_sq0 += c * c; }
            if (x >= 0 && y <= 0) { kw_mean1 += c; kw_sq1 += c * c; }
            if (x <= 0 && y >= 0) { kw_mean2 += c; kw_sq2 += c * c; }
            if (x >= 0 && y >= 0) { kw_mean3 += c; kw_sq3 += c * c; }
        }
    }

    kw_mean0 /= kw_n; kw_mean1 /= kw_n; kw_mean2 /= kw_n; kw_mean3 /= kw_n;
    vec3 kw_var0 = kw_sq0 / kw_n - kw_mean0 * kw_mean0;
    vec3 kw_var1 = kw_sq1 / kw_n - kw_mean1 * kw_mean1;
    vec3 kw_var2 = kw_sq2 / kw_n - kw_mean2 * kw_mean2;
    vec3 kw_var3 = kw_sq3 / kw_n - kw_mean3 * kw_mean3;

    float kw_v0 = dot(kw_var0, vec3(1.0));
    float kw_v1 = dot(kw_var1, vec3(1.0));
    float kw_v2 = dot(kw_var2, vec3(1.0));
    float kw_v3 = dot(kw_var3, vec3(1.0));

    float kw_minV = kw_v0;
    vec3 kw_result = kw_mean0;
    if (kw_v1 < kw_minV) { kw_minV = kw_v1; kw_result = kw_mean1; }
    if (kw_v2 < kw_minV) { kw_minV = kw_v2; kw_result = kw_mean2; }
    if (kw_v3 < kw_minV) { kw_result = kw_mean3; }

    vec2 kw_uv = uv;
    return vec4(kw_result, (${inputSample}).a);
}`
            }
        }
    }
})
