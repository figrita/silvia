import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'
import {SNode} from '../snode.js'
import {shaderUtils} from '../shaderUtils.js'
// Based on https://www.shadertoy.com/view/XtBSWz by Nikos Papadopoulos, 4rknova / 2015 WTFPL
// Based on FlyGuy's shader: https://www.shadertoy.com/view/llSGRm
// Bitmap font data for debug text rendering
registerNode({
    slug: 'debug',
    icon: '🐛',
    label: 'Debug',
    tooltip: 'Probes number values at any point in the image. Samples the bottom-left corner of the resulting text overlay. For debugging purposes.',

    elements: {
        precisionControl: null
    },
    values: {
        precision: 2
    },

    shaderUtils: [shaderUtils.BITMAP_FONT],

    input: {
        'value': {
            label: 'Value',
            type: 'float',
            control: {default: 0, min: -999999, max: 999999, step: 0.01}
        },
        'backgroundColor': {
            label: 'Debug Input',
            type: 'color',
            control: null
        },
        'xPos': {
            label: 'X Position',
            type: 'float',
            control: {default: 0.0, min: -1, max: 1, step: 0.01}
        },
        'yPos': {
            label: 'Y Position',
            type: 'float',
            control: {default: 0.0, min: -1, max: 1, step: 0.01}
        },
        'textColor': {
            label: 'Text Color',
            type: 'color',
            control: {default: '#ffffffff'}
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const value = this.getInput('value', cc)
                const xPos = this.getInput('xPos', cc)
                const yPos = this.getInput('yPos', cc)
                const textColor = this.getInput('textColor', cc)
                const backgroundColor = this.getInput('backgroundColor', cc)

                return `vec4 ${funcName}(vec2 uv) {
    // Use the same coordinate system as the original shader
    vec2 res = u_resolution.xy / DWN_SC;
    vec2 fontCoords = (uv + 1.0) * 0.5 * SCREEN_SZ;
    
    // World coordinates input (${xPos}, ${yPos}) are in [-1,1] range
    vec2 worldPos = vec2(${xPos}, ${yPos});
    
    // Sample the value at the world position
    float debugValue = ${this.getInput('value', cc, 'worldPos')};
    
    // Convert world position to screen coordinates for text rendering
    vec2 textPos = (worldPos + 1.0) * 0.5 * SCREEN_SZ;
    
    float text = 0.0;
    
    // Print number at the converted screen position
    text += print_number(debugValue, textPos, fontCoords, ${this.values.precision}.0);
    
    vec4 textCol = ${textColor};
    vec4 bgCol = ${backgroundColor};
    
    return mix(bgCol, textCol, text);
}`
            }
        }
    },

    onCreate(){
        if(!this.customArea){return}

        this._createUI()
    },

    _createUI(){
        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Precision</label>
                    <s-number midi-disabled value="${this.values.precision}" default="${this.defaults.precision}" min="0" max="4" step="1" data-el="precisionControl"></s-number>
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        const refreshDownstream = () => {
            if(SNode){
                SNode.refreshDownstreamOutputs(this)
            }
        }

        this.elements.precisionControl.addEventListener('input', (e) => {
            this.values.precision = parseInt(e.target.value)
            refreshDownstream()
        })
    }
})