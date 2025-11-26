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
            function decimalPlaces(num) {
                const numStr = num.toString();
                const dotIndex = numStr.indexOf('.');
                return dotIndex === -1 ? 0 : numStr.length - dotIndex - 1;
            }
            this.elements.displayEl.textContent = this.values.current.toFixed(decimalPlaces(this.values.step))
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

        this.customArea.addEventListener('input', (e) => {
            const el = e.target
            const val = parseFloat(el.value)
            if(isNaN(val)) return

            switch(el.dataset.el){
                case 'minControl':
                    this.values.min = val
                    this.values.current = Math.max(this.values.min, Math.min(this.values.max, this.values.current))
                    break
                case 'maxControl':
                    this.values.max = val
                    this.values.current = Math.max(this.values.min, Math.min(this.values.max, this.values.current))
                    break
                case 'stepControl':
                    if(val > 0) this.values.step = val
                    break
                default:
                    return
            }
            this._updateDisplay()
        })

        this._updateDisplay()
    },
    
    onDestroy(){}
})