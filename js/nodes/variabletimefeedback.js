import {registerNode} from '../registry.js'

registerNode({
    slug: 'variabletimefeedback',
    icon: '⏳',
    label: 'Variable-Time Feedback',
    tooltip: 'Variable frame delay effect. Delay amount can be modulated for complex temporal effects and transitions.',
    input: {
        'delayAmount': {
            label: 'Delay Amount',
            type: 'float',
            control: {default: 0.5, min: 0.0, max: 1.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const delayAmount = this.getInput('delayAmount', cc)
                const maxDelayFrames = 'float(u_frame_buffer_size - 1)' // Use the uniform

                return `vec4 ${funcName}(vec2 uv) {
    float aspect = u_resolution.x / u_resolution.y;
    vec2 screenUV = vec2((uv.x / aspect + 1.0) * 0.5, (uv.y + 1.0) * 0.5);
    float delay_norm = ${delayAmount};
    float absolute_delay = delay_norm * ${maxDelayFrames};
    float target_frame_index = mod(
        float(u_current_frame_index) - absolute_delay + float(u_frame_buffer_size),
        float(u_frame_buffer_size)
    );
    return texture(u_frame_history, vec3(screenUV, target_frame_index));
}`
            }
        }
    }
})