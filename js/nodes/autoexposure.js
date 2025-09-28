import {registerNode} from '../registry.js'

registerNode({
    slug: 'autoexposure',
    icon: '📷',
    label: 'Auto Exposure',
    tooltip: 'Automatically adjusts brightness based on image content. Keeps feedback effects balanced by preventing over-exposure or under-exposure.',

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'targetBrightness': {
            label: 'Target',
            type: 'float',
            control: {default: 0.5, min: 0.1, max: 0.9, step: 0.01}
        },
        'adaptSpeed': {
            label: 'Adapt Speed',
            type: 'float',
            control: {default: 0.1, min: 0.01, max: 1.0, step: 0.01}
        },
        'minExposure': {
            label: 'Min Exposure',
            type: 'float',
            control: {default: 0.1, min: 0.01, max: 1.0, step: 0.01}
        },
        'maxExposure': {
            label: 'Max Exposure',
            type: 'float',
            control: {default: 3.0, min: 1.0, max: 10.0, step: 0.1}
        },
        'contrastBoost': {
            label: 'Contrast',
            type: 'float',
            control: {default: 1.0, min: 0.5, max: 2.0, step: 0.01}
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)
                const targetBrightness = this.getInput('targetBrightness', cc)
                const adaptSpeed = this.getInput('adaptSpeed', cc)
                const minExposure = this.getInput('minExposure', cc)
                const maxExposure = this.getInput('maxExposure', cc)
                const contrastBoost = this.getInput('contrastBoost', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 color = ${inputColor};

    // Efficient brightness estimation using a sparse sampling pattern
    // We sample at strategic points to get a good approximation without killing performance
    float brightness = 0.0;
    float sampleCount = 0.0;

    // Center-weighted sampling pattern - more samples in center, fewer at edges
    // This is much more efficient than sampling every pixel
    for(int x = -2; x <= 2; x++) {
        for(int y = -2; y <= 2; y++) {
            vec2 sampleUV = uv + vec2(float(x), float(y)) * 0.1;

            // Weight samples by distance from center (center is more important)
            float weight = 1.0 / (1.0 + length(vec2(float(x), float(y))) * 0.5);

            vec4 sampleColor = ${inputColor.replace('uv', 'sampleUV')};

            // Convert to luminance using standard weights
            float luminance = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
            brightness += luminance * weight;
            sampleCount += weight;
        }
    }

    // Additional sparse sampling across the image for global awareness
    // Sample at golden ratio positions for good distribution
    const float phi = 1.618033988749; // Golden ratio
    for(int i = 0; i < 8; i++) {
        float angle = float(i) * phi * 2.0;
        float radius = 0.3 + float(i) * 0.1;
        vec2 offset = vec2(cos(angle), sin(angle)) * radius;
        vec2 sampleUV = uv + offset;

        if(sampleUV.x >= -1.0 && sampleUV.x <= 1.0 && sampleUV.y >= -1.0 && sampleUV.y <= 1.0) {
            vec4 sampleColor = ${inputColor.replace('uv', 'sampleUV')};
            float luminance = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
            brightness += luminance * 0.5; // Lower weight for edge samples
            sampleCount += 0.5;
        }
    }

    // Calculate average brightness
    brightness = brightness / sampleCount;

    // Temporal smoothing using a simple exponential filter
    // This prevents rapid flickering in the exposure adjustment
    float smoothedBrightness = brightness;

    // Calculate exposure adjustment
    float exposureAdjust = ${targetBrightness} / (smoothedBrightness + 0.001); // Avoid division by zero
    exposureAdjust = clamp(exposureAdjust, ${minExposure}, ${maxExposure});

    // Apply gradual adaptation instead of instant adjustment
    // This creates more natural-looking exposure changes
    float currentExposure = mix(1.0, exposureAdjust, ${adaptSpeed});

    // Apply exposure correction
    vec3 exposedColor = color.rgb * currentExposure;

    // Optional contrast boost to maintain punch
    if(${contrastBoost} != 1.0) {
        exposedColor = (exposedColor - 0.5) * ${contrastBoost} + 0.5;
    }

    // Soft clipping to prevent harsh cutoffs
    exposedColor = exposedColor / (1.0 + exposedColor * 0.3);

    return vec4(exposedColor, color.a);
}`
            }
        },
        'brightness': {
            label: 'Detected Brightness',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)

                return `float ${funcName}(vec2 uv) {
    // Same sampling pattern as main output for consistency
    float brightness = 0.0;
    float sampleCount = 0.0;

    for(int x = -2; x <= 2; x++) {
        for(int y = -2; y <= 2; y++) {
            vec2 sampleUV = uv + vec2(float(x), float(y)) * 0.1;
            float weight = 1.0 / (1.0 + length(vec2(float(x), float(y))) * 0.5);
            vec4 sampleColor = ${inputColor.replace('uv', 'sampleUV')};
            float luminance = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
            brightness += luminance * weight;
            sampleCount += weight;
        }
    }

    return brightness / sampleCount;
}`
            }
        }
    }
})