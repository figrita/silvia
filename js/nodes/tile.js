import {registerNode} from '../registry.js'

registerNode({
    slug: 'tile',
    icon: '𝄜',
    label: 'Tile',
    tooltip: 'Repeats the input image in a tiled pattern. Use slide to offset rows or columns for brick-like patterns.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'width': {
            label: 'Width',
            type: 'float',
            control: {default: 2.0, min: 0.1, max: 10.0, step: 0.1, unit: '⬓'}
        },
        'height': {
            label: 'Height',
            type: 'float',
            control: {default: 2.0, min: 0.1, max: 10.0, step: 0.1, unit: '⬓'}
        },
        'span': {
            label: 'Span',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 5.0, step: 0.01}
        },
        'offsetX': {
            label: 'Offset X',
            type: 'float',
            control: {default: 0.0, min: -5.0, max: 5.0, step: 0.01, unit: '⬓'}
        },
        'offsetY': {
            label: 'Offset Y',
            type: 'float',
            control: {default: 0.0, min: -5.0, max: 5.0, step: 0.01, unit: '⬓'}
        },
        'slide': {
            label: 'Slide',
            type: 'float',
            control: {default: 0.0, min: -1.0, max: 1.0, step: 0.01}
        }
    },
    
    options: {
        'slideDirection': {
            label: 'Slide Direction',
            type: 'select',
            default: 'horizontal',
            choices: [
                {value: 'horizontal', name: 'Horizontal (Rows)'},
                {value: 'vertical', name: 'Vertical (Columns)'}
            ]
        }
    },
    
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const width = this.getInput('width', cc)
                const height = this.getInput('height', cc)
                const span = this.getInput('span', cc)
                const offsetX = this.getInput('offsetX', cc)
                const offsetY = this.getInput('offsetY', cc)
                const slide = this.getInput('slide', cc)
                const slideDirection = this.getOption('slideDirection')

                return `vec4 ${funcName}(vec2 uv) {
    // Apply span (zoom out effect)
    vec2 scaledUV = uv * ${span};
    
    // Apply offset
    scaledUV += vec2(${offsetX}, ${offsetY});
    
    // Calculate half dimensions
    float halfWidth = ${width} * 0.5;
    float halfHeight = ${height} * 0.5;
    
    // Apply slide offset based on direction
    vec2 slideOffset = vec2(0.0);
    ${slideDirection === 'horizontal' ? `
    // Horizontal slide: offset rows based on Y position
    float rowIndex = floor((scaledUV.y + halfHeight) / ${height});
    slideOffset.x = ${slide} * ${width} * rowIndex;` : `
    // Vertical slide: offset columns based on X position
    float columnIndex = floor((scaledUV.x + halfWidth) / ${width});
    slideOffset.y = ${slide} * ${height} * columnIndex;`}
    
    scaledUV += slideOffset;
    
    // Wrap coordinates to create tiling
    // Shift to 0-based, modulo, then shift back to centered coordinates
    vec2 tiledUV;
    tiledUV.x = mod(scaledUV.x + halfWidth, ${width}) - halfWidth;
    tiledUV.y = mod(scaledUV.y + halfHeight, ${height}) - halfHeight;
    
    return ${this.getInput('input', cc, 'tiledUV')};
}`
            }
        }
    }
})