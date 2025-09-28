import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'muxevent',
    icon: '👇',
    label: 'Mux (Event)',
    tooltip: 'Switches between 4 color inputs using next/prev/random buttons.',

    elements: {
        displayEl: null
    },
    values: {
        currentChannel: 0
    },

    input: {
        'input0': {label: 'Input 1', type: 'color', control: {default: '#ff0000ff'}},
        'input1': {label: 'Input 2', type: 'color', control: {default: '#00ff00ff'}},
        'input2': {label: 'Input 3', type: 'color', control: {default: '#0000ffff'}},
        'input3': {label: 'Input 4', type: 'color', control: {default: '#ffff00ff'}},
        'next': {
            label: 'Next',
            type: 'action',
            control: {},
            downCallback() {
                this.values.currentChannel = (this.values.currentChannel + 1) % 4
                this._updateDisplay()
            }
        },
        'prev': {
            label: 'Prev',
            type: 'action',
            control: {},
            downCallback() {
                this.values.currentChannel = (this.values.currentChannel + 3) % 4
                this._updateDisplay()
            }
        },
        'rand': {
            label: 'Random',
            type: 'action',
            control: {},
            downCallback() {
                this.values.currentChannel = Math.floor(Math.random() * 4)
                this._updateDisplay()
            }
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName) {
                return `vec4 ${funcName}(vec2 uv) {
    int channel = int(${uniformName});
    if (channel == 0) return ${this.getInput('input0', cc)};
    if (channel == 1) return ${this.getInput('input1', cc)};
    if (channel == 2) return ${this.getInput('input2', cc)};
    return ${this.getInput('input3', cc)};
}`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, this.values.currentChannel)
            }
        }
    },

    onCreate() {
        if (!this.customArea) return

        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div data-el="displayEl" style="text-align:center; font-size:1.2rem; color:var(--text-primary); padding:0.5rem; background:var(--bg-secondary); border-radius:4px; font-family:monospace;">
                    Input ${this.values.currentChannel + 1}
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        this._updateDisplay()
    },

    _updateDisplay() {
        if (this.elements.displayEl) {
            this.elements.displayEl.textContent = `Input ${this.values.currentChannel + 1}`
        }
    }
})