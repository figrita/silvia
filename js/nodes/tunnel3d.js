import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'
import {PhaseAccumulator} from '../phaseAccumulator.js'

registerNode({
    slug: 'tunnel3d',
    icon: '🚇',
    label: 'Tunnel 3D',
    tooltip: 'Raymarched demoscene tunnel with twists and turns. Camera flies through a curved tube textured with the input.',

    elements: {
        speedControl: null
    },
    values: {
        speed: 0.5,
        isRunning: true
    },
    runtimeState: {
        phaseAccumulator: null
    },

    input: {
        'texture': {
            label: 'Texture',
            type: 'color',
            control: null
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
        },
        'startStop': {
            label: 'Start/Stop',
            type: 'action',
            control: {},
            downCallback(){
                this._toggleTunnel()
            }
        },
        'restart': {
            label: 'Restart',
            type: 'action',
            control: {},
            downCallback(){
                this._restartTunnel()
            }
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
            genCode(cc, funcName, uniformName){
                const twist = this.getInput('twist', cc)
                const radius = this.getInput('radius', cc)
                const zoom = this.getInput('zoom', cc)
                const path = this.getOption('path')

                const phaseUniform = `${uniformName}_phase`
                cc.uniforms.set(phaseUniform, {
                    type: 'float',
                    sourcePort: this.output.output
                })

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
    float t3d_camZ = ${phaseUniform};

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
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed) return
                if(!uniformName.endsWith('_phase')) return
                const location = gl.getUniformLocation(program, uniformName)
                if(location) gl.uniform1f(location, this._getCurrentPhase())
            }
        }
    },

    _getCurrentPhase(){
        if(!this.runtimeState.phaseAccumulator){
            this.runtimeState.phaseAccumulator = new PhaseAccumulator({
                initialSpeed: this.values.speed,
                transitionDuration: 0.05,
                minSpeed: -2.0,
                maxSpeed: 2.0
            })
        }
        if(!this.values.isRunning){
            return this.runtimeState.phaseAccumulator.getPhase()
        }
        return this.runtimeState.phaseAccumulator.update(this.values.speed)
    },

    _toggleTunnel(){
        if(!this.values.isRunning){
            this.values.isRunning = true
            if(this.runtimeState.phaseAccumulator) this.runtimeState.phaseAccumulator.resume()
        } else {
            this.values.isRunning = false
            if(this.runtimeState.phaseAccumulator) this.runtimeState.phaseAccumulator.pause()
        }
    },

    _restartTunnel(){
        this.values.isRunning = true
        if(this.runtimeState.phaseAccumulator){
            this.runtimeState.phaseAccumulator.resetPhase(0)
            this.runtimeState.phaseAccumulator.resume()
        }
    },

    onCreate(){
        if(!this.customArea) return

        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Speed</label>
                    <s-number value="${this.values.speed}" default="${this.defaults.speed}" min="-2.0" max="2.0" step="0.01" unit="×" data-el="speedControl"></s-number>
                </div>
            </div>
        `

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        this.elements.speedControl.addEventListener('input', (e) => {
            this.values.speed = parseFloat(e.target.value)
        })
    },

    onDestroy(){
        this.runtimeState.phaseAccumulator = null
    }
})
