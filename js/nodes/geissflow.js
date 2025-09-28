import {registerNode} from '../registry.js'

registerNode({
    slug: 'geissflow',
    icon: '🦙',
    label: 'Geiss Flow',
    tooltip: 'Classic Geiss-style vector field distortion with feedback. Pushes pixels around using swirling flow fields for organic, fluid-like effects.',

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'flowSpeed': {
            label: 'Flow Speed',
            type: 'float',
            control: {default: 0.5, min: 0.0, max: 2.0, step: 0.01}
        },
        'flowScale': {
            label: 'Flow Scale',
            type: 'float',
            control: {default: 5.0, min: 0.1, max: 20.0, step: 0.1}
        },
        'distortionAmount': {
            label: 'Distortion',
            type: 'float',
            control: {default: 0.02, min: 0.0, max: 0.1, step: 0.001}
        },
        'feedbackAmount': {
            label: 'Feedback',
            type: 'float',
            control: {default: 0.95, min: 0.0, max: 1.0, step: 0.01}
        },
        'fadeAmount': {
            label: 'Fade',
            type: 'float',
            control: {default: 0.98, min: 0.8, max: 1.0, step: 0.01}
        },
        'swirl': {
            label: 'Swirl',
            type: 'float',
            control: {default: 1.0, min: -3.0, max: 3.0, step: 0.01}
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const flowSpeed = this.getInput('flowSpeed', cc)
                const flowScale = this.getInput('flowScale', cc)
                const distortionAmount = this.getInput('distortionAmount', cc)
                const feedbackAmount = this.getInput('feedbackAmount', cc)
                const fadeAmount = this.getInput('fadeAmount', cc)
                const swirl = this.getInput('swirl', cc)
                const inputColor = this.getInput('input', cc)

                return `vec4 ${funcName}(vec2 uv) {
    float aspect = u_resolution.x / u_resolution.y;
    vec2 screenUV = vec2((uv.x / aspect + 1.0) * 0.5, (uv.y + 1.0) * 0.5);

    // Get current input (new content like oscilloscope/waveform)
    vec4 newContent = ${inputColor};

    // Generate Geiss-style vector field using multiple octaves of noise
    vec2 flowCoord = uv * ${flowScale};
    float time = u_time * ${flowSpeed};

    // Create swirling vector field using sin/cos patterns
    float noise1 = sin(flowCoord.x * 2.0 + time) * cos(flowCoord.y * 1.5 + time * 0.7);
    float noise2 = cos(flowCoord.x * 1.3 + time * 0.8) * sin(flowCoord.y * 2.2 + time * 0.5);

    // Add more complex swirls with different frequencies
    float swirl1 = sin(length(flowCoord) * 3.0 + time) * ${swirl};
    float swirl2 = cos(length(flowCoord * 0.7) * 2.0 - time * 1.2) * ${swirl} * 0.7;

    // Combine into vector field
    vec2 flowVector = vec2(
        noise1 + swirl1 * cos(atan(flowCoord.y, flowCoord.x) + time),
        noise2 + swirl2 * sin(atan(flowCoord.y, flowCoord.x) + time)
    );

    // Add radial component for vortex-like behavior
    vec2 center = vec2(0.0);
    vec2 toCenter = center - uv;
    float distance = length(toCenter);
    vec2 radialFlow = vec2(-toCenter.y, toCenter.x) * (1.0 / (distance + 0.1)) * ${swirl} * 0.3;

    flowVector += radialFlow;

    // Normalize and scale the distortion
    flowVector = normalize(flowVector) * ${distortionAmount};

    // Apply vector field distortion to sample the previous frame
    vec2 distortedUV = screenUV + flowVector;

    // Sample from frame history (previous frame)
    float last_frame_index = mod(float(u_current_frame_index) - 1.0 + float(u_frame_buffer_size), float(u_frame_buffer_size));
    vec4 previousFrame = texture(u_frame_history, vec3(distortedUV, last_frame_index));

    // Apply fade to previous frame
    previousFrame *= ${fadeAmount};

    // Mix new content with distorted feedback
    vec4 result = mix(previousFrame, newContent, 1.0 - ${feedbackAmount});

    // Ensure we don't lose the new content completely
    result = max(result, newContent * (1.0 - ${feedbackAmount}));

    return result;
}`
            }
        }
    }
})