import {registerNode} from '../registry.js'

registerNode({
    slug: 'repeater',
    icon: '🪩',
    label: 'Repeater',
    tooltip: 'Repeats a rectangular region from the input in a grid pattern. Define the source region and how many rows/columns to repeat.',

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'sourceX': {
            label: 'Source X',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01, unit: '⬓'}
        },
        'sourceY': {
            label: 'Source Y',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01, unit: '⬓'}
        },
        'sourceWidth': {
            label: 'Source Width',
            type: 'float',
            control: {default: 0.5, min: 0.01, max: 4.0, step: 0.01, unit: '⬓'}
        },
        'sourceHeight': {
            label: 'Source Height',
            type: 'float',
            control: {default: 0.5, min: 0.01, max: 4.0, step: 0.01, unit: '⬓'}
        },
        'rows': {
            label: 'Rows',
            type: 'float',
            control: {default: 3, min: 1, max: 20, step: 1}
        },
        'columns': {
            label: 'Columns',
            type: 'float',
            control: {default: 3, min: 1, max: 20, step: 1}
        },
        'spacing': {
            label: 'Spacing',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 0.01, unit: '⬓'}
        },
        'bgColor': {
            label: 'Background',
            type: 'color',
            control: {default: '#00000000'} // Transparent by default
        }
    },

    options: {
        'alignment': {
            label: 'Alignment',
            type: 'select',
            default: 'center',
            choices: [
                {value: 'center', name: 'Center'},
                {value: 'top-left', name: 'Top-Left'},
                {value: 'top-right', name: 'Top-Right'},
                {value: 'bottom-left', name: 'Bottom-Left'},
                {value: 'bottom-right', name: 'Bottom-Right'}
            ]
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const alignment = this.getOption('alignment')

                return `vec4 ${funcName}(vec2 uv) {
    float sourceX = ${this.getInput('sourceX', cc)};
    float sourceY = ${this.getInput('sourceY', cc)};
    float sourceWidth = ${this.getInput('sourceWidth', cc)};
    float sourceHeight = ${this.getInput('sourceHeight', cc)};
    float rows = ${this.getInput('rows', cc)};
    float columns = ${this.getInput('columns', cc)};
    float spacing = ${this.getInput('spacing', cc)};
    vec4 bgColor = ${this.getInput('bgColor', cc)};

    // Calculate cell dimensions including spacing
    float cellWidth = sourceWidth + spacing;
    float cellHeight = sourceHeight + spacing;

    // Calculate total grid dimensions
    float totalWidth = columns * cellWidth - spacing;  // Remove spacing from last column
    float totalHeight = rows * cellHeight - spacing;   // Remove spacing from last row

    // Calculate grid offset based on alignment
    vec2 gridOffset = vec2(0.0);
    ${alignment === 'center' ? `
    gridOffset = vec2(-totalWidth * 0.5, -totalHeight * 0.5);
    ` : alignment === 'top-left' ? `
    gridOffset = vec2(-1.0, 1.0 - totalHeight);
    ` : alignment === 'top-right' ? `
    gridOffset = vec2(1.0 - totalWidth, 1.0 - totalHeight);
    ` : alignment === 'bottom-left' ? `
    gridOffset = vec2(-1.0, -1.0);
    ` : alignment === 'bottom-right' ? `
    gridOffset = vec2(1.0 - totalWidth, -1.0);
    ` : `
    gridOffset = vec2(-totalWidth * 0.5, -totalHeight * 0.5);
    `}

    // Transform UV to grid space
    vec2 gridUV = uv - gridOffset;

    // Check if we're within the grid bounds
    if (gridUV.x < 0.0 || gridUV.x > totalWidth ||
        gridUV.y < 0.0 || gridUV.y > totalHeight) {
        return bgColor;
    }

    // Calculate which cell we're in
    float cellX = floor(gridUV.x / cellWidth);
    float cellY = floor(gridUV.y / cellHeight);

    // Check if we're in a valid cell (not beyond grid)
    if (cellX >= columns || cellY >= rows) {
        return bgColor;
    }

    // Calculate position within the current cell
    vec2 cellUV = mod(gridUV, vec2(cellWidth, cellHeight));

    // Check if we're in the spacing area
    if (cellUV.x > sourceWidth || cellUV.y > sourceHeight) {
        return bgColor;
    }

    // Map cell UV to source region
    vec2 sourceUV = vec2(sourceX, sourceY) + cellUV - vec2(sourceWidth * 0.5, sourceHeight * 0.5);

    // Sample the input at the source location
    return ${this.getInput('input', cc, 'sourceUV')};
}`
            }
        },
        'mask': {
            label: 'Grid Mask',
            type: 'float',
            genCode(cc, funcName){
                const alignment = this.getOption('alignment')

                return `float ${funcName}(vec2 uv) {
    float sourceWidth = ${this.getInput('sourceWidth', cc)};
    float sourceHeight = ${this.getInput('sourceHeight', cc)};
    float rows = ${this.getInput('rows', cc)};
    float columns = ${this.getInput('columns', cc)};
    float spacing = ${this.getInput('spacing', cc)};

    // Calculate cell dimensions including spacing
    float cellWidth = sourceWidth + spacing;
    float cellHeight = sourceHeight + spacing;

    // Calculate total grid dimensions
    float totalWidth = columns * cellWidth - spacing;
    float totalHeight = rows * cellHeight - spacing;

    // Calculate grid offset based on alignment
    vec2 gridOffset = vec2(0.0);
    ${alignment === 'center' ? `
    gridOffset = vec2(-totalWidth * 0.5, -totalHeight * 0.5);
    ` : alignment === 'top-left' ? `
    gridOffset = vec2(-1.0, 1.0 - totalHeight);
    ` : alignment === 'top-right' ? `
    gridOffset = vec2(1.0 - totalWidth, 1.0 - totalHeight);
    ` : alignment === 'bottom-left' ? `
    gridOffset = vec2(-1.0, -1.0);
    ` : alignment === 'bottom-right' ? `
    gridOffset = vec2(1.0 - totalWidth, -1.0);
    ` : `
    gridOffset = vec2(-totalWidth * 0.5, -totalHeight * 0.5);
    `}

    // Transform UV to grid space
    vec2 gridUV = uv - gridOffset;

    // Check if we're within the grid bounds
    if (gridUV.x < 0.0 || gridUV.x > totalWidth ||
        gridUV.y < 0.0 || gridUV.y > totalHeight) {
        return 0.0;
    }

    // Calculate which cell we're in
    float cellX = floor(gridUV.x / cellWidth);
    float cellY = floor(gridUV.y / cellHeight);

    // Check if we're in a valid cell
    if (cellX >= columns || cellY >= rows) {
        return 0.0;
    }

    // Calculate position within the current cell
    vec2 cellUV = mod(gridUV, vec2(cellWidth, cellHeight));

    // Check if we're in the content area (not spacing)
    if (cellUV.x <= sourceWidth && cellUV.y <= sourceHeight) {
        return 1.0;
    }

    return 0.0;
}`
            }
        }
    }
})