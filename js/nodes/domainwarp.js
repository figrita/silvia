import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

function genWarpCode(node, cc, funcName, outputType) {
    const amplitude = node.getInput('amplitude', cc)
    const frequency = node.getInput('frequency', cc)
    const octaves = node.getInput('octaves', cc)
    const lacunarity = node.getInput('lacunarity', cc)
    const gain = node.getInput('gain', cc)
    const seed = node.getInput('seed', cc)
    const timeSpeed = node.getInput('timeSpeed', cc)
    const type = node.getOption('type')
    const iterations = parseInt(node.getOption('iterations'))

    const noiseTransform = type === 'turbulence' ? `
        n = abs(n * 2.0 - 1.0);` : type === 'ridged' ? `
        n = 1.0 - abs(n * 2.0 - 1.0);
        n = n * n;` : ``

    let iterationCode = ''
    const offsets = [
        ['vec2(0.0, 0.0)', 'vec2(5.2, 1.3)'],
        ['vec2(1.7, 9.2)', 'vec2(8.3, 2.8)'],
        ['vec2(3.1, 7.4)', 'vec2(6.9, 4.6)']
    ]
    for (let i = 0; i < iterations; i++) {
        iterationCode += `
    dw_warp = vec2(
        dw_fbm(uv * dw_freq + dw_warp * dw_amp + dw_seedOff + ${offsets[i][0]}, dw_freq, dw_oct, dw_lac, dw_gn, dw_t),
        dw_fbm(uv * dw_freq + dw_warp * dw_amp + dw_seedOff + ${offsets[i][1]}, dw_freq, dw_oct, dw_lac, dw_gn, dw_t)
    );`
    }

    const returnStatement = outputType === 'color'
        ? `vec2 warpedUV = uv + dw_warp * dw_amp;
    return ${node.getInput('input', cc, 'warpedUV')};`
        : `return clamp(length(dw_warp), 0.0, 1.0);`

    const retType = outputType === 'color' ? 'vec4' : 'float'

    return `float dw_fbm(vec2 p, float freq, int oct, float lac, float gn, float t) {
    float sum = 0.0;
    float amp = 1.0;
    float totalAmp = 0.0;
    for (int i = 0; i < oct; i++) {
        float n = snoise3(vec3(p * freq, t + float(i) * 0.3)) * 0.5 + 0.5;${noiseTransform}
        sum += amp * n;
        totalAmp += amp;
        freq *= lac;
        amp *= gn;
    }
    return sum / totalAmp;
}

${retType} ${funcName}(vec2 uv) {
    float dw_amp = ${amplitude};
    float dw_freq = ${frequency};
    int dw_oct = int(${octaves});
    float dw_lac = ${lacunarity};
    float dw_gn = ${gain};
    float dw_t = u_time * ${timeSpeed};
    vec2 dw_seedOff = vec2(${seed} * 0.1317, ${seed} * 0.0741);

    vec2 dw_warp = vec2(0.0);
    ${iterationCode}

    ${returnStatement}
}`
}

registerNode({
    slug: 'domainwarp',
    icon: '🫠',
    label: 'Domain Warp',
    tooltip: 'Warps input UVs using layered simplex noise. Multiple iterations feed the warp back into itself for increasingly organic distortion.',

    shaderUtils: [shaderUtils.SIMPLEX3D],

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'amplitude': {
            label: 'Amplitude',
            type: 'float',
            control: {default: 0.5, min: 0.0, max: 2.0, step: 0.01}
        },
        'timeSpeed': {
            label: 'Time Speed',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 5.0, step: 0.01}
        },
        'frequency': {
            label: 'Frequency',
            type: 'float',
            control: {default: 3.0, min: 0.1, max: 20.0, step: 0.1}
        },
        'octaves': {
            label: 'Octaves',
            type: 'float',
            control: {default: 4, min: 1, max: 8, step: 1}
        },
        'lacunarity': {
            label: 'Lacunarity',
            type: 'float',
            control: {default: 2.0, min: 1.0, max: 4.0, step: 0.1}
        },
        'gain': {
            label: 'Gain',
            type: 'float',
            control: {default: 0.5, min: 0.1, max: 1.0, step: 0.01}
        },
        'seed': {
            label: 'Seed',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1000.0, step: 1.0}
        }
    },

    options: {
        'type': {
            label: 'Type',
            type: 'select',
            default: 'standard',
            choices: [
                {value: 'standard', name: 'Standard'},
                {value: 'turbulence', name: 'Turbulence'},
                {value: 'ridged', name: 'Ridged'}
            ]
        },
        'iterations': {
            label: 'Iterations',
            type: 'select',
            default: '1',
            choices: [
                {value: '1', name: '1'},
                {value: '2', name: '2'},
                {value: '3', name: '3'}
            ]
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return genWarpCode(this, cc, funcName, 'color')
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            genCode(cc, funcName){
                return genWarpCode(this, cc, funcName, 'float')
            }
        }
    }
})
