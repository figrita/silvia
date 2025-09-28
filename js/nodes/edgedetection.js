import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'

registerNode({
    slug: 'edgedetection',
    icon: '🔪',
    label: 'Edge Detection',
    tooltip: 'Detects edges using convolution filters (Sobel, Prewitt, Laplacian) applied to RGB channels separately for true color edge detection.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'strength': {
            label: 'Strength',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 5.0, step: 0.1}
        },
        'sampleDistance': {
            label: 'Sample Distance',
            type: 'float',
            control: {default: 0.001, min: 0.0, max: 5.0, step: 0.001}
        },
        'invert': {
            label: 'Invert',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 1.0}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.input.input.connection
                    ? this.getInput('input', cc)
                    : 'vec4(0.5, 0.5, 0.5, 1.0)'
                const strength = this.getInput('strength', cc)
                const sampleDistance = this.getInput('sampleDistance', cc)
                const invert = this.getInput('invert', cc)
                const mode = this.getOption('mode')

                return `vec4 ${funcName}(vec2 uv) {
    // Edge detection kernels
    const mat3 Gx_sobel = mat3(-1, -2, -1, 0, 0, 0, 1, 2, 1);
    const mat3 Gy_sobel = mat3(-1, 0, 1, -2, 0, 2, -1, 0, 1);
    
    const mat3 Gx_prewitt = mat3(-1, -1, -1, 0, 0, 0, 1, 1, 1);
    const mat3 Gy_prewitt = mat3(-1, 0, 1, -1, 0, 1, -1, 0, 1);
    
    const mat3 laplacian_k = mat3(0, 1, 0, 1, -4, 1, 0, 1, 0);

    vec2 pixel_offset = vec2(${sampleDistance});
    vec3 gradX = vec3(0.0);
    vec3 gradY = vec3(0.0);
    vec3 laplacian_sum = vec3(0.0);
    float gradX_gray = 0.0;
    float gradY_gray = 0.0;
    float laplacian_sum_gray = 0.0;
    float center_alpha = 1.0;

    // Convolve with the kernels by sampling neighboring pixels
    for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
            vec2 uv_offset = uv + vec2(float(i), float(j)) * pixel_offset;
            vec4 neighbor_color = ${inputColor.replace('(uv)', '(uv_offset)')};
            
            if (i == 0 && j == 0) {
                center_alpha = neighbor_color.a;
            }

            // Get matrix indices
            int mi = i + 1;
            int mj = j + 1;
            
            ${(() => {
                // For color versions, accumulate RGB channels separately
                if(mode === 'sobel'){return `
            gradX += neighbor_color.rgb * Gx_sobel[mi][mj];
            gradY += neighbor_color.rgb * Gy_sobel[mi][mj];
                `}
                if(mode === 'prewitt'){return `
            gradX += neighbor_color.rgb * Gx_prewitt[mi][mj];
            gradY += neighbor_color.rgb * Gy_prewitt[mi][mj];
                `}
                if(mode === 'laplacian'){return `
            laplacian_sum += neighbor_color.rgb * laplacian_k[mi][mj];
                `}
                // For grayscale versions, use luminance
                if(mode === 'sobel_gray'){return `
            float lum = rgb2lum(neighbor_color.rgb);
            gradX_gray += lum * Gx_sobel[mi][mj];
            gradY_gray += lum * Gy_sobel[mi][mj];
                `}
                if(mode === 'prewitt_gray'){return `
            float lum = rgb2lum(neighbor_color.rgb);
            gradX_gray += lum * Gx_prewitt[mi][mj];
            gradY_gray += lum * Gy_prewitt[mi][mj];
                `}
                if(mode === 'laplacian_gray'){return `
            float lum = rgb2lum(neighbor_color.rgb);
            laplacian_sum_gray += lum * laplacian_k[mi][mj];
                `}
                return ''
            })()}
        }
    }

    vec3 result;
    ${(() => {
        if(mode === 'sobel'){return `
    result = sqrt(gradX * gradX + gradY * gradY) * ${strength};
        `}
        if(mode === 'prewitt'){return `
    result = sqrt(gradX * gradX + gradY * gradY) * ${strength};
        `}
        if(mode === 'laplacian'){return `
    result = abs(laplacian_sum) * ${strength};
        `}
        if(mode === 'sobel_gray'){return `
    float edge = length(vec2(gradX_gray, gradY_gray)) * ${strength};
    result = vec3(edge);
        `}
        if(mode === 'prewitt_gray'){return `
    float edge = length(vec2(gradX_gray, gradY_gray)) * ${strength};
    result = vec3(edge);
        `}
        if(mode === 'laplacian_gray'){return `
    float edge = abs(laplacian_sum_gray) * ${strength};
    result = vec3(edge);
        `}
        return `
    result = vec3(0.0);
        `
    })()}
    
    // Apply inversion using mix for a smooth transition
    result = mix(result, vec3(1.0) - result, ${invert});

    return vec4(clamp(result, 0.0, 1.0), center_alpha);
}`
            }
        }
    },
    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'sobel',
            choices: [
                {value: 'sobel', name: 'Sobel'},
                {value: 'prewitt', name: 'Prewitt'},
                {value: 'laplacian', name: 'Laplacian'},
                {value: 'sobel_gray', name: 'Sobel (Grayscale)'},
                {value: 'prewitt_gray', name: 'Prewitt (Grayscale)'},
                {value: 'laplacian_gray', name: 'Laplacian (Grayscale)'}
            ]
        }
    },
    shaderUtils: [shaderUtils.RGB2LUM]
})