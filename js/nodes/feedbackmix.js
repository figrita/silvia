import {registerNode} from '../registry.js'

registerNode({
    slug: 'feedbackmix',
    icon: '🔁',
    label: 'Feedback Mix',
    tooltip: 'Variable Time Feedback with a built in mix for simple motion-blur-like effect.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'delayAmount': {
            label: 'Delay Amount',
            type: 'float',
            control: {default: 0.5, min: 0.0, max: 1.0, step: 0.01}
        },
        'mix': {
            label: 'Feedback Mix',
            type: 'float',
            control: {default: 0.5, min: 0.0, max: 1.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const liveInput = this.getInput('input', cc)
                const delayAmount = this.getInput('delayAmount', cc)
                const mixAmount = this.getInput('mix', cc)
                const maxDelayFrames = 'float(u_frame_buffer_size - 1)' // Use the uniform

                return `vec4 ${funcName}(vec2 uv) {
    float aspect = u_resolution.x / u_resolution.y;
    vec2 screenUV = vec2((uv.x / aspect + 1.0) * 0.5, (uv.y + 1.0) * 0.5);
    vec4 liveColor = ${liveInput};
    float delay_norm = ${delayAmount};
    float absolute_delay = delay_norm * ${maxDelayFrames};
    float target_frame_index = mod(
        float(u_current_frame_index) - absolute_delay + float(u_frame_buffer_size),
        float(u_frame_buffer_size)
    );
    vec4 delayedColor = texture(u_frame_history, vec3(screenUV, target_frame_index));
    return mix(liveColor, delayedColor, ${mixAmount});
}`
            }
        }
    }
})