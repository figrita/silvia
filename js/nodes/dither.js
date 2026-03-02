import {registerNode} from '../registry.js'

registerNode({
    slug: 'dither',
    icon: '🪩',
    label: 'Dither',
    tooltip: 'Ordered dithering. The mask (0–1) controls brightness — the dither pattern determines which pixels in each tile get the Light vs Dark color.',
    input: {
        'mask': {
            label: 'Mask',
            type: 'float',
            control: {default: 0.5, min: 0, max: 1, step: 0.01}
        },
        'light': {
            label: 'Light',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'dark': {
            label: 'Dark',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'scale': {
            label: 'Scale',
            type: 'float',
            control: {default: 1, min: 1, max: 16, step: 1}
        }
    },

    options: {
        'mode': {
            label: 'Pattern',
            type: 'select',
            default: 'bayer4',
            choices: [
                {value: 'bayer2', name: 'Bayer 2x2'},
                {value: 'bayer4', name: 'Bayer 4x4'},
                {value: 'bayer8', name: 'Bayer 8x8'},
                {value: 'bluenoise', name: 'Blue Noise'}
            ]
        },
        'pixelate': {
            label: 'Pixelate',
            type: 'select',
            default: 'all',
            choices: [
                {value: 'all', name: 'All'},
                {value: 'mask', name: 'Mask Only'},
                {value: 'none', name: 'None'}
            ]
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const mode = this.getOption('mode')
                const pixelate = this.getOption('pixelate')
                const maskUV = pixelate !== 'none' ? 'quv' : 'uv'
                const colorUV = pixelate === 'all' ? 'quv' : 'uv'

                return `vec4 ${funcName}(vec2 uv) {
    float scale = ${this.getInput('scale', cc)};

    // Quantize UV to dither tile grid
    vec2 pixelCoord = floor(gl_FragCoord.xy / scale);
    vec2 quantizedScreenUV = (pixelCoord * scale + scale * 0.5) / u_resolution;
    float aspectRatio = u_resolution.x / u_resolution.y;
    vec2 quv = vec2((2.0 * quantizedScreenUV.x - 1.0) * aspectRatio, 2.0 * quantizedScreenUV.y - 1.0);

    float mask = clamp(${this.getInput('mask', cc, maskUV)}, 0.0, 1.0);
    vec4 light = ${this.getInput('light', cc, colorUV)};
    vec4 dark = ${this.getInput('dark', cc, colorUV)};

    ${mode === 'bayer2' ? `
    // Bayer 2x2 threshold matrix
    int x = int(mod(pixelCoord.x, 2.0));
    int y = int(mod(pixelCoord.y, 2.0));
    int idx = x + y * 2;
    float t;
    if (idx == 0) t = 0.0;
    else if (idx == 1) t = 2.0;
    else if (idx == 2) t = 3.0;
    else t = 1.0;
    float threshold = (t + 0.5) / 4.0;
    ` : mode === 'bayer4' ? `
    // Bayer 4x4 via bit-reversal interleave
    int x = int(mod(pixelCoord.x, 4.0));
    int y = int(mod(pixelCoord.y, 4.0));
    int val = 0;
    val |= ((x ^ y) & 1) << 3;
    val |= (y & 1) << 2;
    val |= ((x ^ y) & 2) >> 1 << 1;
    val |= (y & 2) >> 1;
    float threshold = (float(val) + 0.5) / 16.0;
    ` : mode === 'bayer8' ? `
    // Bayer 8x8 via bit-reversal interleave
    int x = int(mod(pixelCoord.x, 8.0));
    int y = int(mod(pixelCoord.y, 8.0));
    int val = 0;
    val |= ((x ^ y) & 1) << 5;
    val |= (y & 1) << 4;
    val |= ((x ^ y) & 2) >> 1 << 3;
    val |= (y & 2) >> 1 << 2;
    val |= ((x ^ y) & 4) >> 2 << 1;
    val |= (y & 4) >> 2;
    float threshold = (float(val) + 0.5) / 64.0;
    ` : `
    // Blue noise via double hash
    vec2 p = pixelCoord;
    float n = fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    n = fract(n * fract(sin(dot(p.yx + 31.71, vec2(269.5, 183.3))) * 28461.7231));
    float threshold = n;
    `}

    return mask > threshold ? light : dark;
}`
            }
        }
    }
})
