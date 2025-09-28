import {registerNode} from '../registry.js'

registerNode({
    slug: 'simplelight',
    icon: '☀️',
    label: 'Simple Light',
    tooltip: 'Applies a simple diffuse lighting effect to a normal map texture.',
    
    input: {
        'normalMap': {
            label: 'Normal Map',
            type: 'color',
            control: null
        },
        'surfaceColor': {
            label: 'Surface Color',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'lightColor': {
            label: 'Light Color',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'lightX': {
            label: 'Light X',
            type: 'float',
            control: {default: 0.5, min: -2, max: 2, step: 0.01}
        },
        'lightY': {
            label: 'Light Y',
            type: 'float',
            control: {default: 0.5, min: -2, max: 2, step: 0.01}
        },
        'lightZ': {
            label: 'Light Z',
            type: 'float',
            control: {default: 1.0, min: 0, max: 5, step: 0.01}
        }
    },
    
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName) {
                return `vec4 ${funcName}(vec2 uv) {
    vec4 normalColor = ${this.getInput('normalMap', cc)};
    vec4 surface = ${this.getInput('surfaceColor', cc)};
    vec4 lightCol = ${this.getInput('lightColor', cc)};
    
    // Unpack normal vector from color
    vec3 normal = normalize(normalColor.rgb * 2.0 - 1.0);
    
    // Construct light direction vector
    vec3 lightDir = normalize(vec3(${this.getInput('lightX', cc)}, ${this.getInput('lightY', cc)}, ${this.getInput('lightZ', cc)}));
    
    // Calculate diffuse lighting (Lambertian)
    float diffuse = max(dot(normal, lightDir), 0.0);
    
    // Apply lighting to surface color
    vec3 finalColor = surface.rgb * lightCol.rgb * diffuse;
    
    return vec4(finalColor, surface.a);
}`
            }
        }
    }
})