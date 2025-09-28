import {formatFloatGLSL} from '../utils.js'
import {registerNode} from '../registry.js'

registerNode({
    slug: 'supersampling',
    icon: '✨',
    label: 'Super Sampling',
    tooltip: 'Averages several samples per-pixel to anti-alias. Fixes zoomed-out jaggies and sparkles.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null // Must be connected
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                // Get the grid size from the dropdown option (e.g., 2 for 2x2, 4 for 4x4)
                const sampleGridSize = parseInt(this.getOption('sample_level'), 10)

                // If sampling is 1x (or less), it's a simple pass-through. This is an important optimization.
                if(sampleGridSize <= 1){
                    return `vec4 ${funcName}(vec2 uv) {
    return ${this.getInput('input', cc, 'uv')};
}`
                }

                // If we're sampling, generate the more complex multi-sampling code.
                const totalSamples = formatFloatGLSL(sampleGridSize * sampleGridSize)
                const gridSizeFloat = formatFloatGLSL(sampleGridSize)

                return `vec4 ${funcName}(vec2 uv) {
    // Get the size of a single pixel in UV space
    vec2 texelSize = 1.0 / u_resolution;
    vec4 totalColor = vec4(0.0);
    
    // Loop over a grid of sub-pixels within the current pixel
    for (int x = 0; x < ${sampleGridSize}; x++) {
        for (int y = 0; y < ${sampleGridSize}; y++) {
            // Calculate sub-pixel offset (shift -0.5 to center grid)
            vec2 offset = (vec2(float(x), float(y)) - 0.5) / ${gridSizeFloat};
            
            // Calculate the final UV for this specific sample
            vec2 sampleUV = uv + offset * texelSize;
            
            // Add the color from the input function at the sampled UV
            totalColor += ${this.getInput('input', cc, 'sampleUV')};
        }
    }
    
    // Average the collected colors
    return totalColor / ${totalSamples};
}`
            }
        }
    },
    options: {
        'sample_level': {
            label: 'Quality',
            type: 'select',
            default: '1', // Default to 1x (Off) to not have a performance hit by default
            choices: [
                {value: '1', name: '1x (Off)'},
                {value: '2', name: '2x2 (4 Samples)'},
                {value: '3', name: '3x3 (9 Samples)'},
                {value: '4', name: '4x4 (16 Samples)'}
                // Note: Going higher than 4x4 (16 samples) can become extremely slow
            ]
        }
    }
})