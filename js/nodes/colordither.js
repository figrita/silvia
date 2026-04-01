import {registerNode} from '../registry.js'

registerNode({
    slug: 'colordither',
    icon: '🧇',
    label: 'Color Dither',
    tooltip: 'Posterizes an image to fewer color levels with ordered dithering to smooth the banding. Lower levels = more retro, dither softens the transitions.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'levels': {
            label: 'Levels',
            type: 'float',
            control: {default: 4, min: 2, max: 32, step: 1}
        },
        'strength': {
            label: 'Dither',
            type: 'float',
            control: {default: 1.0, min: 0.0, max: 2.0, step: 0.01}
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
                {value: 'hex', name: 'Hexagonal'},
                {value: 'tri', name: 'Triangular'}
            ]
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const levels = this.getInput('levels', cc)
                const strength = this.getInput('strength', cc)
                const scale = this.getInput('scale', cc)
                const mode = this.getOption('mode')

                return `vec4 ${funcName}(vec2 uv) {
    float scale = ${scale};

    float aspectRatio = u_resolution.x / u_resolution.y;
    vec2 screenUV = vec2((uv.x / aspectRatio + 1.0) * 0.5, (uv.y + 1.0) * 0.5);
    vec2 pixelCoord = floor(screenUV * u_resolution / scale);

    ${mode === 'hex' ? `
    // Hexagonal grid dither — same grid math as mosaic
    float cellFreq = u_resolution.y / scale;
    vec2 p = uv * cellFreq;
    vec2 r = vec2(1.0, 1.73);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = round(p - gv);
    vec2 quv = id / cellFreq;
    vec4 color = ${this.getInput('input', cc, 'quv')};
    float ditherLevels = ${this.getInput('levels', cc, 'quv')};
    float ditherStrength = ${this.getInput('strength', cc, 'quv')};

    // Per-cell threshold from cell ID hash
    float threshold = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    ` : mode === 'tri' ? `
    // Triangular grid dither — same grid math as mosaic
    float cellFreq = u_resolution.y / scale;
    vec2 p = uv * cellFreq;
    float tx = p.x - p.y * 0.5;
    float ty = p.y * 0.866;
    vec2 cell = floor(vec2(tx, ty));
    vec2 f = fract(vec2(tx, ty));
    bool upperTri = f.x + f.y < 1.0;
    if (!upperTri) {
        cell += vec2(1.0, 1.0);
        f = 1.0 - f;
    }

    // Triangle center in grid space, then back to UV
    vec2 triCenter = cell + (upperTri ? vec2(0.333, 0.333) : vec2(-0.333, -0.333));
    vec2 quv = vec2(triCenter.x + triCenter.y / 0.866 * 0.5, triCenter.y / 0.866) / cellFreq;
    vec4 color = ${this.getInput('input', cc, 'quv')};
    float ditherLevels = ${this.getInput('levels', cc, 'quv')};
    float ditherStrength = ${this.getInput('strength', cc, 'quv')};

    // Per-cell threshold from cell ID hash
    float threshold = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    ` : `
    // Square Bayer dither — sample everything from cell center
    vec2 cellCenter = (pixelCoord * scale + scale * 0.5) / u_resolution;
    vec2 quv = vec2((2.0 * cellCenter.x - 1.0) * aspectRatio, 2.0 * cellCenter.y - 1.0);
    vec4 color = ${this.getInput('input', cc, 'quv')};
    float ditherLevels = ${this.getInput('levels', cc, 'quv')};
    float ditherStrength = ${this.getInput('strength', cc, 'quv')};

    ${mode === 'bayer2' ? `
    int x = int(mod(pixelCoord.x, 2.0));
    int y = int(mod(pixelCoord.y, 2.0));
    int idx = x + y * 2;
    float t;
    if (idx == 0) t = 0.0;
    else if (idx == 1) t = 2.0;
    else if (idx == 2) t = 3.0;
    else t = 1.0;
    float threshold = (t + 0.5) / 4.0 - 0.5;
    ` : mode === 'bayer4' ? `
    int x = int(mod(pixelCoord.x, 4.0));
    int y = int(mod(pixelCoord.y, 4.0));
    int val = 0;
    val |= ((x ^ y) & 1) << 3;
    val |= (y & 1) << 2;
    val |= ((x ^ y) & 2) >> 1 << 1;
    val |= (y & 2) >> 1;
    float threshold = (float(val) + 0.5) / 16.0 - 0.5;
    ` : `
    int x = int(mod(pixelCoord.x, 8.0));
    int y = int(mod(pixelCoord.y, 8.0));
    int val = 0;
    val |= ((x ^ y) & 1) << 5;
    val |= (y & 1) << 4;
    val |= ((x ^ y) & 2) >> 1 << 3;
    val |= (y & 2) >> 1 << 2;
    val |= ((x ^ y) & 4) >> 2 << 1;
    val |= (y & 4) >> 2;
    float threshold = (float(val) + 0.5) / 64.0 - 0.5;
    `}
    `}

    // Add dither offset before quantizing
    vec3 dithered = color.rgb + threshold * ditherStrength / ditherLevels;
    vec3 result = floor(dithered * ditherLevels + 0.5) / ditherLevels;

    return vec4(clamp(result, 0.0, 1.0), color.a);
}`
            }
        }
    }
})
