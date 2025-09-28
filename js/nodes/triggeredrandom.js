import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'triggeredrandom',
    icon: '🎰',
    label: 'Triggered Random',
    tooltip: 'Outputs a new random value within the specified range each time it is triggered.',
    
    elements: {
        displayEl: null,
        minControl: null,
        maxControl: null
    },
    values: {
        min: 0,
        max: 1,
        currentValue: 0.5
    },

    input: {
        'trigger': {
            label: 'Trigger',
            type: 'action',
            control: {},
            downCallback() {
                this.values.currentValue = this.values.min + Math.random() * (this.values.max - this.values.min)
                this._updateDisplay()
            }
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, this.values.currentValue)
            }
        }
    },
    
    onCreate() {
        if (!this.customArea) return

        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div data-el="displayEl" style="text-align:center; font-size:1.2rem; color:var(--text-primary); padding:0.5rem; background:var(--bg-secondary); border-radius:4px; font-family:monospace;">
                    ${this.values.currentValue.toFixed(3)}
                </div>

                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:var(--text-secondary);">Min</label>
                    <s-number value="${this.values.min}" default="0" min="-100" max="100" step="0.01" data-el="minControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:var(--text-secondary);">Max</label>
                    <s-number value="${this.values.max}" default="1" min="-100" max="100" step="0.01" data-el="maxControl"></s-number>
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        // Add event listeners for CPU-only controls
        this.elements.minControl.addEventListener('input', (e) => {
            this.values.min = parseFloat(e.target.value)
        })
        this.elements.maxControl.addEventListener('input', (e) => {
            this.values.max = parseFloat(e.target.value)
        })
    },
    
    _updateDisplay() {
        if (this.elements.displayEl) {
            this.elements.displayEl.textContent = this.values.currentValue.toFixed(3)
        }
    }
})