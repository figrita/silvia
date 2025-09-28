import {autowire, mapJoin, StringToFragment} from '../utils.js'
import {registerNode} from '../registry.js'
import {shaderUtils} from '../shaderUtils.js'
import {SNode} from '../snode.js'

registerNode({
    slug: 'sliderule',
    icon: '📏',
    label: 'Slide Rule',
    tooltip: 'Visual slider interface for manual parameter control with customizable ranges.',

    elements: {
        inBasisSelect: null,
        outBasisSelect: null,
        inInvertCheckbox: null,
        outInvertCheckbox: null
    },

    values: {
        inBasis: 0,
        outBasis: 2,
        inInvert: false,
        outInvert: false
    },

    input: {
        'input': {
            label: 'Input',
            type: 'float',
            control: {default: 0.5, min: 0.0, max: 1.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                // Define unique names for the uniforms that will hold our control values.
                const inBasisUniform = `u_int_${this.slug}${this.id}_inBasis`
                const outBasisUniform = `u_int_${this.slug}${this.id}_outBasis`
                const inInvertUniform = `u_bool_${this.slug}${this.id}_inInvert`
                const outInvertUniform = `u_bool_${this.slug}${this.id}_outInvert`

                // Add these uniforms to the compile context, linking them to our custom controls.
                cc.uniforms.set(inBasisUniform, {type: 'int', sourceControl: this.elements.inBasisSelect})
                cc.uniforms.set(outBasisUniform, {type: 'int', sourceControl: this.elements.outBasisSelect})
                cc.uniforms.set(inInvertUniform, {type: 'bool', sourceControl: this.elements.inInvertCheckbox})
                cc.uniforms.set(outInvertUniform, {type: 'bool', sourceControl: this.elements.outInvertCheckbox})

                // Generate the GLSL function for this node.
                return `float ${funcName}(vec2 uv) {
    float val = ${this.getInput('input', cc)};
    float normalized = normalize_sliderule(val, ${inBasisUniform});

    // XOR logic is the most intuitive for "invert input" and "invert output" ranges.
    // If one is true, invert. If both are true or both false, they cancel out.
    if (${inInvertUniform} != ${outInvertUniform}) {
        normalized = 1.0 - normalized;
    }
    
    return expand_sliderule(normalized, ${outBasisUniform});
}`
            }
        }
    },

    onCreate(){
        if(!this.customArea){return}

        const basisOptions = [
            {value: 0, name: '0 to 1'},
            {value: 1, name: '0 to 360'},
            {value: 2, name: '-1 to 1'},
            {value: 3, name: '0 to 255'},
            {value: 5, name: '0 to 2π'}
        ]

        // Helper to create a select dropdown with a label.
        const createSelect = (id, label) => `
            <div class="custom-control-group">
                <label for="${this.id}-${id}">${label}</label>
                <select id="${this.id}-${id}" data-el="${id}">
                    ${mapJoin(basisOptions, o => `<option value="${o.value}">${o.name}</option>`)}
                </select>
            </div>
        `

        // Helper to create a checkbox. Using the app-wide `.checkbox-group` pattern.
        const createCheckbox = (id, label) => `
            <div class="checkbox-group" style="margin: 0; padding: 0.2rem 0.5rem;">
                <label>
                    <input type="checkbox" data-el="${id}">
                    <span>${label}</span>
                </label>
            </div>
        `

        // The layout is defined using flexbox, keeping it local to this node.
        const html = `
            <div style="display: flex; flex-direction: column; padding: 0.5rem; gap: 0.5rem;">
                <div style="display: flex; align-items: flex-end; justify-content: space-around; gap: 0.5rem;">
                    ${createSelect('inBasisSelect', 'From')}
                    <div style="font-size: 1.5rem; font-weight: bold; color: #888; padding-bottom: 0.2rem;">→</div>
                    ${createSelect('outBasisSelect', 'To')}
                </div>
                <div style="display: flex; align-items: center; justify-content: space-around; gap: 0.5rem; margin-top: 0.2rem;">
                    ${createCheckbox('inInvertCheckbox', 'Invert')}
                    <div style="flex-basis: 1.5rem;"></div> <!-- Spacer -->
                    ${createCheckbox('outInvertCheckbox', 'Invert')}
                </div>
            </div>
        `

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        // Set the initial state of the UI from the 'values' object, which may have been loaded from a patch.
        this.elements.inBasisSelect.value = this.values.inBasis
        this.elements.outBasisSelect.value = this.values.outBasis
        this.elements.inInvertCheckbox.checked = this.values.inInvert
        this.elements.outInvertCheckbox.checked = this.values.outInvert

        // A change to any control updates the corresponding value and triggers a recompile downstream.
        const refresh = () => SNode.refreshDownstreamOutputs(this)

        this.elements.inBasisSelect.addEventListener('change', (e) => {
            this.values.inBasis = parseInt(e.target.value, 10)
            refresh()
        })

        this.elements.outBasisSelect.addEventListener('change', (e) => {
            this.values.outBasis = parseInt(e.target.value, 10)
            refresh()
        })

        this.elements.inInvertCheckbox.addEventListener('change', (e) => {
            this.values.inInvert = e.target.checked
            refresh()
        })

        this.elements.outInvertCheckbox.addEventListener('change', (e) => {
            this.values.outInvert = e.target.checked
            refresh()
        })
    },

    shaderUtils: [
        shaderUtils.SLIDERULE_NORMALIZE,
        shaderUtils.SLIDERULE_EXPAND
    ]
})