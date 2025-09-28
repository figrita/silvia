import {registerNode} from '../registry.js'

registerNode({
    slug: 'polygon',
    icon: '⬟',
    label: 'Polygon',
    tooltip: 'Generates a regular polygon shape with configurable number of sides, radius, rotation, and edge softness. Outputs both a color image and a mask for further compositing.',
    
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
        'sides': {
            label: 'Sides',
            type: 'float',
            control: {default: 6, min: 3, max: 20, step: 1}
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 0.5, min: 0, max: 2, step: 0.01, unit: '⬓'}
        },
        'rotation': {
            label: 'Rotation',
            type: 'float',
            control: {default: 0, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'softness': {
            label: 'Softness',
            type: 'float',
            control: {default: 0.01, min: 0, max: 0.5, step: 0.001}
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
    float sides = ${this.getInput('sides', cc)};
    float radius = ${this.getInput('radius', cc)};
    float rotation = ${this.getInput('rotation', cc)} * PI;
    float softness = ${this.getInput('softness', cc)};
    
    // Rotate UV
    float cs = cos(rotation);
    float sn = sin(rotation);
    vec2 p = vec2(
        uv.x * cs - uv.y * sn,
        uv.x * sn + uv.y * cs
    );
    
    // Convert to polar coordinates
    float angle = atan(p.y, p.x);
    float dist = length(p);
    
    // Calculate polygon distance
    float a = PI * 2.0 / sides;
    float segment = floor(angle / a + 0.5);
    float theta = segment * a;
    
    // Distance to edge
    float edge_dist = radius * cos(PI / sides) / cos(angle - theta);
    
    float mask = 1.0 - smoothstep(edge_dist - softness, edge_dist + softness, dist);
    
    return mix(background, foreground, mask);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float sides = ${this.getInput('sides', cc)};
    float radius = ${this.getInput('radius', cc)};
    float rotation = ${this.getInput('rotation', cc)} * PI;
    float softness = ${this.getInput('softness', cc)};
    
    // Rotate UV
    float cs = cos(rotation);
    float sn = sin(rotation);
    vec2 p = vec2(
        uv.x * cs - uv.y * sn,
        uv.x * sn + uv.y * cs
    );
    
    // Convert to polar coordinates
    float angle = atan(p.y, p.x);
    float dist = length(p);
    
    // Calculate polygon distance
    float a = PI * 2.0 / sides;
    float segment = floor(angle / a + 0.5);
    float theta = segment * a;
    
    // Distance to edge
    float edge_dist = radius * cos(PI / sides) / cos(angle - theta);
    
    return 1.0 - smoothstep(edge_dist - softness, edge_dist + softness, dist);
}`
            }
        }
    }
})