import {registerNode} from '../registry.js'

registerNode({
    slug: 'rotozoom',
    icon: '🪂',
    label: 'Rotozoom',
    tooltip: 'Applies a dynamic rotozoom effect to the input image, combining rotation and zooming with sinusoidal modulation for a fluid, animated transformation.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'rotSpeed': {
            label: 'Rotation Speed',
            type: 'float',
            control: {default: 1.0, min: -5.0, max: 5.0, step: 0.01}
        },
        'zoomSpeed': {
            label: 'Zoom Speed',
            type: 'float',
            control: {default: 1.0, min: -5.0, max: 5.0, step: 0.01}
        },
        'sinCoeff': {
            label: 'Sin Coefficient',
            type: 'float',
            control: {default: 1.0, min: -2.0, max: 2.0, step: 0.01}
        },
        'cosCoeff': {
            label: 'Cos Coefficient', 
            type: 'float',
            control: {default: 1.0, min: -2.0, max: 2.0, step: 0.01}
        },
        'baseZoom': {
            label: 'Base Zoom',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 3.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const rotSpeed = this.getInput('rotSpeed', cc)
                const zoomSpeed = this.getInput('zoomSpeed', cc)
                const sinCoeff = this.getInput('sinCoeff', cc)
                const cosCoeff = this.getInput('cosCoeff', cc)
                const baseZoom = this.getInput('baseZoom', cc)

                return `vec4 ${funcName}(vec2 uv) {
    float time = u_time;
    
    // Calculate rotation angle using sin/cos modulation
    float angle = time * ${rotSpeed} * 0.5;
    angle += sin(time * ${zoomSpeed}) * ${sinCoeff} * 0.5;
    angle += cos(time * ${zoomSpeed} * 0.7) * ${cosCoeff} * 0.3;
    
    // Calculate zoom factor using sin/cos modulation
    float zoom = ${baseZoom};
    zoom += sin(time * ${zoomSpeed} * 0.8) * ${sinCoeff} * 0.3;
    zoom += cos(time * ${zoomSpeed} * 1.2) * ${cosCoeff} * 0.2;
    zoom = max(0.1, zoom); // Prevent negative or zero zoom
    
    // Apply rotation matrix
    float c = cos(angle);
    float s = sin(angle);
    mat2 rot = mat2(c, -s, s, c);
    
    // Transform UV coordinates
    vec2 transformedUV = rot * uv;
    transformedUV *= zoom;
    
    return ${this.getInput('input', cc, 'transformedUV')};
}`
            }
        }
    }
})