import {registerNode} from '../registry.js'

registerNode({
    slug: 'mouseinput',
    icon: '🖱️',
    label: 'Mouse Input',
    tooltip: 'Outputs the live position and button state of the mouse cursor over the editor.',
    
    runtimeState: {
        x: 0,
        y: 0,
        leftButton: 0,
        rightButton: 0,
        editorEl: null
    },
    
    input: {},
    output: {
        'x': {
            label: 'X Position',
            type: 'float',
            genCode(cc, funcName, uniformName) { return `float ${funcName}(vec2 uv) { return ${uniformName}; }` },
            floatUniformUpdate(uniformName, gl, program) {
                gl.uniform1f(gl.getUniformLocation(program, uniformName), this.runtimeState.x)
            }
        },
        'y': {
            label: 'Y Position',
            type: 'float',
            genCode(cc, funcName, uniformName) { return `float ${funcName}(vec2 uv) { return ${uniformName}; }` },
            floatUniformUpdate(uniformName, gl, program) {
                gl.uniform1f(gl.getUniformLocation(program, uniformName), this.runtimeState.y)
            }
        },
        'leftButton': {
            label: 'Left Button',
            type: 'float',
            genCode(cc, funcName, uniformName) { return `float ${funcName}(vec2 uv) { return ${uniformName}; }` },
            floatUniformUpdate(uniformName, gl, program) {
                gl.uniform1f(gl.getUniformLocation(program, uniformName), this.runtimeState.leftButton)
            }
        },
        'rightButton': {
            label: 'Right Button',
            type: 'float',
            genCode(cc, funcName, uniformName) { return `float ${funcName}(vec2 uv) { return ${uniformName}; }` },
            floatUniformUpdate(uniformName, gl, program) {
                gl.uniform1f(gl.getUniformLocation(program, uniformName), this.runtimeState.rightButton)
            }
        }
    },
    
    onCreate() {
        this.runtimeState.editorEl = document.getElementById('editor')
        if (!this.runtimeState.editorEl) return

        this._updateMouseState = this._updateMouseState.bind(this)
        this.runtimeState.editorEl.addEventListener('pointermove', this._updateMouseState)
        this.runtimeState.editorEl.addEventListener('pointerdown', this._updateMouseState)
        this.runtimeState.editorEl.addEventListener('pointerup', this._updateMouseState)
    },
    
    onDestroy() {
        if (!this.runtimeState.editorEl) return
        this.runtimeState.editorEl.removeEventListener('pointermove', this._updateMouseState)
        this.runtimeState.editorEl.removeEventListener('pointerdown', this._updateMouseState)
        this.runtimeState.editorEl.removeEventListener('pointerup', this._updateMouseState)
    },
    
    _updateMouseState(e) {
        const rect = this.runtimeState.editorEl.getBoundingClientRect()
        const aspectRatio = rect.width / rect.height
        
        // Normalize coordinates to [0, 1]
        const normX = (e.clientX - rect.left) / rect.width
        const normY = (e.clientY - rect.top) / rect.height
        
        // Convert to Silvia's worldspace coordinates
        this.runtimeState.x = (normX * 2.0 - 1.0) * aspectRatio
        this.runtimeState.y = -(normY * 2.0 - 1.0) // Y is inverted
        
        // Update button states
        this.runtimeState.leftButton = (e.buttons & 1) ? 1.0 : 0.0
        this.runtimeState.rightButton = (e.buttons & 2) ? 1.0 : 0.0
    }
})