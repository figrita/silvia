import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'pixelsort',
    icon: '📊',
    label: 'Pixel Sort',
    tooltip: 'Sorts pixels by brightness in variable-length chunks with hash-randomized boundaries. Classic glitch art.',

    shaderUtils: [shaderUtils.HASH_RANDOM, shaderUtils.RGB2LUM, shaderUtils.RGB2HSV],

    runtimeState: {
        seed: 0
    },

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null,
            samplingCost: '16-64'
        },
        'threshold': {
            label: 'Threshold',
            type: 'float',
            control: {default: 0.3, min: 0.0, max: 1.0, step: 0.01}
        },
        'reseed': {
            label: 'New Seed',
            type: 'action',
            control: {},
            downCallback(){
                this.runtimeState.seed = Math.floor(Math.random() * 100000)
            }
        }
    },

    options: {
        'direction': {
            label: 'Direction',
            type: 'select',
            default: 'horizontal',
            choices: [
                {value: 'horizontal', name: 'Horizontal'},
                {value: 'vertical', name: 'Vertical'}
            ]
        },
        'sortBy': {
            label: 'Sort By',
            type: 'select',
            default: 'brightness',
            choices: [
                {value: 'brightness', name: 'Brightness'},
                {value: 'hue', name: 'Hue'}
            ]
        },
        'sortOrder': {
            label: 'Sort',
            type: 'select',
            default: 'ascending',
            choices: [
                {value: 'ascending', name: 'Ascending'},
                {value: 'descending', name: 'Descending'}
            ]
        },
        'chunkSize': {
            label: 'Chunk Size',
            type: 'select',
            default: '32',
            choices: [
                {value: '16', name: '16'},
                {value: '32', name: '32'},
                {value: '64', name: '64'}
            ]
        },
        'animate': {
            label: 'Animate',
            type: 'select',
            default: 'off',
            choices: [
                {value: 'off', name: 'Off'},
                {value: 'on', name: 'On'}
            ]
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName){
                const threshold = this.getInput('threshold', cc)
                const inputSample = this.getInput('input', cc, 'ps_uv')
                const direction = this.getOption('direction')
                const sortBy = this.getOption('sortBy')
                const sortOrder = this.getOption('sortOrder')
                const chunkSize = parseInt(this.getOption('chunkSize'))
                const ascending = sortOrder === 'ascending'
                const animate = this.getOption('animate') === 'on'

                const isHoriz = direction === 'horizontal'
                const cmp = ascending ? '>' : '<'
                const keyExpr = sortBy === 'hue'
                    ? `rgb2hsv((${inputSample}).rgb).x`
                    : `rgb2lum((${inputSample}).rgb)`

                const seedUniform = `${uniformName}_seed`
                cc.uniforms.set(seedUniform, {
                    type: 'float',
                    sourcePort: this.output.output
                })

                return `vec4 ${funcName}(vec2 uv) {
    float ps_step = 2.0 / u_resolution.y;
    vec2 dir = ${isHoriz ? 'vec2(ps_step, 0.0)' : 'vec2(0.0, ps_step)'};
    float thresh = ${threshold};
    uint ps_salt = hash_rng(uint(${seedUniform})${animate ? ' ^ hash_rng(uint(u_current_frame_index))' : ''});

    // Absolute pixel coordinates
    float ps_aspect = u_resolution.x / u_resolution.y;
    ${isHoriz ? `int ps_scanIdx = int(floor((uv.x / ps_aspect + 1.0) * 0.5 * u_resolution.x));
    int ps_rowIdx = int(floor((uv.y + 1.0) * 0.5 * u_resolution.y));`
        : `int ps_scanIdx = int(floor((uv.y + 1.0) * 0.5 * u_resolution.y));
    int ps_rowIdx = int(floor((uv.x / ps_aspect + 1.0) * 0.5 * u_resolution.x));`}

    // Per-row offset so super-chunk boundaries don't align across rows
    uint ps_rowHash = hash_rng(uint(ps_rowIdx) ^ ps_salt);
    int ps_shifted = ps_scanIdx + int(ps_rowHash % uint(${chunkSize}));

    // Super-chunk index and position within it
    int ps_superIdx = ps_shifted / ${chunkSize};
    int ps_posInSuper = ps_shifted - ps_superIdx * ${chunkSize};

    // Hash (super-chunk + row) → random split point within super-chunk
    int ps_splitAt = int(hash_rng(uint(ps_superIdx) ^ ps_rowHash) % uint(${chunkSize}));

    // Which sub-chunk does this pixel belong to?
    int ps_subStart, ps_subLen;
    if (ps_posInSuper < ps_splitAt) {
        ps_subStart = 0;
        ps_subLen = ps_splitAt;
    } else {
        ps_subStart = ps_splitAt;
        ps_subLen = ${chunkSize} - ps_splitAt;
    }
    int myPos = ps_posInSuper - ps_subStart;

    // Sub-chunk too small to sort → passthrough
    vec2 ps_uv = uv;
    if (ps_subLen <= 1) return ${inputSample};

    // UV of sub-chunk start
    vec2 chunkStartUV = uv - dir * float(myPos);

    // Load sub-chunk pixels, track min/max brightness
    float ps_keys[${chunkSize}];
    int ps_indices[${chunkSize}];
    float ps_minKey = 1.0;
    float ps_maxKey = 0.0;

    for (int i = 0; i < ${chunkSize}; i++) {
        if (i >= ps_subLen) break;
        ps_uv = chunkStartUV + dir * float(i);
        float k = ${keyExpr};
        ps_keys[i] = k;
        ps_indices[i] = i;
        ps_minKey = min(ps_minKey, k);
        ps_maxKey = max(ps_maxKey, k);
    }

    // Chunk contrast too low → passthrough
    ps_uv = uv;
    if (thresh >= 1.0 || ps_maxKey - ps_minKey < thresh) return ${inputSample};

    // Insertion sort
    for (int i = 1; i < ${chunkSize}; i++) {
        if (i >= ps_subLen) break;
        float k = ps_keys[i];
        int idx = ps_indices[i];
        int insertPos = i;
        for (int j = i - 1; j >= 0; j--) {
            if (!(ps_keys[j] ${cmp} k)) break;
            ps_keys[j + 1] = ps_keys[j];
            ps_indices[j + 1] = ps_indices[j];
            insertPos = j;
        }
        ps_keys[insertPos] = k;
        ps_indices[insertPos] = idx;
    }

    // Output the pixel that sorts to my position
    ps_uv = chunkStartUV + dir * float(ps_indices[myPos]);
    return ${inputSample};
}`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed) return
                if(uniformName.endsWith('_seed')){
                    const location = gl.getUniformLocation(program, uniformName)
                    if(location) gl.uniform1f(location, this.runtimeState.seed)
                }
            }
        }
    }
})
