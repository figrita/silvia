import {registerNode} from '../registry.js'

registerNode({
    slug: 'heighttonormal',
    icon: '🌄',
    label: 'Height to Normal',
    tooltip: 'Converts a grayscale height map into a normal map for 3D lighting effects.',
    
    input: {
        'input': {
            label: 'Input (Height)',
            type: 'color',
            control: null
        },
        'strength': {
            label: 'Strength',
            type: 'float',
            control: {default: 2.0, min: 0, max: 10, step: 0.1}
        }
    },
    
    output: {
        'output': {
            label: 'Normal Map',
            type: 'color',
            genCode(cc, funcName) {
                return `vec4 ${funcName}(vec2 uv) {
    float strength = ${this.getInput('strength', cc)};
    vec2 texelSize = 1.0 / u_resolution;

    // Sample neighboring pixels for gradient calculation
    float tl = dot(${this.getInput('input', cc, 'uv + vec2(-texelSize.x, texelSize.y)')}.rgb, vec3(0.299, 0.587, 0.114));
    float t  = dot(${this.getInput('input', cc, 'uv + vec2(0.0, texelSize.y)')}.rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(${this.getInput('input', cc, 'uv + vec2(texelSize.x, texelSize.y)')}.rgb, vec3(0.299, 0.587, 0.114));
    float l  = dot(${this.getInput('input', cc, 'uv + vec2(-texelSize.x, 0.0)')}.rgb, vec3(0.299, 0.587, 0.114));
    float r  = dot(${this.getInput('input', cc, 'uv + vec2(texelSize.x, 0.0)')}.rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(${this.getInput('input', cc, 'uv + vec2(-texelSize.x, -texelSize.y)')}.rgb, vec3(0.299, 0.587, 0.114));
    float b  = dot(${this.getInput('input', cc, 'uv + vec2(0.0, -texelSize.y)')}.rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(${this.getInput('input', cc, 'uv + vec2(texelSize.x, -texelSize.y)')}.rgb, vec3(0.299, 0.587, 0.114));

    // Sobel filter to find the gradient
    float dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
    float dy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);

    // Construct the normal vector (OpenGL convention)
    vec3 normal = normalize(vec3(-dx * strength, dy * strength, 1.0));
    
    // Map normal vector from [-1, 1] to [0, 1] for color output
    vec3 normalColor = normal * 0.5 + 0.5;
    
    return vec4(normalColor, 1.0);
}`
            }
        }
    }
})