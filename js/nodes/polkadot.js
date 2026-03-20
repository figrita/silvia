import {registerNode} from '../registry.js'

registerNode({
    slug: 'polkadot',
    icon: '👙',
    label: 'Polka Dot',
    tooltip: 'Repeating dot pattern with center-sampled color. Each dot samples its center point, quantizing continuous inputs into atomic per-dot colors. Supports grid or staggered layouts.',

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'background': {
            label: 'Background',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'frequency': {
            label: 'Frequency',
            type: 'float',
            control: {default: 8, min: 1, max: 50, step: 0.5, unit: '/⬓'}
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 0.35, min: 0, max: 1, step: 0.01}
        },
        'softness': {
            label: 'Softness',
            type: 'float',
            control: {default: 0.02, min: 0, max: 0.5, step: 0.001, 'log-scale': true}
        },
        'stagger': {
            label: 'Stagger',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 0.01}
        }
    },

    options: {
        'staggerDirection': {
            label: 'Stagger Direction',
            type: 'select',
            default: 'horizontal',
            choices: [
                {value: 'horizontal', name: 'Horizontal (Rows)'},
                {value: 'vertical', name: 'Vertical (Columns)'}
            ]
        }
    },

    output: {
        'color': {
            label: 'Color',
            type: 'color',
            genCode(cc, funcName){
                const staggerDirection = this.getOption('staggerDirection')
                return `vec4 ${funcName}(vec2 uv) {
    vec4 background = ${this.getInput('background', cc)};
    float freq = ${this.getInput('frequency', cc)};

    // Scale UV into cell space (first pass without stagger to find cell)
    vec2 p0 = uv * freq;
    vec2 cell0 = floor(p0);

    // Preliminary cell center for sampling stagger
    vec2 preCenter = (cell0 + 0.5) / freq;
    float stagger = ${this.getInput('stagger', cc, 'preCenter')};

    // Now apply stagger
    vec2 p = p0;
    ${staggerDirection === 'horizontal' ? `
    float rowIndex = floor(p.y);
    p.x += stagger * mod(rowIndex, 2.0);` : `
    float colIndex = floor(p.x);
    p.y += stagger * mod(colIndex, 2.0);`}

    // Cell coordinates
    vec2 cell = floor(p);
    vec2 f = fract(p);

    // Cell center in UV space (undo stagger for sampling)
    vec2 cellCenter = cell + 0.5;
    ${staggerDirection === 'horizontal' ? `
    cellCenter.x -= stagger * mod(cell.y, 2.0);` : `
    cellCenter.y -= stagger * mod(cell.x, 2.0);`}
    cellCenter /= freq;

    // Sample all inputs at dot center
    vec4 dotColor = ${this.getInput('input', cc, 'cellCenter')};
    float radius = ${this.getInput('radius', cc, 'cellCenter')};
    float softness = ${this.getInput('softness', cc, 'cellCenter')};

    // Distance from cell center
    float dist = length(f - 0.5);

    // Dot mask with softness
    float mask = 1.0 - smoothstep(radius - softness, radius + softness, dist);

    return mix(background, dotColor, mask);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                const staggerDirection = this.getOption('staggerDirection')
                return `float ${funcName}(vec2 uv) {
    float freq = ${this.getInput('frequency', cc)};

    // First pass without stagger to find cell
    vec2 p0 = uv * freq;
    vec2 cell0 = floor(p0);
    vec2 preCenter = (cell0 + 0.5) / freq;
    float stagger = ${this.getInput('stagger', cc, 'preCenter')};

    // Apply stagger
    vec2 p = p0;
    ${staggerDirection === 'horizontal' ? `
    float rowIndex = floor(p.y);
    p.x += stagger * mod(rowIndex, 2.0);` : `
    float colIndex = floor(p.x);
    p.y += stagger * mod(colIndex, 2.0);`}

    vec2 cell = floor(p);
    vec2 f = fract(p);

    // Cell center in UV space (undo stagger for sampling)
    vec2 cellCenter = cell + 0.5;
    ${staggerDirection === 'horizontal' ? `
    cellCenter.x -= stagger * mod(cell.y, 2.0);` : `
    cellCenter.y -= stagger * mod(cell.x, 2.0);`}
    cellCenter /= freq;

    float radius = ${this.getInput('radius', cc, 'cellCenter')};
    float softness = ${this.getInput('softness', cc, 'cellCenter')};
    float dist = length(f - 0.5);

    return 1.0 - smoothstep(radius - softness, radius + softness, dist);
}`
            }
        }
    }
})