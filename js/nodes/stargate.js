import {registerNode} from '../registry.js'

registerNode({
    slug: 'stargate',
    icon: '👨‍🚀',
    label: 'Star Gate',
    tooltip: 'Time-displacement effect that creates a split stargate-like motion effect.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'angle': {
            label: 'Angle',
            type: 'float',
            control: {default: 0.5, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'position': {
            label: 'Offset',
            type: 'float',
            control: {default: 0.0, min: -1.0, max: 1.0, step: 0.001, unit: '⬓'}
        },
        'width': {
            label: 'Slit Width',
            type: 'float',
            control: {default: 0.02, min: 0.0, max: 0.5, step: 0.001, unit: '⬓'}
        },
        'speed': {
            label: 'Speed',
            type: 'float',
            control: {default: 1.0, min: -10.0, max: 10.0, step: 0.01}
        },
        'perspective': {
            label: 'Perspective',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 0.05, step: 0.001}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const position = this.getInput('position', cc)
                const width = this.getInput('width', cc)
                const speed = this.getInput('speed', cc)
                const angle = this.getInput('angle', cc)
                const perspective = this.getInput('perspective', cc)

                return `vec4 ${funcName}(vec2 uv) {
    // Apply perspective (zoom) to the UV coordinates
    float perspective = ${perspective};
    float zoom = 1.0 + perspective * 2.0;
    vec2 zoomedUV = uv / zoom;

    // Get current input color at this UV coordinate
    vec4 currentInputColor = ${this.getInput('input', cc, 'zoomedUV')};

    // Convert world UV to screen UV for frame history sampling
    float aspect = u_resolution.x / u_resolution.y;
    vec2 screenUV = vec2((zoomedUV.x / aspect + 1.0) * 0.5, (zoomedUV.y + 1.0) * 0.5);
    
    vec2 pixelSize = 1.0 / u_resolution;
    
    // --- Angle and Rotation Setup ---
    float angle_rad = ${angle} * PI;
    float s = sin(angle_rad);
    float c = cos(angle_rad);
    
    // --- Slit Mask Calculation (in world space) ---
    mat2 rot = mat2(c, -s, s, c);
    vec2 rotated_uv = rot * zoomedUV;
    float slit_coord = rotated_uv.y;
    
    float halfWidth = ${width};
    float scanLine = smoothstep(${position} - halfWidth, ${position} - halfWidth + 0.01, slit_coord) -
                     smoothstep(${position} + halfWidth - 0.01, ${position} + halfWidth, slit_coord);

    // --- Shift Calculation ---
    // The shift direction is perpendicular to the slit line.
    vec2 shift_normal = vec2(s, -c);

    // Split mode: shift direction depends on which side of the slit line we're on
    float side = sign(slit_coord - ${position});

    vec2 shift_vec = shift_normal * side;

    float speed = ${speed};
    vec2 lastFrameSampleUV = screenUV - (pixelSize * -speed * shift_vec);

    float last_frame_index = mod(float(u_current_frame_index) - 1.0 + float(u_frame_buffer_size), float(u_frame_buffer_size));
    vec4 lastFrameColor = texture(u_frame_history, vec3(lastFrameSampleUV, last_frame_index));
    
    return mix(lastFrameColor, currentInputColor, scanLine);
}`
            }
        }
    }
})