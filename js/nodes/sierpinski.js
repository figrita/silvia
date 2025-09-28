import {registerNode} from '../registry.js'

registerNode({
    slug: 'sierpinski',
    icon: '🔺',
    label: 'Sierpinski Triangle',
    tooltip: 'Generates a Sierpinski triangle fractal with adjustable zoom and detail.',
    input: {
        'colorIn': {
            label: 'Color In',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'colorOut': {
            label: 'Color Out',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'zoom': {
            label: 'Zoom',
            type: 'float',
            control: {default: 100.0, min: 1.0, max: 1000.0, step: 1.0}
        },
        'detail': {
            label: 'Detail',
            type: 'float',
            control: {default: 4.0, min: 1.0, max: 10.0, step: 1.0}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    vec4 colorIn = ${this.getInput('colorIn', cc)};
    vec4 colorOut = ${this.getInput('colorOut', cc)};
    float zoom = ${this.getInput('zoom', cc)};
    float detail = ${this.getInput('detail', cc)};
    
    // Define square root of 3 for our transformation
    const float SQRT3 = 1.7320508;
    
    // Convert UV coordinates to screen space-like coordinates
    vec2 p = uv * zoom;
    
    // INVERSE TRANSFORMATION
    // Apply an inverse transformation to the coordinate space to warp
    // our square grid into an equilateral triangle grid.
    
    // a) Inverse Y-scaling to account for equilateral height (h = s * sqrt(3)/2)
    // We multiply by the reciprocal of the height ratio.
    p.y *= 2.0 / SQRT3;

    // b) Inverse X-shearing to align the top vertex
    // We shift the x-coordinate based on the *newly scaled* y-coordinate.
    p.x -= p.y * 0.5;

    // Tiling and Fractal Logic
    // This logic now operates on our transformed coordinates.
    float size = pow(2.0, detail);
    vec2 tile_coord = mod(p, size);
    ivec2 ipos = ivec2(tile_coord);

    float in_set = 0.0;
    if ((ipos.x & ipos.y) == 0) {
        in_set = 1.0;
    }

    // Final Color Output
    vec3 color = mix(colorOut.rgb, colorIn.rgb, in_set);
    return vec4(color, 1.0);
}`
            }
        }
    }
})