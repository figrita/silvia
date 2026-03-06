import {registerNode} from '../registry.js'

registerNode({
    slug: 'tunnel3d',
    icon: '🚇',
    label: 'Tunnel 3D',
    tooltip: 'Raymarched demoscene tunnel with twists and turns. Camera flies through a curved tube textured with the input.',

    input: {
        'texture': {
            label: 'Texture',
            type: 'color',
            control: null
        },
        'speed': {
            label: 'Speed',
            type: 'float',
            control: {default: 0.5, min: -2, max: 2, step: 0.01}
        },
        'twist': {
            label: 'Twist',
            type: 'float',
            control: {default: 1.5, min: 0, max: 4, step: 0.01}
        },
        'radius': {
            label: 'Radius',
            type: 'float',
            control: {default: 1.0, min: 0.3, max: 3, step: 0.01}
        },
        'zoom': {
            label: 'Zoom',
            type: 'float',
            control: {default: 1.5, min: 0.3, max: 4, step: 0.01}
        }
    },

    options: {
        'path': {
            label: 'Path',
            type: 'select',
            default: 'sine',
            choices: [
                {value: 'sine', name: 'Sine'},
                {value: 'helix', name: 'Helix'},
                {value: 'lissajous', name: 'Lissajous'}
            ]
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const speed = this.getInput('speed', cc)
                const twist = this.getInput('twist', cc)
                const radius = this.getInput('radius', cc)
                const zoom = this.getInput('zoom', cc)
                const path = this.getOption('path')

                const pathAt = (z) => {
                    switch(path){
                        case 'helix':
                            return `vec2(cos(${z} * 0.4) * t3d_tw, sin(${z} * 0.4) * t3d_tw)`
                        case 'lissajous':
                            return `vec2(sin(${z} * 0.3) * t3d_tw, sin(${z} * 0.5 + 1.5708) * t3d_tw)`
                        default:
                            return `vec2(sin(${z} * 0.3 + 1.7) * t3d_tw, cos(${z} * 0.5 + 2.3) * t3d_tw * 0.7)`
                    }
                }

                return `vec4 ${funcName}(vec2 uv) {
    float t3d_tw = ${twist};
    float t3d_r = ${radius};
    float t3d_camZ = u_time * ${speed};

    vec2 t3d_camXY = ${pathAt('t3d_camZ')};
    vec3 t3d_ro = vec3(t3d_camXY, t3d_camZ);

    float t3d_lookZ = t3d_camZ + 0.5;
    vec3 t3d_tgt = vec3(${pathAt('t3d_lookZ')}, t3d_lookZ);

    vec3 t3d_fwd = normalize(t3d_tgt - t3d_ro);
    vec3 t3d_right = normalize(cross(vec3(0.0, 1.0, 0.0), t3d_fwd));
    vec3 t3d_up = cross(t3d_fwd, t3d_right);
    vec3 t3d_rd = normalize(uv.x * t3d_right + uv.y * t3d_up + ${zoom} * t3d_fwd);

    float t3d_t = 0.0;
    for (int i = 0; i < 32; i++) {
        vec3 t3d_p = t3d_ro + t3d_rd * t3d_t;
        vec2 t3d_pxy = ${pathAt('t3d_p.z')};
        float t3d_d = t3d_r - length(t3d_p.xy - t3d_pxy);
        if (t3d_d < 0.001 || t3d_t > 30.0) break;
        t3d_t += t3d_d * 0.7;
    }

    vec3 t3d_hit = t3d_ro + t3d_rd * t3d_t;
    vec2 t3d_hp = ${pathAt('t3d_hit.z')};
    float t3d_a = atan(t3d_hit.y - t3d_hp.y, t3d_hit.x - t3d_hp.x);

    vec2 t3d_tc = vec2(t3d_a / 3.14159265 * 2.0, t3d_hit.z * 0.5);
    t3d_tc = abs(mod(t3d_tc + 1.0, 4.0) - 2.0) - 1.0;

    return ${this.getInput('texture', cc, 't3d_tc')};
}`
            }
        }
    }
})
