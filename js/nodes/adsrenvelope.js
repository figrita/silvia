import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'
import {RealtimeGraph} from '../realtimeGraph.js'

registerNode({
    slug: 'adsrenvelope',
    icon: '📊',
    label: 'ADSR Envelope',
    tooltip: 'Classic Attack-Decay-Sustain-Release envelope. Triggered by gate input, great for controlling parameter automation over time.',
    
    elements: {
        attackControl: null,
        decayControl: null,
        sustainControl: null,
        releaseControl: null,
        maxControl: null,
        graphCanvas: null
    },
    values: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.7,
        release: 0.2,
        maxLevel: 1.0
    },
    runtimeState: {
        gateTime: -1,
        releaseTime: -1,
        isGated: false,
        lastValue: 0,
        graph: null
    },
    
    input: {
        'gate': {
            label: 'Gate',
            type: 'action',
            control: {},
            downCallback(){this._gateOn()},
            upCallback(){this._gateOff()}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            range: '[0, max]',
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed){return}
                const location = gl.getUniformLocation(program, uniformName)
                const value = this._getCurrentValue()
                gl.uniform1f(location, value)
            }
        }
    },
    
    options: {
        'attackCurve': {
            label: 'Attack Curve',
            type: 'select',
            default: 'linear',
            choices: [
                {value: 'linear', name: 'Linear'},
                {value: 'exponential', name: 'Exponential'},
                {value: 'logarithmic', name: 'Logarithmic'}
            ]
        },
        'decayCurve': {
            label: 'Decay Curve',
            type: 'select',
            default: 'exponential',
            choices: [
                {value: 'linear', name: 'Linear'},
                {value: 'exponential', name: 'Exponential'},
                {value: 'logarithmic', name: 'Logarithmic'}
            ]
        },
        'releaseCurve': {
            label: 'Release Curve',
            type: 'select',
            default: 'exponential',
            choices: [
                {value: 'linear', name: 'Linear'},
                {value: 'exponential', name: 'Exponential'},
                {value: 'logarithmic', name: 'Logarithmic'}
            ]
        }
    },

    onCreate(){
        if(!this.customArea){return}
        
        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Attack</label>
                    <s-number midi-disabled value="${this.values.attack}" default="${this.defaults.attack}" min="0.001" max="5.0" step="0.001" unit="s" data-el="attackControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Decay</label>
                    <s-number midi-disabled value="${this.values.decay}" default="${this.defaults.decay}" min="0.001" max="5.0" step="0.001" unit="s" data-el="decayControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Sustain</label>
                    <s-number value="${this.values.sustain}" default="${this.defaults.sustain}" min="0.0" max="1.0" step="0.01" data-el="sustainControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Release</label>
                    <s-number midi-disabled value="${this.values.release}" default="${this.defaults.release}" min="0.001" max="5.0" step="0.001" unit="s" data-el="releaseControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Max Level</label>
                    <s-number value="${this.values.maxLevel}" default="${this.defaults.maxLevel}" min="0.0" max="1000.0" step="0.1" data-el="maxControl"></s-number>
                </div>
                <canvas data-el="graphCanvas" width="320" height="120" style="width:100%; height:120px; border:1px solid #555; background:#222; margin-top:0.5rem; border-radius: 4px;"></canvas>
                <div style="display:flex; gap: 0.5rem; margin-top: 0.25rem;">
                    <div style="flex:1; text-align:center;">
                        <div style="font-size:0.7rem; color:#888;">Gate</div>
                        <div style="font-size:0.9rem; color:${this.runtimeState.isGated ? '#8f8' : '#f88'};" data-el="gateDisplay">
                            ${this.runtimeState.isGated ? 'ON' : 'OFF'}
                        </div>
                    </div>
                    <div style="flex:1; text-align:center;">
                        <div style="font-size:0.7rem; color:#888;">Phase</div>
                        <div style="font-size:0.9rem; color:#ccc;" data-el="phaseDisplay">Idle</div>
                    </div>
                </div>
            </div>
        `
        
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)
        
        // Add listeners to update values when controls change
        // Use 'input' event for live updates (including MIDI)
        this.elements.attackControl.addEventListener('input', (e) => {
            this.values.attack = parseFloat(e.target.value)
        })
        this.elements.decayControl.addEventListener('input', (e) => {
            this.values.decay = parseFloat(e.target.value)
        })
        this.elements.sustainControl.addEventListener('input', (e) => {
            this.values.sustain = parseFloat(e.target.value)
        })
        this.elements.releaseControl.addEventListener('input', (e) => {
            this.values.release = parseFloat(e.target.value)
        })
        this.elements.maxControl.addEventListener('input', (e) => {
            this.values.maxLevel = parseFloat(e.target.value)
            // Update graph scale when max level changes
            if(this.runtimeState.graph){
                this.runtimeState.graph.setOptions({
                    maxValue: this.values.maxLevel
                })
            }
        })
        
        // Initialize graph
        this.runtimeState.graph = new RealtimeGraph(this.elements.graphCanvas, {
            historySize: 200,
            gridLines: 4,
            gridSpacing: 40,
            minValue: 0,
            maxValue: this.values.maxLevel,
            autoScale: false
        })
        
        // Start animation loop for graph updates
        this.runtimeState.graph.startAnimation(() => {
            const value = this._getCurrentValue()
            this._updatePhaseDisplay()
            this._updateGateDisplay()
            return value
        })
    },

    onDestroy(){
        if(this.runtimeState.graph){
            this.runtimeState.graph.destroy()
        }
    },

    _gateOn(){
        this.runtimeState.gateTime = performance.now() / 1000
        this.runtimeState.isGated = true
        this.runtimeState.releaseTime = -1
    },

    _gateOff(){
        if(this.runtimeState.isGated){
            this.runtimeState.releaseTime = performance.now() / 1000
            this.runtimeState.isGated = false
            // Store the current value at release time for proper release curve
            this.runtimeState.lastValue = this._getPreReleaseValue()
        }
    },

    _getPreReleaseValue(){
        if(this.runtimeState.gateTime < 0){
            return 0
        }

        const currentTime = performance.now() / 1000
        const elapsed = currentTime - this.runtimeState.gateTime
        
        const attack = this.values.attack
        const decay = this.values.decay
        const sustain = this.values.sustain
        const maxLevel = this.values.maxLevel
        
        if(elapsed < attack){
            // Attack phase
            const t = elapsed / attack
            return this._applyCurve(t, this.getOption('attackCurve')) * maxLevel
        } else if(elapsed < attack + decay){
            // Decay phase
            const t = (elapsed - attack) / decay
            const decayValue = this._applyCurve(t, this.getOption('decayCurve'))
            return (1.0 - decayValue * (1.0 - sustain)) * maxLevel
        } else {
            // Sustain phase
            return sustain * maxLevel
        }
    },

    _applyCurve(t, curveType){
        switch(curveType){
            case 'exponential':
                // Fast attack/decay at start, slow at end
                return 1.0 - Math.exp(-5 * t)
            case 'logarithmic':
                // Slow attack/decay at start, fast at end
                return Math.log(1 + 9 * t) / Math.log(10)
            case 'linear':
            default:
                return t
        }
    },

    _getCurrentValue(){
        // If never triggered, return 0
        if(this.runtimeState.gateTime < 0){
            return 0
        }

        const currentTime = performance.now() / 1000
        
        // Handle release phase
        if(this.runtimeState.releaseTime > 0 && !this.runtimeState.isGated){
            const releaseElapsed = currentTime - this.runtimeState.releaseTime
            const release = this.values.release
            
            if(releaseElapsed < release){
                // In release phase
                const t = releaseElapsed / release
                const releaseCurve = this._applyCurve(t, this.getOption('releaseCurve'))
                return this.runtimeState.lastValue * (1.0 - releaseCurve)
            } else {
                // Release finished
                return 0
            }
        }
        
        // Handle attack/decay/sustain phases
        if(this.runtimeState.isGated){
            const elapsed = currentTime - this.runtimeState.gateTime
            
            const attack = this.values.attack
            const decay = this.values.decay
            const sustain = this.values.sustain
            const maxLevel = this.values.maxLevel
            
            if(elapsed < attack){
                // Attack phase
                const t = elapsed / attack
                return this._applyCurve(t, this.getOption('attackCurve')) * maxLevel
            } else if(elapsed < attack + decay){
                // Decay phase
                const t = (elapsed - attack) / decay
                const decayValue = this._applyCurve(t, this.getOption('decayCurve'))
                // Decay from max to sustain level
                return (1.0 - decayValue * (1.0 - sustain)) * maxLevel
            } else {
                // Sustain phase
                return sustain * maxLevel
            }
        }
        
        return 0
    },

    _updatePhaseDisplay(){
        if(!this.elements.phaseDisplay){return}
        
        let phase = 'Idle'
        
        if(this.runtimeState.gateTime < 0){
            phase = 'Idle'
        } else if(this.runtimeState.releaseTime > 0 && !this.runtimeState.isGated){
            const currentTime = performance.now() / 1000
            const releaseElapsed = currentTime - this.runtimeState.releaseTime
            if(releaseElapsed < this.values.release){
                phase = 'Release'
            } else {
                phase = 'Idle'
            }
        } else if(this.runtimeState.isGated){
            const currentTime = performance.now() / 1000
            const elapsed = currentTime - this.runtimeState.gateTime
            
            if(elapsed < this.values.attack){
                phase = 'Attack'
            } else if(elapsed < this.values.attack + this.values.decay){
                phase = 'Decay'
            } else {
                phase = 'Sustain'
            }
        }
        
        this.elements.phaseDisplay.textContent = phase
    },

    _updateGateDisplay(){
        if(this.elements.gateDisplay){
            this.elements.gateDisplay.style.color = this.runtimeState.isGated ? '#8f8' : '#f88'
            this.elements.gateDisplay.textContent = this.runtimeState.isGated ? 'ON' : 'OFF'
        }
    }
})