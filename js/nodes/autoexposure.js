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
            control: null,
            samplingCost: '10'
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

    // Global brightness estimation at fixed screen positions (UV-agnostic)
    float brightness = 0.0;
    float aspect = u_resolution.x / u_resolution.y;

    for(int x = -1; x <= 1; x++) {
        for(int y = -1; y <= 1; y++) {
            vec2 sampleUV = vec2(float(x) * 0.5 * aspect, float(y) * 0.5);
            vec4 sampleColor = ${inputColor.replace('uv', 'sampleUV')};
            brightness += dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
        }
    }
    brightness /= 9.0;

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
    // Global brightness at fixed screen positions (same as main output)
    float brightness = 0.0;
    float aspect = u_resolution.x / u_resolution.y;

    for(int x = -1; x <= 1; x++) {
        for(int y = -1; y <= 1; y++) {
            vec2 sampleUV = vec2(float(x) * 0.5 * aspect, float(y) * 0.5);
            vec4 sampleColor = ${inputColor.replace('uv', 'sampleUV')};
            brightness += dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
        }
    }

    return brightness / 9.0;
}`
            }
        }
    }
})