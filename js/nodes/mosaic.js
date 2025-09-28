import {registerNode} from '../registry.js'

registerNode({
    slug: 'mosaic',
    icon: '🪟',
    label: 'Mosaic',
    tooltip: 'Creates a mosaic effect by dividing the input image into a grid of cells. Supports square, hexagon, triangle, and Voronoi cell shapes with adjustable size, randomness, borders, and colors.',
    
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'cellSize': {
            label: 'Cell Freq',
            type: 'float',
            control: {default: 10, min: 2, max: 50, step: 0.5, unit: '/⬓'}
        },
        'randomness': {
            label: 'Randomness',
            type: 'float',
            control: {default: 0.5, min: 0, max: 1, step: 0.01}
        },
        'borderWidth': {
            label: 'Border Width',
            type: 'float',
            control: {default: 0.1, min: 0, max: 0.5, step: 0.01}
        },
        'borderColor': {
            label: 'Border Color',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'smoothing': {
            label: 'Smoothing',
            type: 'float',
            control: {default: 0.02, min: 0, max: 1, step: 0.001, 'log-scale': true}
        }
    },
    
    options: {
        'shape': {
            label: 'Shape',
            type: 'select',
            default: 'square',
            choices: [
                {value: 'square', name: 'Square'},
                {value: 'hexagon', name: 'Hexagon'},
                {value: 'triangle', name: 'Triangle'},
                {value: 'voronoi', name: 'Voronoi'}
            ]
        }
    },
    
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const shape = this.getOption('shape')
                return `vec4 ${funcName}(vec2 uv) {
    float cellSize = ${this.getInput('cellSize', cc)};
    float randomness = ${this.getInput('randomness', cc)};
    float borderWidth = ${this.getInput('borderWidth', cc)};
    vec4 borderColor = ${this.getInput('borderColor', cc)};
    float smoothing = ${this.getInput('smoothing', cc)};
    
    ${shape === 'hexagon' ? `
    // Hexagonal grid using HexCoords method
    vec2 p = uv * cellSize;
    
    // Hexagon grid setup
    vec2 r = vec2(1, 1.73);
    vec2 h = r * 0.5;
    
    // Find which hexagon cell we're in
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    
    // Get cell ID for this hexagon - round to ensure consistency
    vec2 id = round(p - gv);
    
    // Convert to UV space for the cell center
    vec2 cellCenter = id / cellSize;
    
    // Add randomness - using rounded id as seed ensures consistency
    vec2 random = vec2(
        fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453),
        fract(sin(dot(id, vec2(269.5, 183.3))) * 43758.5453)
    );
    cellCenter += (random - 0.5) * randomness / cellSize;
    
    // Sample color at the center
    vec4 cellColor = ${this.getInput('input', cc, 'cellCenter')};
    
    // HexDist function - distance from hexagon edge
    vec2 absGv = abs(gv);
    float hexDist = max(dot(absGv, normalize(vec2(1, 1.73))), absGv.x);
    
    // Convert to normalized distance (0 at center, 0.5 at edge)
    float edgeDist = 0.5 - hexDist;
    
    // Create border using smoothstep - matching the ShaderToy approach
    float border = borderWidth > 0.0 ? smoothstep(borderWidth - smoothing * 0.5, borderWidth + smoothing * 0.5, edgeDist) : 1.0;

    return mix(borderColor, cellColor, border);
    ` : shape === 'triangle' ? `
    // Triangular grid in UV space
    vec2 p = uv * cellSize;
    
    // Triangular lattice coordinates
    float x = p.x - p.y * 0.5;
    float y = p.y * 0.866;
    
    vec2 cell = floor(vec2(x, y));
    vec2 f = fract(vec2(x, y));
    
    // Determine which triangle we're in
    bool upperTri = f.x + f.y < 1.0;
    if (!upperTri) {
        cell += vec2(1.0, 1.0);
        f = 1.0 - f;
    }
    
    // Triangle center in grid space
    vec2 center = cell + vec2(0.5, 0.5);
    if (upperTri) {
        center.y -= 0.166;
    } else {
        center.y += 0.166;
    }
    
    // Convert back to UV space
    center = vec2(
        center.x + center.y * 0.5,
        center.y / 0.866
    ) / cellSize;
    
    // Add randomness
    vec2 random = vec2(
        fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453),
        fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453)
    );
    center += (random - 0.5) * randomness / cellSize;
    
    vec4 cellColor = ${this.getInput('input', cc, 'center')};
    
    // Border calculation - distance from edges
    float border = min(min(f.x, f.y), 1.0 - f.x - f.y);
    border = 1.0 - smoothstep(borderWidth - smoothing * 0.5, borderWidth + smoothing * 0.5, border);
    
    return mix(cellColor, borderColor, border);
    ` : shape === 'voronoi' ? `
    // Voronoi cells in UV space
    vec2 p = uv * cellSize;
    vec2 i_st = floor(p);
    vec2 f_st = fract(p);
    
    vec2 nearestPoint;
    float minDist = 10.0;
    float secondDist = 10.0;
    
    // Find nearest and second nearest cell centers
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cell = i_st + neighbor;
            
            vec2 random = vec2(
                fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453),
                fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453)
            );
            
            vec2 point = neighbor + mix(vec2(0.5), random, randomness);
            float dist = length(point - f_st);
            
            if (dist < minDist) {
                secondDist = minDist;
                minDist = dist;
                nearestPoint = (cell + random) / cellSize;
            } else if (dist < secondDist) {
                secondDist = dist;
            }
        }
    }
    
    vec4 cellColor = ${this.getInput('input', cc, 'nearestPoint')};
    
    // Border based on distance to edge (difference between first and second nearest)
    float edgeDist = (secondDist - minDist) * 0.5;
    float border = 1.0 - smoothstep(borderWidth - smoothing * 0.5, borderWidth + smoothing * 0.5, edgeDist);
    
    return mix(cellColor, borderColor, border);
    ` : `
    // Square grid in UV space
    vec2 cell = floor(uv * cellSize) / cellSize;
    vec2 cellCenter = cell + 0.5 / cellSize;
    
    // Add randomness
    vec2 random = vec2(
        fract(sin(dot(cell * cellSize, vec2(12.9898, 78.233))) * 43758.5453),
        fract(sin(dot(cell * cellSize, vec2(269.5, 183.3))) * 43758.5453)
    );
    cellCenter += (random - 0.5) * randomness / cellSize;
    
    vec4 cellColor = ${this.getInput('input', cc, 'cellCenter')};
    
    // Calculate border
    vec2 cellPos = fract(uv * cellSize);
    float borderSmoothMin = borderWidth - smoothing * 0.5;
    float borderSmoothMax = borderWidth + smoothing * 0.5;
    float border = 1.0 - min(
        min(smoothstep(borderSmoothMin, borderSmoothMax, cellPos.x),
            smoothstep(borderSmoothMin, borderSmoothMax, cellPos.y)),
        min(smoothstep(borderSmoothMin, borderSmoothMax, 1.0 - cellPos.x),
            smoothstep(borderSmoothMin, borderSmoothMax, 1.0 - cellPos.y))
    );
    
    return mix(cellColor, borderColor, border);
    `}
}`
            }
        }
    }
})