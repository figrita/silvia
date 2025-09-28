import {registerNode} from '../registry.js'
import {autowire, StringToFragment, formatFloatGLSL} from '../utils.js'
import {SNode} from '../snode.js'

registerNode({
    slug: 'drawingcanvas',
    icon: '👨🏻‍🎨',
    label: 'Drawing Canvas',
    tooltip: 'Interactive drawing canvas for creating custom textures with brush tools.',

    elements: {
        drawingCanvas: null,
        brushSizeControl: null,
        brushColorPicker: null,
        backgroundColorPicker: null,
    },
    values: {
        brushSize: 20,
        brushColor: '#ffffffff',
        backgroundColor: '#000000ff',
        canvasWidth: 512,
        canvasHeight: 512
    },
    defaults: {
        brushSize: 20,
        brushColor: '#ffffffff',
        backgroundColor: '#000000ff',
        canvasWidth: 512,
        canvasHeight: 512
    },
    runtimeState: {
        isDrawing: false,
        lastX: 0,
        lastY: 0,
        ctx: null,
        aspect: 1.0,
        isDirty: true
    },

    input: {
        'clear': {
            label: 'Clear',
            type: 'action',
            control: {},
            downCallback() { this._clearCanvas() }
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName) {
                return `vec4 ${funcName}(vec2 uv) {
    float aspect = ${formatFloatGLSL(this.runtimeState.aspect)};

    // Convert from world space to texture coordinates
    vec2 texCoords = vec2((uv.x / aspect + 1.0) * 0.5, (1.0 - uv.y) * 0.5);

    return texture(${uniformName}, texCoords);
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap) {
                if (this.isDestroyed) { return }

                const canvas = this.elements.drawingCanvas
                if (canvas && canvas.width > 0 && canvas.height > 0) {
                    let texture = textureMap.get(this)
                    if (!texture) {
                        texture = gl.createTexture()
                        textureMap.set(this, texture)
                        gl.bindTexture(gl.TEXTURE_2D, texture)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
                    }

                    gl.activeTexture(gl.TEXTURE0 + textureUnit)
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)

                    const location = gl.getUniformLocation(program, uniformName)
                    gl.uniform1i(location, textureUnit)
                }
            }
        }
    },

    options: {
        'canvas_res': {
            label: 'Canvas Size',
            type: 'select',
            default: '512x512',
            choices: [
                {value: '256x256', name: '256×256'},
                {value: '512x512', name: '512×512'},
                {value: '1024x1024', name: '1024×1024'},
                {value: '512x256', name: '512×256'},
                {value: '1024x512', name: '1024×512'}
            ]
        }
    },

    onCreate() {
        if (!this.customArea) { return }

        this._createUI()
        this._setupCanvas()
        this._setupDrawingEvents()
    },

    _createUI() {
        const html = `
            <div style="padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <canvas data-el="drawingCanvas" style="
                    width: 100%;
                    max-width: 300px;
                    border: 1px solid #555;
                    border-radius: 4px;
                    cursor: crosshair;
                    background: #000;
                "></canvas>

                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size: 0.9rem; color: #ccc;">Brush Size</label>
                    <s-number value="${this.values.brushSize}" default="${this.defaults.brushSize}" min="1" max="100" step="1" data-el="brushSizeControl"></s-number>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size: 0.9rem; color: #ccc;">Brush Color</label>
                    <s-color value="${this.values.brushColor}" data-el="brushColorPicker"></s-color>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size: 0.9rem; color: #ccc;">Background</label>
                    <s-color value="${this.values.backgroundColor}" data-el="backgroundColorPicker"></s-color>
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        // Event listeners
        this.elements.brushSizeControl.addEventListener('input', (e) => {
            this.values.brushSize = parseFloat(e.target.value)
        })

        this.elements.brushColorPicker.addEventListener('change', (e) => {
            // Make sure we're getting the event from the s-color element itself
            if (e.target === this.elements.brushColorPicker) {
                console.log('Brush color changed to:', e.target.value)
                this.values.brushColor = e.target.value
            }
        })

        this.elements.backgroundColorPicker.addEventListener('change', (e) => {
            this.values.backgroundColor = e.target.value
        })

        // Canvas resolution option listener
        const resOption = this.nodeEl.querySelector('[data-option-el="canvas_res"]')
        resOption.addEventListener('change', () => {
            this._updateCanvasResolution()
        })
    },

    _setupCanvas() {
        this._updateCanvasResolution()
        this.runtimeState.ctx = this.elements.drawingCanvas.getContext('2d')
        this.runtimeState.ctx.lineCap = 'round'
        this.runtimeState.ctx.lineJoin = 'round'
        this._clearCanvas()
    },

    _updateCanvasResolution() {
        const resolutionValue = this.getOption('canvas_res')
        const [width, height] = resolutionValue.split('x').map(Number)

        if (this.elements.drawingCanvas) {
            this.elements.drawingCanvas.width = width
            this.elements.drawingCanvas.height = height
            this.runtimeState.aspect = width / height
            this.values.canvasWidth = width
            this.values.canvasHeight = height

            if (this.runtimeState.ctx) {
                this._clearCanvas()
            }
        }
    },

    _setupDrawingEvents() {
        const canvas = this.elements.drawingCanvas

        const startDrawing = (e) => {
            this.runtimeState.isDrawing = true
            const rect = canvas.getBoundingClientRect()
            const scaleX = canvas.width / rect.width
            const scaleY = canvas.height / rect.height

            this.runtimeState.lastX = (e.clientX - rect.left) * scaleX
            this.runtimeState.lastY = (e.clientY - rect.top) * scaleY
        }

        const draw = (e) => {
            if (!this.runtimeState.isDrawing) return

            const rect = canvas.getBoundingClientRect()
            const scaleX = canvas.width / rect.width
            const scaleY = canvas.height / rect.height
            const currentX = (e.clientX - rect.left) * scaleX
            const currentY = (e.clientY - rect.top) * scaleY

            console.log('Drawing with brush color:', this.values.brushColor)
            this.runtimeState.ctx.strokeStyle = this.values.brushColor
            this.runtimeState.ctx.lineWidth = this.values.brushSize
            this.runtimeState.ctx.beginPath()
            this.runtimeState.ctx.moveTo(this.runtimeState.lastX, this.runtimeState.lastY)
            this.runtimeState.ctx.lineTo(currentX, currentY)
            this.runtimeState.ctx.stroke()

            this.runtimeState.lastX = currentX
            this.runtimeState.lastY = currentY

            // Texture updates in real-time automatically - no shader recompilation needed
        }

        const stopDrawing = () => {
            this.runtimeState.isDrawing = false
        }

        canvas.addEventListener('mousedown', startDrawing)
        canvas.addEventListener('mousemove', draw)
        canvas.addEventListener('mouseup', stopDrawing)
        canvas.addEventListener('mouseout', stopDrawing)

        // Prevent context menu on right click
        canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    },

    _clearCanvas() {
        if (!this.runtimeState.ctx) return

        this.runtimeState.ctx.fillStyle = this.values.backgroundColor
        this.runtimeState.ctx.fillRect(0, 0, this.values.canvasWidth, this.values.canvasHeight)

        // No need to trigger shader recompilation - texture updates automatically
    }
})