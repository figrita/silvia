import {registerNode} from '../registry.js'

registerNode({
    slug: 'regionsized',
    icon: '⛶',
    label: 'Region (Sized)',
    tooltip: 'Crops the input to a rectangular region using center position and size. Choose background color, tile, or mirror tile for areas outside the crop rectangle.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
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
        },
        'width': {
            label: 'Width',
            type: 'float',
            control: {default: 1.0, min: 0.01, max: 4.0, step: 0.01, unit: '⬓'}
        },
        'height': {
            label: 'Height',
            type: 'float',
            control: {default: 1.0, min: 0.01, max: 4.0, step: 0.01, unit: '⬓'}
        },
        'softness': {
            label: 'Edge Softness',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 0.2, step: 0.001, unit: '⬓'}
        },
        'bgColor': {
            label: 'Background',
            type: 'color',
            control: {default: '#00000000'} // Transparent by default
        }
    },

    options: {
        'mode': {
            label: 'Outside Mode',
            type: 'select',
            default: 'background',
            choices: [
                {value: 'background', name: 'Background Color'},
                {value: 'tile', name: 'Tile'},
                {value: 'mirror', name: 'Mirror Tile'},
                {value: 'clamp', name: 'Clamp'}
            ]
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const mode = this.getOption('mode')

                return `vec4 ${funcName}(vec2 uv) {
    float centerX = ${this.getInput('centerX', cc)};
    float centerY = ${this.getInput('centerY', cc)};
    float width = ${this.getInput('width', cc)};
    float height = ${this.getInput('height', cc)};
    float softness = ${this.getInput('softness', cc)};
    vec4 bgColor = ${this.getInput('bgColor', cc)};

    // Calculate half dimensions
    float halfWidth = width * 0.5;
    float halfHeight = height * 0.5;

    // Calculate crop rectangle bounds
    vec2 center = vec2(centerX, centerY);
    vec2 cropMin = center - vec2(halfWidth, halfHeight);
    vec2 cropMax = center + vec2(halfWidth, halfHeight);

    // Determine if we're inside the crop area
    bool inside = (uv.x >= cropMin.x && uv.x <= cropMax.x &&
                   uv.y >= cropMin.y && uv.y <= cropMax.y);

    vec2 sampleUV = uv;

    ${mode === 'tile' ? `
    // Tile mode: wrap coordinates to crop area
    if (!inside) {
        vec2 localUV = uv - cropMin;
        vec2 tileUV = mod(localUV, vec2(width, height));
        sampleUV = cropMin + tileUV;
    }
    ` : mode === 'mirror' ? `
    // Mirror tile mode: ping-pong coordinates
    if (!inside) {
        vec2 localUV = uv - cropMin;
        vec2 tileSize = vec2(width, height);
        vec2 tileUV = mod(localUV, tileSize * 2.0);

        // Mirror every other tile
        if (tileUV.x > width) tileUV.x = width * 2.0 - tileUV.x;
        if (tileUV.y > height) tileUV.y = height * 2.0 - tileUV.y;

        sampleUV = cropMin + tileUV;
    }
    ` : mode === 'clamp' ? `
    // Clamp mode: clamp coordinates to crop area edges
    sampleUV = clamp(uv, cropMin, cropMax);
    ` : `
    // Background mode: use original UV for sampling
    `}

    // Sample the input
    vec4 inputColor = ${this.getInput('input', cc, 'sampleUV')};

    ${mode === 'background' ? `
    // Calculate distance from crop edge for softness
    vec2 offset = abs(uv - center);
    vec2 overshoot = max(vec2(0.0), offset - vec2(halfWidth, halfHeight));
    float edgeDistance = length(overshoot);

    // Apply softness to the edge
    float mask = 1.0 - smoothstep(0.0, softness, edgeDistance);

    // Mix between input and background based on crop mask
    return mix(bgColor, inputColor, mask);
    ` : `
    // For tile, mirror, and clamp modes, no softness applied - just return the sampled color
    return inputColor;
    `}
}`
            }
        },
        'mask': {
            label: 'Crop Mask',
            type: 'float',
            genCode(cc, funcName){
                const mode = this.getOption('mode')

                return `float ${funcName}(vec2 uv) {
    float centerX = ${this.getInput('centerX', cc)};
    float centerY = ${this.getInput('centerY', cc)};
    float width = ${this.getInput('width', cc)};
    float height = ${this.getInput('height', cc)};
    float softness = ${this.getInput('softness', cc)};

    // Calculate half dimensions
    float halfWidth = width * 0.5;
    float halfHeight = height * 0.5;

    // Calculate crop rectangle bounds
    vec2 center = vec2(centerX, centerY);
    vec2 cropMin = center - vec2(halfWidth, halfHeight);
    vec2 cropMax = center + vec2(halfWidth, halfHeight);

    // Check if we're inside the original crop area
    bool inside = (uv.x >= cropMin.x && uv.x <= cropMax.x &&
                   uv.y >= cropMin.y && uv.y <= cropMax.y);

    ${mode === 'background' ? `
    // Background mode: standard distance-based mask with softness
    vec2 offset = abs(uv - center);
    vec2 overshoot = max(vec2(0.0), offset - vec2(halfWidth, halfHeight));
    float edgeDistance = length(overshoot);
    return 1.0 - smoothstep(0.0, softness, edgeDistance);
    ` : `
    // Tile, mirror, and clamp modes: 1.0 everywhere (no softness applied)
    return 1.0;
    `}
}`
            }
        }
    }
})