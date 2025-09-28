import {registerNode} from '../registry.js'

registerNode({
    slug: 'regionabsolute',
    icon: '⯐',
    label: 'Region (Absolute)',
    tooltip: 'Crops the input to a rectangular region using absolute coordinates. Choose background color, tile, or mirror tile for areas outside the crop rectangle.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'top': {
            label: 'Top',
            type: 'float',
            control: {default: 1.0, min: -4.0, max: 4.0, step: 0.01, unit: '⬓'}
        },
        'bottom': {
            label: 'Bottom',
            type: 'float',
            control: {default: -1.0, min: -4.0, max: 4.0, step: 0.01, unit: '⬓'}
        },
        'left': {
            label: 'Left',
            type: 'float',
            control: {default: -1.0, min: -4.0, max: 4.0, step: 0.01, unit: '⬓'}
        },
        'right': {
            label: 'Right',
            type: 'float',
            control: {default: 1.0, min: -4.0, max: 4.0, step: 0.01, unit: '⬓'}
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
    float left = ${this.getInput('left', cc)};
    float right = ${this.getInput('right', cc)};
    float bottom = ${this.getInput('bottom', cc)};
    float top = ${this.getInput('top', cc)};
    float softness = ${this.getInput('softness', cc)};
    vec4 bgColor = ${this.getInput('bgColor', cc)};

    // Calculate crop rectangle bounds
    vec2 cropMin = vec2(left, bottom);
    vec2 cropMax = vec2(right, top);

    // Determine if we're inside the crop area
    bool inside = (uv.x >= cropMin.x && uv.x <= cropMax.x &&
                   uv.y >= cropMin.y && uv.y <= cropMax.y);

    vec2 sampleUV = uv;
    float width = right - left;
    float height = top - bottom;

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
    vec2 center = (cropMin + cropMax) * 0.5;
    vec2 halfSize = (cropMax - cropMin) * 0.5;
    vec2 offset = abs(uv - center);
    vec2 overshoot = max(vec2(0.0), offset - halfSize);
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
    float left = ${this.getInput('left', cc)};
    float right = ${this.getInput('right', cc)};
    float bottom = ${this.getInput('bottom', cc)};
    float top = ${this.getInput('top', cc)};
    float softness = ${this.getInput('softness', cc)};

    // Calculate crop rectangle bounds
    vec2 cropMin = vec2(left, bottom);
    vec2 cropMax = vec2(right, top);

    // Check if we're inside the original crop area
    bool inside = (uv.x >= cropMin.x && uv.x <= cropMax.x &&
                   uv.y >= cropMin.y && uv.y <= cropMax.y);

    ${mode === 'background' ? `
    // Background mode: standard distance-based mask with softness
    vec2 center = (cropMin + cropMax) * 0.5;
    vec2 halfSize = (cropMax - cropMin) * 0.5;
    vec2 offset = abs(uv - center);
    vec2 overshoot = max(vec2(0.0), offset - halfSize);
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