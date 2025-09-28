import {registerNode} from '../registry.js'

registerNode({
    slug: 'feedback',
    icon: '🎸',
    label: 'Feedback',
    tooltip: 'Accesses the previous frame from render history. Useful for feedback effects and temporal processing.',
    input: {},
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    // Convert centered UVs to screen UVs [0,1] for sampling the history buffer
    float aspect = u_resolution.x / u_resolution.y;
    vec2 screenUV = vec2((uv.x / aspect + 1.0) * 0.5, (uv.y + 1.0) * 0.5);

    // Calculate the index for the previous frame
    float last_frame_index = mod(float(u_current_frame_index) - 1.0 + float(u_frame_buffer_size), float(u_frame_buffer_size));

    // Sample the history texture array at the previous frame's index
    return texture(u_frame_history, vec3(screenUV, last_frame_index));
}`
            }
        }
    }
})