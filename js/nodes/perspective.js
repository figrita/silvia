import {registerNode} from '../registry.js'

registerNode({
    slug: 'perspective',
    icon: '⏢',
    label: 'Perspective',
    tooltip: 'Applies perspective transformation with adjustable corner positions for 3D projection effects.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null // This input must be connected
        },
        'tiltX': {
            label: 'Tilt X',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01}
        },
        'tiltY': {
            label: 'Tilt Y',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const tiltX = this.getInput('tiltX', cc)
                const tiltY = this.getInput('tiltY', cc)

                // This GLSL function implements the perspective transform.
                return `vec4 ${funcName}(vec2 uv) {
    // 2. Calculate the perspective divisor 'w'. This value gets larger
    //    based on the tilt amounts and the pixel's position relative to the center.
    //    The further a pixel is in the direction of the tilt, the larger 'w' becomes.
    float w = 1.0 + uv.x * ${tiltX} +uv.y * ${tiltY};
    
    // 3. IMPORTANT: Prevent division by zero or negative numbers which would
    //    cause artifacts or flip the image unexpectedly.
    w = max(w, 0.001); 
    
    // 4. Apply the perspective transformation by dividing the centered UVs by 'w'.
    //    Pixels with a larger 'w' will have their coordinates squashed towards the center.
    vec2 perspective_uv = uv / w;
    
    // 5. Convert the coordinates back to the standard (0,1) texture space.
    vec2 final_uv = perspective_uv;
    
    // 6. Sample the input at the new, distorted coordinate.
    return ${this.getInput('input', cc, 'final_uv')};
}`
            }
        }
    }
})