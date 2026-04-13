import {registerNode} from '../registry.js'
// import {autowire, StringToFragment} from '../utils.js'  // Custom UI
// import {shaderUtils} from '../shaderUtils.js'            // GLSL helpers
// import {SNode} from '../snode.js'                        // refreshDownstreamOutputs
// import {PhaseAccumulator} from '../phaseAccumulator.js'  // Framerate-independent phase
// import {RealtimeGraph} from '../realtimeGraph.js'        // Waveform canvas widget

registerNode({
    slug: 'template',
    icon: '🧩',
    label: 'Template Node',
    tooltip: 'Short description for menus',

    // =====================================================================
    //  INPUTS
    // =====================================================================
    //
    //  type: 'float'  — becomes a GLSL uniform. Use getInput() in genCode.
    //  type: 'color'  — same, but vec4. Default is '#rrggbbaa' hex string.
    //  type: 'action' — event trigger, no GLSL uniform. JS-only.
    //
    //  control: {default, min, max, step}  — inline slider/picker
    //  control: {default: '#ff0000ff'}     — color swatch
    //  control: {}                         — action button (for action type)
    //  control: null                       — no inline control, must connect
    //
    //  Optional properties on float controls:
    //    unit: '°'|'π'|'s'|'⬓'|'/⬓'  — display unit
    //    log-scale: true               — logarithmic slider behaviour
    //    samplingCost: '9'             — perf hint (multi-sample kernels)
    //
    //  IMPORTANT: Inputs create shader uniforms. They stay on the GPU —
    //  you CANNOT read their values from JS (no glReadPixels). Anything
    //  that must influence JS logic (BPM, grid size, animation settings)
    //  belongs in `values` with custom UI built in onCreate().
    //
    input: {
        input:   {label: 'Input',  type: 'color', control: null},
        amount:  {label: 'Amount', type: 'float', control: {default: 0.5, min: 0, max: 1, step: 0.01}},
    },

    // =====================================================================
    //  OUTPUTS
    // =====================================================================
    //
    //  --- Pure GLSL output (most common) ---
    //  genCode(cc, funcName) must return a GLSL function:
    //    color:  vec4 funcName(vec2 uv) { ... }
    //    float:  float funcName(vec2 uv) { ... }
    //
    //  Use this.getInput('key', cc) to get a GLSL expression for an input.
    //  Use this.getInput('key', cc, 'expr') to sample at a different UV.
    //  Use this.getOption('key') to read an option at compile time.
    //
    //  --- CPU-driven float output ---
    //  genCode returns `float funcName(vec2 uv) { return uniformName; }`
    //  floatUniformUpdate uploads the JS value every frame.
    //
    //  --- Texture output (canvas/video → GPU) ---
    //  genCode reads from the texture sampler via uniformName.
    //  textureUniformUpdate uploads pixel data every frame.
    //
    //  --- Action output (no GLSL) ---
    //  Just {label, type: 'action'}. Fire with this.triggerAction(key, 'down'|'up').
    //
    output: {
        // Pure GLSL — apply an effect to an input image
        output: {label: 'Output', type: 'color',
            genCode(cc, funcName){
                const input  = this.getInput('input', cc)
                const amount = this.getInput('amount', cc)
                return `vec4 ${funcName}(vec2 uv) {
                    vec4 col = ${input};
                    return mix(col, 1.0 - col, ${amount});
                }`
            }
        },

        // Float mask companion (common pattern for dual-output nodes)
        // mask: {label: 'Mask', type: 'float',
        //     genCode(cc, funcName){
        //         const input = this.getInput('input', cc)
        //         return `float ${funcName}(vec2 uv) {
        //             return dot(${input}.rgb, vec3(0.299, 0.587, 0.114));
        //         }`
        //     }
        // },

        // CPU-driven float (JS value → uniform each frame)
        // value: {label: 'Value', type: 'float',
        //     genCode(cc, funcName, uniformName){
        //         return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
        //     },
        //     floatUniformUpdate(uniformName, gl, program){
        //         gl.uniform1f(gl.getUniformLocation(program, uniformName), this.values.current)
        //     }
        // },

        // Texture from a canvas/video element
        // frame: {label: 'Frame', type: 'color',
        //     genCode(cc, funcName, uniformName){
        //         return `vec4 ${funcName}(vec2 uv) {
        //             return texture(${uniformName}, uv);
        //         }`
        //     },
        //     textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
        //         const source = this.elements.canvas
        //         if(!source) return
        //         gl.activeTexture(gl.TEXTURE0 + textureUnit)
        //         let entry = textureMap.get(this)
        //         if(!entry){
        //             const tex = gl.createTexture()
        //             gl.bindTexture(gl.TEXTURE_2D, tex)
        //             gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        //             gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        //             gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        //             gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        //             entry = {tex, w: 0, h: 0}
        //             textureMap.set(this, entry)
        //         } else {
        //             gl.bindTexture(gl.TEXTURE_2D, entry.tex)
        //         }
        //         const w = source.width, h = source.height
        //         if(w !== entry.w || h !== entry.h){
        //             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
        //             entry.w = w; entry.h = h
        //         } else {
        //             gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source)
        //         }
        //         gl.uniform1i(gl.getUniformLocation(program, uniformName), textureUnit)
        //     }
        // },

        // Action output (fire with this.triggerAction('fire', 'down'))
        // fire: {label: 'Fire', type: 'action'},
    },

    // =====================================================================
    //  OPTIONS — select dropdowns, read at compile time via getOption()
    // =====================================================================
    //  Changing an option triggers a shader recompile. Use inside genCode
    //  to emit different GLSL (JS-time branching, not GLSL-time).
    //
    // options: {
    //     mode: {label: 'Mode', type: 'select', default: 'a',
    //         choices: [{value: 'a', name: 'Mode A'}, {value: 'b', name: 'Mode B'}]
    //     }
    // },

    // =====================================================================
    //  SHADER UTILS — GLSL helpers injected at top of compiled shader
    // =====================================================================
    //  Import shaderUtils and reference named constants:
    //    shaderUtils: [shaderUtils.RGB2HSV, shaderUtils.HSV2RGB]
    //  Or inline raw GLSL strings for node-specific helpers.
    //
    // shaderUtils: [],

    // =====================================================================
    //  STATE
    // =====================================================================

    // DOM refs — populated by autowire(fragment) in onCreate via data-el attrs.
    // elements: {},

    // File inputs — <input type="file"> refs for asset loading.
    // fileSelectors: {},

    // Serializable user state — saved/restored with patches.
    // Use for CPU-only parameters that don't need shader uniforms.
    // values: {},

    // Transient runtime state — NOT saved. WebGL contexts, streams,
    // animation frame IDs, intervals, typed arrays, phase accumulators.
    // runtimeState: {},

    // =====================================================================
    //  LIFECYCLE
    // =====================================================================

    // onCreate(){
    //     if(!this.customArea) return
    //
    //     // Build custom UI for CPU-only parameters
    //     const html = `
    //         <div style="padding: 4px;">
    //             <div style="display:flex; justify-content:space-between; align-items:center;">
    //                 <label>Speed</label>
    //                 <s-number value="${this.values.speed}" min="0" max="10" step="0.1"
    //                     data-el="speedControl"></s-number>
    //             </div>
    //         </div>
    //     `
    //     const fragment = StringToFragment(html)
    //     this.elements = autowire(fragment)
    //     this.customArea.appendChild(fragment)
    //
    //     this.elements.speedControl.addEventListener('input', (e) => {
    //         this.values.speed = parseFloat(e.target.value)
    //     })
    // },

    // onDestroy(){
    //     // Cancel animation frames, intervals, revoke URLs, stop streams
    //     // cancelAnimationFrame(this.runtimeState.frameId)
    //     // clearInterval(this.runtimeState.intervalId)
    // },

    // =====================================================================
    //  INTERNAL METHODS — prefix with underscore, auto-bound to `this`
    // =====================================================================

    // _myHelper(){},
})
