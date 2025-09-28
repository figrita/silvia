import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'counter',
    icon: '⏱️',
    label: 'Counter',
    tooltip: 'Counts up or down when triggered. Useful for cycling through values, or using rotary encoders.',
    
    elements: {
        minControl: null,
        maxControl: null,
        stepControl: null,
        displayEl: null
    },
    values: {
        min: 0,
        max: 1,
        step: 0.01,
        current: 0
    },
    
    input: {
        'increment': {
            label: 'Increment',
            type: 'action',
            control: {},
            downCallback(){
                this._step(1)
            }
        },
        'decrement': {
            label: 'Decrement',
            type: 'action',
            control: {},
            downCallback(){
                this._step(-1)
            }
        },
        'reset': {
            label: 'Reset',
            type: 'action',
            control: {},
            downCallback(){
                this.values.current = this.values.min
                this._updateDisplay()
            }
        },
        'set': {
            label: 'Set to Max',
            type: 'action',
            control: {},
            downCallback(){
                this.values.current = this.values.max
                this._updateDisplay()
            }
        }
    },
    
    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'clamp',
            choices: [
                {value: 'clamp', name: 'Clamp'},
                {value: 'wrap', name: 'Wrap'}
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
                gl.uniform1f(location, this.values.current)
            }
        },
        'normalized': {
            label: 'Normalized',
            type: 'float',
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed){return}
                const location = gl.getUniformLocation(program, uniformName)
                const range = this.values.max - this.values.min
                const normalized = range > 0 ? (this.values.current - this.values.min) / range : 0
                gl.uniform1f(location, normalized)
            }
        }
    },
    
    _step(direction){
        const newValue = this.values.current + (direction * this.values.step)
        const mode = this.getOption('mode')
        
        if(mode === 'wrap'){
            const range = this.values.max - this.values.min + this.values.step
            if(newValue > this.values.max){
                this.values.current = this.values.min + ((newValue - this.values.max - this.values.step) % range)
            } else if(newValue < this.values.min){
                this.values.current = this.values.max - ((this.values.min - newValue - this.values.step) % range)
            } else {
                this.values.current = newValue
            }
        } else {
            // Clamp mode
            this.values.current = Math.max(this.values.min, Math.min(this.values.max, newValue))
        }
        
        this._updateDisplay()
    },
    
    _updateDisplay(){
        if(this.elements.displayEl){
            const decimals = this.values.step < 1 ? Math.max(2, -Math.floor(Math.log10(this.values.step))) : 0
            this.elements.displayEl.textContent = this.values.current.toFixed(decimals)
        }
    },
    
    onCreate(){
        if(!this.customArea){return}
        
        // Initialize current value
        this.values.current = this.values.current ?? this.values.min
        
        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Min</label>
                    <s-number midi-disabled value="${this.values.min}" default="${this.defaults.min}" min="-10000" max="10000" step="1" data-el="minControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Max</label>
                    <s-number midi-disabled value="${this.values.max}" default="${this.defaults.max}" min="-10000" max="10000" step="1" data-el="maxControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Step</label>
                    <s-number midi-disabled value="${this.values.step}" default="${this.defaults.step}" min="0.0001" max="1000" step="1" data-el="stepControl"></s-number>
                </div>
                <div style="text-align:center; font-size:1.2rem; color:#fff; padding:0.5rem; background:#333; border-radius:4px;" data-el="displayEl">
                    ${this.values.current}
                </div>
            </div>
        `
        
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)
        
        // Add listeners
        this.elements.minControl.addEventListener('input', (e) => {
            const newMin = parseFloat(e.target.value)
            if(!isNaN(newMin)){
                if(newMin > this.values.max){
                    // Swap if min > max
                    this.values.min = this.values.max
                    this.values.max = newMin
                    this.elements.maxControl.value = newMin
                    this.elements.minControl.value = this.values.min
                } else {
                    this.values.min = newMin
                }
                // Clamp current value to new range
                this.values.current = Math.max(this.values.min, Math.min(this.values.max, this.values.current))
                this._updateDisplay()
            }
        })
        this.elements.maxControl.addEventListener('input', (e) => {
            const newMax = parseFloat(e.target.value)
            if(!isNaN(newMax)){
                if(newMax < this.values.min){
                    // Swap if max < min
                    this.values.max = this.values.min
                    this.values.min = newMax
                    this.elements.minControl.value = newMax
                    this.elements.maxControl.value = this.values.max
                } else {
                    this.values.max = newMax
                }
                // Clamp current value to new range
                this.values.current = Math.max(this.values.min, Math.min(this.values.max, this.values.current))
                this._updateDisplay()
            }
        })
        this.elements.stepControl.addEventListener('input', (e) => {
            const newStep = parseFloat(e.target.value)
            if(!isNaN(newStep) && newStep > 0){
                this.values.step = newStep
                this._updateDisplay()
            }
        })
        
        this._updateDisplay()
    },
    
    onDestroy(){}
})