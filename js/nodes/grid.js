import {registerNode} from '../registry.js'

registerNode({
    slug: 'grid',
    icon: '⊞',
    label: 'Grid',
    tooltip: 'Creates a regular grid pattern. Adjust size for spacing, thickness for line width, and colors for lines vs background.',
    
    input: {
        'foreground': {
            label: 'Foreground',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'background': {
            label: 'Background',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'cellsX': {
            label: 'Cells X',
            type: 'float',
            control: {default: 10, min: 1, max: 100, step: 1}
        },
        'cellsY': {
            label: 'Cells Y',
            type: 'float',
            control: {default: 10, min: 1, max: 100, step: 1}
        },
        'thickness': {
            label: 'Line Thickness',
            type: 'float',
            control: {default: 0.05, min: 0, max: 0.5, step: 0.01}
        },
        'offsetX': {
            label: 'Offset X',
            type: 'float',
            control: {default: 0, min: -1, max: 1, step: 0.01, unit: '⬓'}
        },
        'offsetY': {
            label: 'Offset Y',
            type: 'float',
            control: {default: 0, min: -1, max: 1, step: 0.01, unit: '⬓'}
        },
        'smoothing': {
            label: 'Smoothing',
            type: 'float',
            control: {default: 0.01, min: 0, max: 1, step: 0.001, 'log-scale': true}
        }
    },
    
    
    output: {
        'color': {
            label: 'Color',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    vec4 foreground = ${this.getInput('foreground', cc)};
    vec4 background = ${this.getInput('background', cc)};
    float cellsX = ${this.getInput('cellsX', cc)};
    float cellsY = ${this.getInput('cellsY', cc)};
    float thickness = ${this.getInput('thickness', cc)};
    float offsetX = ${this.getInput('offsetX', cc)};
    float offsetY = ${this.getInput('offsetY', cc)};
    float smoothing = ${this.getInput('smoothing', cc)};
    
    vec2 p = (uv + vec2(offsetX, offsetY)) * vec2(cellsX, cellsY);
    vec2 grid = fract(p);
    
    // Grid lines - scale thickness per axis to account for cell size differences
    float thicknessX = thickness * cellsX * 0.05; // Scale for identical pixel thickness
    float thicknessY = thickness * cellsY * 0.05; // Scale for identical pixel thickness
    float smoothingX = smoothing * cellsX * 0.05;
    float smoothingY = smoothing * cellsY * 0.05;

    float lineX = max(
        1.0 - smoothstep(thicknessX - smoothingX, thicknessX + smoothingX, grid.x),
        1.0 - smoothstep(thicknessX - smoothingX, thicknessX + smoothingX, 1.0 - grid.x)
    );
    float lineY = max(
        1.0 - smoothstep(thicknessY - smoothingY, thicknessY + smoothingY, grid.y),
        1.0 - smoothstep(thicknessY - smoothingY, thicknessY + smoothingY, 1.0 - grid.y)
    );
    float mask = max(lineX, lineY);
    
    return mix(background, foreground, mask);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float cellsX = ${this.getInput('cellsX', cc)};
    float cellsY = ${this.getInput('cellsY', cc)};
    float thickness = ${this.getInput('thickness', cc)};
    float offsetX = ${this.getInput('offsetX', cc)};
    float offsetY = ${this.getInput('offsetY', cc)};
    float smoothing = ${this.getInput('smoothing', cc)};
    
    vec2 p = (uv + vec2(offsetX, offsetY)) * vec2(cellsX, cellsY);
    vec2 grid = fract(p);
    
    // Grid lines - scale thickness per axis to account for cell size differences
    float thicknessX = thickness * cellsX * 0.05; // Scale for identical pixel thickness
    float thicknessY = thickness * cellsY * 0.05; // Scale for identical pixel thickness
    float smoothingX = smoothing * cellsX * 0.05;
    float smoothingY = smoothing * cellsY * 0.05;

    float lineX = max(
        1.0 - smoothstep(thicknessX - smoothingX, thicknessX + smoothingX, grid.x),
        1.0 - smoothstep(thicknessX - smoothingX, thicknessX + smoothingX, 1.0 - grid.x)
    );
    float lineY = max(
        1.0 - smoothstep(thicknessY - smoothingY, thicknessY + smoothingY, grid.y),
        1.0 - smoothstep(thicknessY - smoothingY, thicknessY + smoothingY, 1.0 - grid.y)
    );
    return max(lineX, lineY);
}`
            }
        }
    }
})