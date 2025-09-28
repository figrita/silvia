import {registerNode} from '../registry.js'

registerNode({
    slug: 'star',
    icon: '⭐',
    label: 'Star',
    tooltip: 'Generates star shapes with customizable points, inner radius, and rotation.',
    
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
        'points': {
            label: 'Points',
            type: 'float',
            control: {default: 5, min: 5, max: 12, step: 1}
        },
        'innerRadius': {
            label: 'Inner Radius',
            type: 'float',
            control: {default: 0.25, min: 0, max: 1, step: 0.01}
        },
        'rotation': {
            label: 'Rotation',
            type: 'float',
            control: {default: 0, min: -4, max: 4, step: 0.001, unit: 'π'}
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
    float points = ${this.getInput('points', cc)};
    float innerRadius = ${this.getInput('innerRadius', cc)};
    float rotation = ${this.getInput('rotation', cc)} * PI;
    
    // Rotate UV
    float cs = cos(rotation);
    float sn = sin(rotation);
    vec2 p = vec2(
        uv.x * cs - uv.y * sn,
        uv.x * sn + uv.y * cs
    );
    
    // Star algorithm using dot product method
    float acc = 0.0;
    int numPoints = int(points);
    float angle = PI * 2.0 / points;
    
    float a = 0.0;
    
    for(int i = 0; i < 12; i++) {
        if(i >= numPoints) break;
        
        vec2 cs = vec2(sin(a), cos(a));
        float test = dot(cs, p - cs * innerRadius);
        acc += test > 0.0 ? 0.5 : 0.0;
        a += angle;
    }
    
    // Star is visible when acc < 1
    float mask = step(acc, 0.9999);
    
    return mix(background, foreground, mask);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float points = ${this.getInput('points', cc)};
    float innerRadius = ${this.getInput('innerRadius', cc)};
    float rotation = ${this.getInput('rotation', cc)} * PI;
    
    // Rotate UV
    float cs = cos(rotation);
    float sn = sin(rotation);
    vec2 p = vec2(
        uv.x * cs - uv.y * sn,
        uv.x * sn + uv.y * cs
    );
    
    // Star algorithm using dot product method
    float acc = 0.0;
    int numPoints = int(points);
    float angle = PI * 2.0 / points;
    
    float a = 0.0;
    
    for(int i = 0; i < 12; i++) {
        if(i >= numPoints) break;
        
        vec2 cs = vec2(sin(a), cos(a));
        float test = dot(cs, p - cs * innerRadius);
        acc += test > 0.0 ? 0.5 : 0.0;
        a += angle;
    }
    
    // Star is visible when acc < 1
    return step(acc, 0.9999);
}`
            }
        }
    }
})