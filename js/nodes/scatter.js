import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'scatter',
    icon: '👣',
    label: 'Scatter',
    tooltip: 'Scatters randomized copies of the input across the plane with blue-noise spacing. Each copy can be jittered, rotated, flipped, and scaled. Overlap mode checks neighboring cells for seamless edges (cost: 3 → 27 samples per pixel).',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null,
            samplingCost: '3-27'
        },
        'bgColor': {
            label: 'Background',
            type: 'color',
            control: {default: '#00000000'}
        },
        'density': {
            label: 'Density',
            type: 'float',
            control: {default: 5, min: 1, max: 50, step: 0.1}
        },
        'presence': {
            label: 'Presence',
            type: 'float',
            control: {default: 1.0, min: 0.0, max: 1.0, step: 0.01}
        },
        'jitter': {
            label: 'Jitter',
            type: 'float',
            control: {default: 0.3, min: 0.0, max: 1.0, step: 0.01}
        },
        'rotation': {
            label: 'Rotation',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 0.01}
        },
        'scale': {
            label: 'Scale',
            type: 'float',
            control: {default: 0.7, min: 0.01, max: 2.0, step: 0.01}
        },
        'scaleVariation': {
            label: 'Scale Var',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 0.01}
        },
        'flipChance': {
            label: 'Flip',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 0.01}
        },
        'seed': {
            label: 'Seed',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1000.0, step: 1.0}
        }
    },
    options: {
        'overlap': {
            label: 'Overlap',
            type: 'select',
            default: 'off',
            choices: [
                {value: 'off', name: 'Off (3 samples)'},
                {value: 'on', name: 'On (27 samples)'}
            ]
        }
    },
    shaderUtils: [shaderUtils.HASH_RANDOM],
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const bgColor = this.getInput('bgColor', cc)
                const density = this.getInput('density', cc)
                const presence = this.getInput('presence', cc)
                const jitter = this.getInput('jitter', cc)
                const rotation = this.getInput('rotation', cc)
                const scale = this.getInput('scale', cc)
                const scaleVar = this.getInput('scaleVariation', cc)
                const flipChance = this.getInput('flipChance', cc)
                const seed = this.getInput('seed', cc)
                const overlap = this.getOption('overlap') === 'on'

                return `vec4 ${funcName}(vec2 uv) {
    float baseSize = 2.0 / max(${density}, 1.0);
    vec2 seedOff = vec2(${seed} * 0.1317, ${seed} * 0.0741);
    vec4 result = ${bgColor};

    // Three independent grids at different spacings
    // Copies interleave naturally — no tree clustering
    float layerScales[3] = float[3](4.0, 2.0, 1.0);
    float layerChance[3] = float[3](0.12, 0.20, 0.35);
    float layerOffsets[3] = float[3](0.0, 10000.0, 20000.0);

    for (int i = 0; i < 3; i++) {
        float lCellSize = baseSize * layerScales[i];
        vec2 baseCell = floor(uv / lCellSize);

        ${overlap ? `// 3x3 neighborhood: copies cross cell boundaries cleanly
        for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {` : `// Single cell only
        { {
            int dx = 0; int dy = 0;`}
            vec2 lCell = baseCell + vec2(float(dx), float(dy)) + layerOffsets[i];

            vec2 cs = lCell + seedOff;
            float h1 = random_rng(cs);
            float h2 = random_rng(cs + 1.0);
            float h3 = random_rng(cs + 2.0);
            float h4 = random_rng(cs + 3.0);
            float h5 = random_rng(cs + 4.0);
            float h6 = random_rng(cs + 5.0);

            if (h6 > ${presence} * layerChance[i]) continue;

            // Copy center
            vec2 neighborOrigin = (baseCell + vec2(float(dx), float(dy))) * lCellSize;
            vec2 copyCenter = neighborOrigin + lCellSize * 0.5
                + (vec2(h1, h2) - 0.5) * lCellSize * ${jitter};

            float copyScale = ${scale} * (1.0 - ${scaleVar} + ${scaleVar} * h5 * 2.0);
            float halfExtent = 0.2 * max(copyScale, 0.01);

            ${overlap ? `// Quick bounding box reject
            if (abs(uv.x - copyCenter.x) > halfExtent * 1.5 ||
                abs(uv.y - copyCenter.y) > halfExtent * 1.5) continue;` : ``}

            vec2 localUV = uv - copyCenter;

            float angle = (h3 - 0.5) * ${rotation} * 2.0 * PI;
            float cv = cos(-angle);
            float sv = sin(-angle);
            localUV = mat2(cv, -sv, sv, cv) * localUV;

            localUV /= halfExtent;

            if (h4 < ${flipChance}) localUV.x = -localUV.x;

            if (abs(localUV.x) > 1.0 || abs(localUV.y) > 1.0) continue;

            vec2 sampleUV = localUV;
            vec4 sampleColor = ${this.getInput('input', cc, 'sampleUV')};
            result = mix(result, sampleColor, sampleColor.a);
        }
        }
    }

    return result;
}`
            }
        }
    }
})
