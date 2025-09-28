import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'
import {RealtimeGraph} from '../realtimeGraph.js'
import {PhaseAccumulator} from '../phaseAccumulator.js'

registerNode({
    slug: 'oscillator',
    icon: '👋',
    label: 'Oscillator',
    tooltip: 'Generates various waveforms (sine, square, triangle, etc.) at specified frequency. Includes real-time waveform display and phase control.',
    
    elements: {
        frequencyControl: null,
        amplitudeControl: null,
        offsetControl: null
    },
    values: {
        frequency: 1.0,
        amplitude: 1.0,
        offset: 0,
        isRunning: true
    },
    runtimeState: {
        phaseAccumulator: null,
        graph: null
    },
    
    input: {
        'startStop': {
            label: 'Start/Stop',
            type: 'action',
            control: {},
            downCallback(){
                this._toggleOscillator()
            }
        },
        'reset': {
            label: 'Reset',
            type: 'action',
            control: {},
            downCallback(){
                this._resetOscillator()
            }
        }
    },
    
    options: {
        'waveform': {
            label: 'Waveform',
            type: 'select',
            default: 'sine',
            choices: [
                {value: 'sine', name: 'Sine'},
                {value: 'cosine', name: 'Cosine'},
                {value: 'triangle', name: 'Triangle'},
                {value: 'square', name: 'Square'},
                {value: 'sawtooth', name: 'Sawtooth'},
                {value: 'pulse', name: 'Pulse'},
                {value: 'noise', name: 'Noise'}
            ]
        },
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'free',
            choices: [
                {value: 'free', name: 'Free Running'},
                {value: 'oneshot', name: 'One Shot'}
            ]
        }
    },
    
    output: {
        'output': {
            label: 'Output',
            type: 'float',
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
    
    _getCurrentValue(){
        if(!this.values.isRunning){
            return this.values.offset
        }
        
        // Initialize phase accumulator if needed
        if(!this.runtimeState.phaseAccumulator){
            this.runtimeState.phaseAccumulator = new PhaseAccumulator({
                initialSpeed: this.values.frequency,
                transitionDuration: 0.05,
                minSpeed: 0.01,
                maxSpeed: 30.0
            })
        }
        
        // Update phase with current frequency
        const phase = this.runtimeState.phaseAccumulator.update(this.values.frequency)
        
        const waveform = this.getOption('waveform')
        const mode = this.getOption('mode')
        
        // Calculate phase in radians
        let p = (phase * 2 * Math.PI) % (2 * Math.PI)
        
        // Handle one-shot mode
        if(mode === 'oneshot' && phase > 1){
            p = (1 * 2 * Math.PI) % (2 * Math.PI)
        }
        
        // Calculate waveform value
        let value = 0
        
        switch(waveform){
            case 'cosine':
                value = Math.cos(p)
                break
            case 'triangle':
                value = 2 * Math.abs(2 * ((p / (2 * Math.PI)) - Math.floor((p / (2 * Math.PI)) + 0.5))) - 1
                break
            case 'square':
                value = p < Math.PI ? 1 : -1
                break
            case 'sawtooth':
                value = 2 * ((p / (2 * Math.PI)) - Math.floor((p / (2 * Math.PI)) + 0.5))
                break
            case 'pulse':
                value = (p % (2 * Math.PI)) < (Math.PI * 0.5) ? 1 : -1
                break
            case 'noise':
                value = Math.random() * 2 - 1
                break
            case 'sine':
            default:
                value = Math.sin(p)
                break
        }
        
        return value * this.values.amplitude + this.values.offset
    },
    
    _toggleOscillator(){
        if(!this.values.isRunning){
            this.values.isRunning = true
            if(this.runtimeState.phaseAccumulator){
                this.runtimeState.phaseAccumulator.resume()
            }
        } else {
            this.values.isRunning = false
            if(this.runtimeState.phaseAccumulator){
                this.runtimeState.phaseAccumulator.pause()
            }
        }
    },
    
    _resetOscillator(){
        this.values.isRunning = true
        if(this.runtimeState.phaseAccumulator){
            this.runtimeState.phaseAccumulator.resetPhase(0)
            this.runtimeState.phaseAccumulator.resume()
        }
    },
    
    onCreate(){
        if(!this.customArea){return}
        
        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <canvas data-el="canvas" width="300" height="100" style="width: 100%; height: 100px; border-radius: 4px; margin-bottom: 0.5rem;"></canvas>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Frequency</label>
                    <s-number value="${this.values.frequency}" default="${this.defaults.frequency}" min="0.01" max="30.0" step="0.01" unit="Hz" log-scale data-el="frequencyControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Amplitude</label>
                    <s-number value="${this.values.amplitude}" default="${this.defaults.amplitude}" min="0" max="10" step="0.01" data-el="amplitudeControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Offset</label>
                    <s-number value="${this.values.offset}" default="${this.defaults.offset}" min="-10" max="10" step="0.01" data-el="offsetControl"></s-number>
                </div>
            </div>
        `
        
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)
        
        // Setup RealtimeGraph
        this.runtimeState.graph = new RealtimeGraph(this.elements.canvas, {
            historySize: 300,
            autoScale: false,
            minValue: -10,
            maxValue: 10,
            showValue: true
        })
        
        // Add listeners with graph range updates
        this.elements.frequencyControl.addEventListener('input', (e) => {
            this.values.frequency = parseFloat(e.target.value)
        })
        this.elements.amplitudeControl.addEventListener('input', (e) => {
            this.values.amplitude = parseFloat(e.target.value)
            this._updateGraphRange()
        })
        this.elements.offsetControl.addEventListener('input', (e) => {
            this.values.offset = parseFloat(e.target.value)
            this._updateGraphRange()
        })
        
        // Initialize graph range based on current values
        this._updateGraphRange()
        
        // Start animation
        this.runtimeState.graph.startAnimation(() => this._getCurrentValue())
    },
    
    _updateGraphRange(){
        if(!this.runtimeState.graph) return
        
        const minValue = this.values.offset - this.values.amplitude
        const maxValue = this.values.offset + this.values.amplitude
        
        this.runtimeState.graph.setOptions({
            minValue: minValue,
            maxValue: maxValue,
            autoScale: false
        })
    },
    
    onDestroy(){
        if(this.runtimeState.graph){
            this.runtimeState.graph.destroy()
        }
        this.runtimeState.phaseAccumulator = null
    }
})