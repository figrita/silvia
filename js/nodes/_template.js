import {registerNode} from '../registry.js'
// Import other utilities like autowire, shaderUtils if needed

registerNode({
    // --- Basic Node Information ---
    slug: 'template', // A unique, machine-readable identifier.
    icon: '🧩', // The emoji icon for the node.
    label: 'Template Node', // The user-facing name of the node.

    // --- Port Definitions (Optional) ---
    // CRITICAL: WebGL cannot efficiently read values back from GPU!
    // - No glReadPixels for float textures (Apple blocked EXT_color_buffer_float)
    // - RGBA readback is a massive performance bottleneck
    // - GPU→CPU readback stalls the entire pipeline
    //
    // Input ports should ONLY be used for values that:
    //   1. Need to be passed to shaders as uniforms (used in genCode)
    //   2. Accept connections from other nodes
    //   3. Stay entirely on the GPU (never influence CPU logic)
    // 
    // CPU-only parameters (BPM, grid size, animation settings, anything that
    // controls program flow) MUST use custom UI in onCreate() and store values
    // in the 'values' object. They cannot be shader inputs!
    input: {
        // SHADER INPUT: This creates a uniform and allows connections
        'someInput': {label: 'Some Input', type: 'float', control: {default: 0.5, min: 0, max: 1, step: 0.01}},
        
        // ACTION INPUT: For event triggers (supports downCallback/upCallback for gate events)
        'trigger': {label: 'Trigger Me', type: 'action', control: {}, 
            downCallback(){this._myActionHandler()},  // Called on trigger/gate-on
            upCallback(){this._myActionHandler()}     // Optional: Called on gate-off
        }
    },
    output: {
        'someOutput': {label: 'Some Output', type: 'float', genCode(cc, funcName){return ''}}
    },

    // --- Node Options (Optional) ---
    options: {
        'mode': {label: 'Mode', type: 'select', default: 'A', choices: [{value: 'A', name: 'Mode A'}]}
    },

    // --- Required GLSL Utilities (Optional) ---
    shaderUtils: [/* HSV2RGB, etc. */],

    // --- Standardized State Properties (All Optional) ---

    // DOM element references created in onCreate
    // Populated by autowire using data-el attributes
    elements: {
        myButton: null
    },

    // Holds references to file input elements.
    fileSelectors: {
        myFileInput: null
    },

    // Serializable state directly controlled by the user (e.g., from custom UI).
    // Should contain only primitive serializable values.
    // IMPORTANT: Use this for CPU-only parameters that don't need shader uniforms!
    // Examples: BPM, grid dimensions, animation durations, threshold values
    values: {
        customSetting: true,
        // Example CPU-only parameters:
        // bpm: 120,           // Sequencer tempo
        // gridSize: 64,       // Cellular automata dimensions  
        // duration: 1.0,      // Animation length
        // threshold: 0.5      // Processing threshold
    },

    // Non-serializable state, like WebGL contexts, stream objects, intervals, etc.
    runtimeState: {
        myInterval: null,
        isDirty: false
    },

    // --- Lifecycle Hooks (Optional) ---

    /**
     * Called after the node's DOM is created and added to the document.
     * Ideal for setting up event listeners and creating custom UI.
     * `this` is the node instance.
     */
    onCreate(){
        if(!this.customArea){return}
        // Create custom UI for CPU-only parameters using s-number/s-color components
        // This avoids creating unnecessary shader uniforms
        
        /* Example custom UI for CPU-only parameters:
        const html = `
            <div style="padding: 0.5rem;">
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">BPM</label>
                    <s-number value="${this.values.bpm}" min="20" max="300" step="1" data-el="bpmControl"></s-number>
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)
        
        // Listen for changes and update values (not shader uniforms!)
        this.elements.bpmControl.addEventListener('input', (e) => {
            this.values.bpm = parseFloat(e.target.value)
        })
        */
    },

    /**
     * Called just before the node is removed.
     * Ideal for cleaning up resources like event listeners, intervals, or object URLs.
     * `this` is the node instance.
     */
    onDestroy(){
        // ex: clearInterval(this.runtimeState.myInterval)
    },

    // --- Internal Methods (Optional) ---

    /**
     * All internal helper methods should be prefixed with an underscore.
     * The `SNode` constructor automatically binds `this` to all methods,
     * so they can be used directly as event callbacks.
     */
    _myActionHandler(){
        console.log('Action triggered!', this.id)
    }
})