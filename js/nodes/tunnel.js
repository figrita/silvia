import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'
import {PhaseAccumulator} from '../phaseAccumulator.js'

registerNode({
    slug: 'tunnel',
    icon: '🕳️',
    label: 'Tunnel',
    tooltip: 'Tunnel/wormhole effect.',
    
    elements: {
        speedControl: null,
        rotationControl: null
    },
    values: {
        speed: 0.5,
        rotation: 0.0,
        isRunning: true
    },
    runtimeState: {
        speedPhaseAccumulator: null,
        rotationPhaseAccumulator: null
    },
    
    input: {
        'texture': {
            label: 'Texture',
            type: 'color',
            control: null
        },
        'distance': {
            label: 'Distance',
            type: 'float',
            control: {default: 0.45, min: 0, max: 2, step: 0.01}
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
    
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName){
                const depth = this.getInput('distance', cc)
                
                // Declare the phase uniforms in the compiler
                const speedPhaseUniformName = `${uniformName}_speed_phase`
                const rotationPhaseUniformName = `${uniformName}_rotation_phase`
                
                cc.uniforms.set(speedPhaseUniformName, {
                    type: 'float',
                    sourcePort: this.output.output
                })
                cc.uniforms.set(rotationPhaseUniformName, {
                    type: 'float',
                    sourcePort: this.output.output
                })
                
                return `vec4 ${funcName}(vec2 uv) {
    // Center position
    vec2 position = uv;
    
    // Compute angle normalized to 0-1 range to avoid seams
    float angle = atan(position.y, position.x);
    angle = angle / 3.14159265359 * 2.0;
    
    // Distance from center
    float distance = length(position);
    
    // Prevent division by zero
    if (distance < 0.001) distance = 0.001;
    
    // Compute the UV of the texture to render using smooth phase uniforms
    vec2 tunnelUV = vec2(
        angle + ${rotationPhaseUniformName},
        ${depth} + ${speedPhaseUniformName} + (${depth} / distance)
    );
    
    // Mirror wrap the texture coordinates from -1 to 1
    tunnelUV = abs(mod(tunnelUV + 1.0, 4.0) - 2.0) - 1.0;
    
    return ${this.getInput('texture', cc, 'tunnelUV')};
}`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed){return}
                
                // Get current smooth phase values
                const speedPhase = this._getCurrentSpeedPhase()
                const rotationPhase = this._getCurrentRotationPhase()
                
                // The uniformName comes from the compiler and should match what we declared in genCode
                // We need to handle both speed_phase and rotation_phase uniforms
                if(uniformName.endsWith('_speed_phase')) {
                    const location = gl.getUniformLocation(program, uniformName)
                    if(location) {
                        gl.uniform1f(location, speedPhase)
                    }
                } else if(uniformName.endsWith('_rotation_phase')) {
                    const location = gl.getUniformLocation(program, uniformName)
                    if(location) {
                        gl.uniform1f(location, rotationPhase)
                    }
                }
            }
        }
    },
    
    _getCurrentSpeedPhase(){
        // Initialize speed phase accumulator if needed
        if(!this.runtimeState.speedPhaseAccumulator){
            this.runtimeState.speedPhaseAccumulator = new PhaseAccumulator({
                initialSpeed: this.values.speed,
                transitionDuration: 0.05,
                minSpeed: -2.0,
                maxSpeed: 2.0
            })
        }
        
        if(!this.values.isRunning){
            // Return the frozen phase when paused
            return this.runtimeState.speedPhaseAccumulator.getPhase()
        }
        
        // Update and return current phase
        return this.runtimeState.speedPhaseAccumulator.update(this.values.speed)
    },
    
    _getCurrentRotationPhase(){
        // Initialize rotation phase accumulator if needed
        if(!this.runtimeState.rotationPhaseAccumulator){
            this.runtimeState.rotationPhaseAccumulator = new PhaseAccumulator({
                initialSpeed: this.values.rotation,
                transitionDuration: 0.05,
                minSpeed: -2.0,
                maxSpeed: 2.0
            })
        }
        
        if(!this.values.isRunning){
            // Return the frozen phase when paused
            return this.runtimeState.rotationPhaseAccumulator.getPhase()
        }
        
        // Update and return current phase
        return this.runtimeState.rotationPhaseAccumulator.update(this.values.rotation)
    },
    
    _toggleTunnel(){
        if(!this.values.isRunning){
            this.values.isRunning = true
            if(this.runtimeState.speedPhaseAccumulator){
                this.runtimeState.speedPhaseAccumulator.resume()
            }
            if(this.runtimeState.rotationPhaseAccumulator){
                this.runtimeState.rotationPhaseAccumulator.resume()
            }
        } else {
            this.values.isRunning = false
            if(this.runtimeState.speedPhaseAccumulator){
                this.runtimeState.speedPhaseAccumulator.pause()
            }
            if(this.runtimeState.rotationPhaseAccumulator){
                this.runtimeState.rotationPhaseAccumulator.pause()
            }
        }
    },
    
    _restartTunnel(){
        this.values.isRunning = true
        if(this.runtimeState.speedPhaseAccumulator){
            this.runtimeState.speedPhaseAccumulator.resetPhase(0)
            this.runtimeState.speedPhaseAccumulator.resume()
        }
        if(this.runtimeState.rotationPhaseAccumulator){
            this.runtimeState.rotationPhaseAccumulator.resetPhase(0)
            this.runtimeState.rotationPhaseAccumulator.resume()
        }
    },
    
    onCreate(){
        if(!this.customArea){return}
        
        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Speed</label>
                    <s-number value="${this.values.speed}" default="${this.defaults.speed}" min="-2.0" max="2.0" step="0.01" unit="×" data-el="speedControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Rotation</label>
                    <s-number value="${this.values.rotation}" default="${this.defaults.rotation}" min="-2.0" max="2.0" step="0.01" unit="×" data-el="rotationControl"></s-number>
                </div>
            </div>
        `
        
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)
        
        // Add listeners to update values when controls change
        this.elements.speedControl.addEventListener('input', (e) => {
            this.values.speed = parseFloat(e.target.value)
        })
        this.elements.rotationControl.addEventListener('input', (e) => {
            this.values.rotation = parseFloat(e.target.value)
        })
    },
    
    onDestroy(){
        this.runtimeState.speedPhaseAccumulator = null
        this.runtimeState.rotationPhaseAccumulator = null
    }
})