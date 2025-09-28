import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'triggeredcolor',
    icon: '🚦',
    label: 'Triggered Color',
    tooltip: 'Outputs a new random color each time it is triggered.',

    elements: {
        displayEl: null
    },
    values: {
        currentColor: [1.0, 0.0, 1.0, 1.0] // Default to magenta
    },

    input: {
        'trigger': {
            label: 'Trigger',
            type: 'action',
            control: {},
            downCallback() {
                // Generate random RGB values
                this.values.currentColor = [
                    Math.random(), // R
                    Math.random(), // G
                    Math.random(), // B
                    1.0            // A (always opaque)
                ]
                this._updateDisplay()
            }
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName) {
                return `vec4 ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            colorUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                if (location) {
                    gl.uniform4f(location,
                        this.values.currentColor[0],
                        this.values.currentColor[1],
                        this.values.currentColor[2],
                        this.values.currentColor[3]
                    )
                }
            }
        }
    },

    onCreate() {
        if (!this.customArea) return

        const html = `
            <div style="padding: 0.5rem;">
                <div data-el="displayEl" style="text-align:center; font-size:0.8rem; color:var(--text-primary); padding:0.75rem; border:1px solid var(--border-normal); border-radius:4px; font-family:monospace;">
                    Click trigger to generate
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
            const [r, g, b, a] = this.values.currentColor

            // Convert to 0-255 range for display
            const r255 = Math.round(r * 255)
            const g255 = Math.round(g * 255)
            const b255 = Math.round(b * 255)

            // Set background color to show the generated color
            this.elements.displayEl.style.backgroundColor = `rgb(${r255}, ${g255}, ${b255})`

            // Set text color for contrast (white text on dark colors, black on light)
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b)
            this.elements.displayEl.style.color = luminance > 0.5 ? '#000' : '#fff'

            // Display RGB values
            this.elements.displayEl.textContent = `RGB(${r255}, ${g255}, ${b255})`
        }
    }
})