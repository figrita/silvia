import {registerNode} from '../registry.js'

registerNode({
    slug: 'worleynoise',
    icon: '🦗',
    label: 'Worley Noise',
    tooltip: 'Creates cellular/organic patterns based on Voronoi diagrams. Insect-wing patterns.',
    
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
        'scale': {
            label: 'Frequency',
            type: 'float',
            control: {default: 10, min: 1, max: 50, step: 0.1, unit: '/⬓'}
        },
        'randomness': {
            label: 'Randomness',
            type: 'float',
            control: {default: 1, min: 0, max: 1, step: 0.01}
        },
        'metric': {
            label: 'Distance Metric',
            type: 'float',
            control: {default: 2, min: 0.5, max: 10, step: 0.1}
        },
        'contrast': {
            label: 'Contrast',
            type: 'float',
            control: {default: 1, min: 0, max: 5, step: 0.01}
        }
    },
    
    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'distance',
            choices: [
                {value: 'distance', name: 'Distance'},
                {value: 'cells', name: 'Cells'},
                {value: 'borders', name: 'Borders'}
            ]
        }
    },
    
    output: {
        'color': {
            label: 'Color',
            type: 'color',
            genCode(cc, funcName){
                const mode = this.getOption('mode')
                return `vec4 ${funcName}(vec2 uv) {
    vec4 foreground = ${this.getInput('foreground', cc)};
    vec4 background = ${this.getInput('background', cc)};
    float scale = ${this.getInput('scale', cc)};
    float randomness = ${this.getInput('randomness', cc)};
    float metric = ${this.getInput('metric', cc)};
    float contrast = ${this.getInput('contrast', cc)};
    
    vec2 p = uv * scale;
    vec2 i_st = floor(p);
    vec2 f_st = fract(p);
    
    float min_dist = 10.0;
    float second_dist = 10.0;
    vec2 min_point;
    
    // Check neighboring cells
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cell = i_st + neighbor;
            
            // Random point in cell (static)
            vec2 random = vec2(
                fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453),
                fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453)
            );
            
            // Mix between grid and random
            vec2 point = neighbor + mix(vec2(0.5), random, randomness);
            
            // Minkowski distance
            vec2 diff = point - f_st;
            float dist = pow(pow(abs(diff.x), metric) + pow(abs(diff.y), metric), 1.0/metric);
            
            if (dist < min_dist) {
                second_dist = min_dist;
                min_dist = dist;
                min_point = cell + random;
            } else if (dist < second_dist) {
                second_dist = dist;
            }
        }
    }
    
    float value;
    ${mode === 'cells' ? 
        'value = fract(sin(dot(min_point, vec2(12.9898, 78.233))) * 43758.5453);' :
      mode === 'borders' ?
        'value = smoothstep(0.0, 0.05, second_dist - min_dist);' :
        'value = 1.0 - min_dist;'
    }
    
    // Apply contrast
    value = (value - 0.5) * contrast + 0.5;
    value = clamp(value, 0.0, 1.0);
    
    return mix(background, foreground, value);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                const mode = this.getOption('mode')
                return `float ${funcName}(vec2 uv) {
    float scale = ${this.getInput('scale', cc)};
    float randomness = ${this.getInput('randomness', cc)};
    float metric = ${this.getInput('metric', cc)};
    float contrast = ${this.getInput('contrast', cc)};
    
    vec2 p = uv * scale;
    vec2 i_st = floor(p);
    vec2 f_st = fract(p);
    
    float min_dist = 10.0;
    float second_dist = 10.0;
    vec2 min_point;
    
    // Check neighboring cells
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cell = i_st + neighbor;
            
            // Random point in cell (static)
            vec2 random = vec2(
                fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453),
                fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453)
            );
            
            // Mix between grid and random
            vec2 point = neighbor + mix(vec2(0.5), random, randomness);
            
            // Minkowski distance
            vec2 diff = point - f_st;
            float dist = pow(pow(abs(diff.x), metric) + pow(abs(diff.y), metric), 1.0/metric);
            
            if (dist < min_dist) {
                second_dist = min_dist;
                min_dist = dist;
                min_point = cell + random;
            } else if (dist < second_dist) {
                second_dist = dist;
            }
        }
    }
    
    float value;
    ${mode === 'cells' ? 
        'value = fract(sin(dot(min_point, vec2(12.9898, 78.233))) * 43758.5453);' :
      mode === 'borders' ?
        'value = smoothstep(0.0, 0.05, second_dist - min_dist);' :
        'value = 1.0 - min_dist;'
    }
    
    // Apply contrast
    value = (value - 0.5) * contrast + 0.5;
    value = clamp(value, 0.0, 1.0);
    
    return value;
}`
            }
        }
    }
})