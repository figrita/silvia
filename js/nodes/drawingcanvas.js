import {registerNode} from '../registry.js'
import {autowire, StringToFragment, hexToRgba} from '../utils.js'

// Icons from Lucide (https://lucide.dev/) — see licenses/LICENSE-LUCIDE
const TOOL_ICONS = {
    pen:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
    eraser: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>',
    line:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="20" x2="20" y2="4"/></svg>',
    rect:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/></svg>',
    circle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
    fill:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/></svg>',
}

const TOOLS = {
    pen:    {label: 'Pen',    key: 'b', cursor: 'crosshair'},
    eraser: {label: 'Eraser', key: 'e', cursor: 'crosshair'},
    line:   {label: 'Line',   key: 'l', cursor: 'crosshair'},
    rect:   {label: 'Rect',   key: 'r', cursor: 'crosshair'},
    circle: {label: 'Circle', key: 'c', cursor: 'crosshair'},
    fill:   {label: 'Fill',   key: 'f', cursor: 'crosshair'},
}

const SYMMETRY_MODES = [
    {value: 'none',   label: 'None'},
    {value: 'h',      label: 'H Mirror'},
    {value: 'v',      label: 'V Mirror'},
    {value: 'hv',     label: 'HV Mirror'},
    {value: 'r3',     label: '3-Fold'},
    {value: 'r4',     label: '4-Fold'},
    {value: 'r6',     label: '6-Fold'},
    {value: 'r8',     label: '8-Fold'},
]

registerNode({
    slug: 'drawingcanvas',
    icon: '👨🏻‍🎨',
    label: 'Drawing Canvas',
    tooltip: 'Interactive drawing canvas with pen, eraser, line, rect, circle, and fill tools. Symmetry modes, brush opacity, and keyboard shortcuts when canvas is focused.',

    elements: {
        drawingCanvas: null,
        brushSizeControl: null,
        brushColorPicker: null,
        backgroundColorPicker: null,
        toolButtons: null,
        symmetrySelect: null,
    },
    values: {
        brushSize: 5,
        brushColor: '#ffffffff',
        backgroundColor: '#000000ff',
        canvasWidth: 512,
        canvasHeight: 512,
        tool: 'pen',
        symmetry: 'none',
    },

    runtimeState: {
        isDrawing: false,
        lastX: 0,
        lastY: 0,
        ctx: null,
        // Shape preview
        shapeStartX: 0,
        shapeStartY: 0,
        previewSnapshot: null,
        // Cached symmetry transforms (recomputed only when mode/dimensions change)
        cachedTransforms: null,
        cachedSymmetryKey: null,
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
                const wrap = this.getOption('wrap')
                const uvExpr = wrap === 'clamp'
                    ? 'texCoords'
                    : wrap === 'repeat'
                        ? 'fract(texCoords)'
                        : 'abs(mod(texCoords, 2.0) - 1.0)' // mirror
                return `vec4 ${funcName}(vec2 uv) {
    ivec2 texSize = textureSize(${uniformName}, 0);
    float aspect = float(texSize.x) / float(texSize.y);
    vec2 texCoords = vec2((uv.x / aspect + 1.0) * 0.5, (1.0 - uv.y) * 0.5);
    return texture(${uniformName}, ${uvExpr});
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap) {
                if (this.isDestroyed) return

                const canvas = this.elements.drawingCanvas
                if (canvas && canvas.width > 0 && canvas.height > 0) {
                    let entry = textureMap.get(this)
                    if (!entry) {
                        const tex = gl.createTexture()
                        entry = {tex, w: 0, h: 0, wrap: null}
                        textureMap.set(this, entry)
                        gl.bindTexture(gl.TEXTURE_2D, tex)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
                    }

                    // Update wrap mode if changed
                    const wrap = this.getOption('wrap')
                    if (entry.wrap !== wrap) {
                        const glWrap = wrap === 'repeat' ? gl.REPEAT
                            : wrap === 'mirror' ? gl.MIRRORED_REPEAT
                            : gl.CLAMP_TO_EDGE
                        gl.bindTexture(gl.TEXTURE_2D, entry.tex)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glWrap)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glWrap)
                        entry.wrap = wrap
                    }

                    gl.activeTexture(gl.TEXTURE0 + textureUnit)
                    gl.bindTexture(gl.TEXTURE_2D, entry.tex)
                    if (entry.w === canvas.width && entry.h === canvas.height) {
                        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
                    } else {
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
                        entry.w = canvas.width; entry.h = canvas.height
                    }

                    const location = gl.getUniformLocation(program, uniformName)
                    gl.uniform1i(location, textureUnit)
                }
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName, uniformName) {
                const wrap = this.getOption('wrap')
                const uvExpr = wrap === 'clamp'
                    ? 'texCoords'
                    : wrap === 'repeat'
                        ? 'fract(texCoords)'
                        : 'abs(mod(texCoords, 2.0) - 1.0)'
                return `float ${funcName}(vec2 uv) {
    ivec2 texSize = textureSize(${uniformName}, 0);
    float aspect = float(texSize.x) / float(texSize.y);
    vec2 texCoords = vec2((uv.x / aspect + 1.0) * 0.5, (1.0 - uv.y) * 0.5);
    vec4 c = texture(${uniformName}, ${uvExpr});
    return dot(c.rgb, vec3(0.299, 0.587, 0.114)) * c.a;
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap) {
                // Share texture with output port
                this.output.output.textureUniformUpdate.call(this, uniformName, gl, program, textureUnit, textureMap)
            }
        },
        'strokeDone': {
            label: 'Stroke Done',
            type: 'action'
        }
    },

    options: {
        'canvas_res': {
            label: 'Canvas Size',
            type: 'select',
            default: '512x512',
            choices: [
                {value: '256x256', name: '256x256'},
                {value: '512x512', name: '512x512'},
                {value: '1024x1024', name: '1024x1024'},
                {value: '512x256', name: '512x256'},
                {value: '1024x512', name: '1024x512'}
            ]
        },
        'wrap': {
            label: 'Wrap',
            type: 'select',
            default: 'clamp',
            choices: [
                {value: 'clamp', name: 'Clamp'},
                {value: 'repeat', name: 'Repeat'},
                {value: 'mirror', name: 'Mirror'}
            ]
        }
    },

    onCreate() {
        if (!this.customArea) return

        this._createUI()
        this._setupCanvas()
        this._setupDrawingEvents()
        this._setupKeyboard()
    },

    _createUI() {
        const toolBtns = Object.entries(TOOLS).map(([key, t]) =>
            `<button data-tool="${key}" title="${t.label} (${t.key.toUpperCase()})" style="
                width: 28px; height: 28px; border: 1px solid #555; border-radius: 4px;
                background: ${key === this.values.tool ? '#555' : '#222'}; color: #ccc;
                cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center;
            ">${TOOL_ICONS[key]}</button>`
        ).join('')

        const symmetryOpts = SYMMETRY_MODES.map(m =>
            `<option value="${m.value}" ${m.value === this.values.symmetry ? 'selected' : ''}>${m.label}</option>`
        ).join('')

        const html = `
            <div style="padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <canvas data-el="drawingCanvas" style="
                    width: 300px; border: 1px solid #555;
                    border-radius: 4px; cursor: crosshair; background: #000;
                "></canvas>

                <div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: center;" data-el="toolButtons">
                    ${toolBtns}
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Size</label>
                    <s-number value="${this.values.brushSize}" default="5" min="1" max="200" step="1" data-el="brushSizeControl"></s-number>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Color</label>
                    <s-color value="${this.values.brushColor}" data-el="brushColorPicker"></s-color>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Background</label>
                    <s-color value="${this.values.backgroundColor}" data-el="backgroundColorPicker"></s-color>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Symmetry</label>
                    <select data-el="symmetrySelect" style="
                        background: #222; color: #ccc; border: 1px solid #555;
                        border-radius: 4px; padding: 2px 4px; font-size: 0.85rem;
                    ">${symmetryOpts}</select>
                </div>

                <div style="font-size: 0.7rem; color: #666; text-align: center; line-height: 1.4; max-width: 300px;">
                    B pen · E eraser · L line · R rect · C circle · F fill · [ ] size
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        // Tool buttons
        this.elements.toolButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-tool]')
            if (!btn) return
            this._selectTool(btn.dataset.tool)
        })

        // Controls
        this.elements.brushSizeControl.addEventListener('input', (e) => {
            this.values.brushSize = parseFloat(e.target.value)
        })
        this.elements.brushColorPicker.addEventListener('change', (e) => {
            if (e.target === this.elements.brushColorPicker) {
                this.values.brushColor = e.target.value
            }
        })
        this.elements.backgroundColorPicker.addEventListener('change', (e) => {
            this.values.backgroundColor = e.target.value
        })
        this.elements.symmetrySelect.addEventListener('change', (e) => {
            this.values.symmetry = e.target.value
        })

        // Canvas resolution option listener
        const resOption = this.nodeEl.querySelector('[data-option-el="canvas_res"]')
        resOption.addEventListener('change', () => this._updateCanvasResolution())
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
            this.values.canvasWidth = width
            this.values.canvasHeight = height

            if (this.runtimeState.ctx) {
                this._clearCanvas()
            }
        }
    },

    _selectTool(tool) {
        if (!TOOLS[tool]) return
        this.values.tool = tool
        this.elements.drawingCanvas.style.cursor = TOOLS[tool].cursor
        // Update button highlights
        for (const btn of this.elements.toolButtons.querySelectorAll('[data-tool]')) {
            btn.style.background = btn.dataset.tool === tool ? '#555' : '#222'
        }
    },

    // --- Symmetry transforms ---

    _getSymmetryTransforms() {
        const mode = this.values.symmetry
        const w = this.values.canvasWidth
        const h = this.values.canvasHeight
        const key = `${mode}:${w}:${h}`

        // Return cached transforms if mode and dimensions haven't changed
        if (this.runtimeState.cachedSymmetryKey === key) {
            return this.runtimeState.cachedTransforms
        }

        const cx = w / 2
        const cy = h / 2

        // Identity always included
        const transforms = [(x, y) => [x, y]]

        if (mode === 'h' || mode === 'hv') {
            transforms.push((x, y) => [w - x, y])
        }
        if (mode === 'v' || mode === 'hv') {
            transforms.push((x, y) => [x, h - y])
        }
        if (mode === 'hv') {
            transforms.push((x, y) => [w - x, h - y])
        }

        const radialMatch = mode.match(/^r(\d+)$/)
        if (radialMatch) {
            const folds = parseInt(radialMatch[1])
            transforms.length = 0 // clear identity
            for (let i = 0; i < folds; i++) {
                const angle = (2 * Math.PI * i) / folds
                const cos = Math.cos(angle)
                const sin = Math.sin(angle)
                transforms.push((x, y) => {
                    const dx = x - cx, dy = y - cy
                    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
                })
            }
        }

        this.runtimeState.cachedTransforms = transforms
        this.runtimeState.cachedSymmetryKey = key
        return transforms
    },

    // --- Drawing events ---

    _setupDrawingEvents() {
        const canvas = this.elements.drawingCanvas

        // Focusable for keyboard shortcuts and wheel
        canvas.tabIndex = 0
        canvas.style.outline = 'none'
        canvas.addEventListener('focus', () => {
            canvas.style.boxShadow = '0 0 0 2px hsla(var(--theme-hue), var(--theme-sat-full), 50%, 0.5)'
        })
        canvas.addEventListener('blur', () => {
            canvas.style.boxShadow = 'none'
        })
        canvas.addEventListener('click', () => canvas.focus())

        // Pointer events for pressure sensitivity
        canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault()
            canvas.setPointerCapture(e.pointerId)
            canvas.focus()

            const [x, y] = this._canvasCoords(e)

            if (this.values.tool === 'fill') {
                this._floodFill(Math.round(x), Math.round(y))
                this.triggerAction('strokeDone')
                return
            }

            this.runtimeState.isDrawing = true
            this.runtimeState.lastX = x
            this.runtimeState.lastY = y

            if (this.values.tool === 'line' || this.values.tool === 'rect' || this.values.tool === 'circle') {
                this.runtimeState.shapeStartX = x
                this.runtimeState.shapeStartY = y
                // Snapshot for shape preview (restore before each preview draw)
                this.runtimeState.previewSnapshot = this.runtimeState.ctx.getImageData(
                    0, 0, canvas.width, canvas.height
                )
            } else {
                // Pen/eraser: draw a dot at the click point
                this._drawStroke(x, y, x, y)
            }
        })

        canvas.addEventListener('pointermove', (e) => {
            if (!this.runtimeState.isDrawing) return

            const [x, y] = this._canvasCoords(e)
            const tool = this.values.tool

            if (tool === 'line' || tool === 'rect' || tool === 'circle') {
                // Restore snapshot and draw preview
                this.runtimeState.ctx.putImageData(this.runtimeState.previewSnapshot, 0, 0)
                this._drawShape(
                    this.runtimeState.shapeStartX, this.runtimeState.shapeStartY,
                    x, y, false
                )
            } else {
                this._drawStroke(
                    this.runtimeState.lastX, this.runtimeState.lastY,
                    x, y
                )
                this.runtimeState.lastX = x
                this.runtimeState.lastY = y
            }
        })

        const endDraw = (e) => {
            if (!this.runtimeState.isDrawing) return
            this.runtimeState.isDrawing = false

            const tool = this.values.tool
            if (tool === 'line' || tool === 'rect' || tool === 'circle') {
                // Restore snapshot, draw final shape
                this.runtimeState.ctx.putImageData(this.runtimeState.previewSnapshot, 0, 0)
                const [x, y] = this._canvasCoords(e)
                this._drawShape(
                    this.runtimeState.shapeStartX, this.runtimeState.shapeStartY,
                    x, y, true
                )
                this.runtimeState.previewSnapshot = null
            }

            this.triggerAction('strokeDone')
        }

        canvas.addEventListener('pointerup', endDraw)

        // Scroll to change brush size when focused
        canvas.addEventListener('wheel', (e) => {
            if (document.activeElement !== canvas) return
            e.preventDefault()
            e.stopPropagation()
            const delta = e.deltaY > 0 ? -1 : 1
            const step = e.shiftKey ? 5 : 1
            this.values.brushSize = Math.max(1, Math.min(200, this.values.brushSize + delta * step))
            this.elements.brushSizeControl.value = this.values.brushSize
        }, {passive: false})

        canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    },

    _setupKeyboard() {
        const canvas = this.elements.drawingCanvas

        canvas.addEventListener('keydown', (e) => {
            if (document.activeElement !== canvas) return

            // Tool shortcuts
            for (const [key, t] of Object.entries(TOOLS)) {
                if (e.key.toLowerCase() === t.key && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault()
                    this._selectTool(key)
                    return
                }
            }

            // Bracket keys for brush size
            if (e.key === '[') {
                e.preventDefault()
                this.values.brushSize = Math.max(1, this.values.brushSize - (e.shiftKey ? 5 : 1))
                this.elements.brushSizeControl.value = this.values.brushSize
                return
            }
            if (e.key === ']') {
                e.preventDefault()
                this.values.brushSize = Math.min(200, this.values.brushSize + (e.shiftKey ? 5 : 1))
                this.elements.brushSizeControl.value = this.values.brushSize
                return
            }

        })
    },

    // --- Coordinate helpers ---

    _canvasCoords(e) {
        const canvas = this.elements.drawingCanvas
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height
        return [
            (e.clientX - rect.left) * scaleX,
            (e.clientY - rect.top) * scaleY
        ]
    },

    // --- Drawing primitives ---

    _configureBrush(ctx) {
        const tool = this.values.tool

        if (tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out'
            ctx.strokeStyle = 'rgba(0,0,0,1)'
            ctx.fillStyle = 'rgba(0,0,0,1)'
        } else {
            ctx.globalCompositeOperation = 'source-over'
            ctx.strokeStyle = this.values.brushColor
            ctx.fillStyle = this.values.brushColor
        }

        ctx.lineWidth = this.values.brushSize
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
    },

    _resetCtx(ctx) {
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1.0
    },

    _drawStroke(x1, y1, x2, y2) {
        const ctx = this.runtimeState.ctx
        const transforms = this._getSymmetryTransforms()

        this._configureBrush(ctx)

        for (const transform of transforms) {
            const [tx1, ty1] = transform(x1, y1)
            const [tx2, ty2] = transform(x2, y2)
            ctx.beginPath()
            ctx.moveTo(tx1, ty1)
            ctx.lineTo(tx2, ty2)
            ctx.stroke()
        }

        this._resetCtx(ctx)
    },

    _drawShape(x1, y1, x2, y2, isFinal) {
        const ctx = this.runtimeState.ctx
        const tool = this.values.tool
        const transforms = this._getSymmetryTransforms()

        this._configureBrush(ctx)

        if (!isFinal) {
            // Preview: slightly transparent
            ctx.globalAlpha *= 0.7
        }

        for (const transform of transforms) {
            const [tx1, ty1] = transform(x1, y1)
            const [tx2, ty2] = transform(x2, y2)

            if (tool === 'line') {
                ctx.beginPath()
                ctx.moveTo(tx1, ty1)
                ctx.lineTo(tx2, ty2)
                ctx.stroke()
            } else if (tool === 'rect') {
                ctx.strokeRect(
                    Math.min(tx1, tx2), Math.min(ty1, ty2),
                    Math.abs(tx2 - tx1), Math.abs(ty2 - ty1)
                )
            } else if (tool === 'circle') {
                const rx = Math.abs(tx2 - tx1) / 2
                const ry = Math.abs(ty2 - ty1) / 2
                const cx = (tx1 + tx2) / 2
                const cy = (ty1 + ty2) / 2
                ctx.beginPath()
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
                ctx.stroke()
            }
        }

        this._resetCtx(ctx)
    },

    // --- Flood fill ---

    _floodFill(startX, startY) {
        const canvas = this.elements.drawingCanvas
        const ctx = this.runtimeState.ctx
        const w = canvas.width
        const h = canvas.height

        if (startX < 0 || startX >= w || startY < 0 || startY >= h) return

        const imageData = ctx.getImageData(0, 0, w, h)
        const data = imageData.data

        // Parse fill color
        const rgba = hexToRgba(this.values.brushColor)
        if (!rgba) return
        const fillR = rgba.r
        const fillG = rgba.g
        const fillB = rgba.b
        const fillA = Math.round(rgba.a * 255)

        // Target color at click point
        const startIdx = (startY * w + startX) * 4
        const targetR = data[startIdx]
        const targetG = data[startIdx + 1]
        const targetB = data[startIdx + 2]
        const targetA = data[startIdx + 3]

        // Don't fill if already the same color
        if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return

        const tolerance = 20

        const match = (idx) => {
            return Math.abs(data[idx] - targetR) <= tolerance &&
                   Math.abs(data[idx + 1] - targetG) <= tolerance &&
                   Math.abs(data[idx + 2] - targetB) <= tolerance &&
                   Math.abs(data[idx + 3] - targetA) <= tolerance
        }

        // Scanline fill with flat typed-array stack (no per-push array allocation)
        const totalPixels = w * h
        const stackX = new Int32Array(totalPixels)
        const stackY = new Int32Array(totalPixels)
        let stackPtr = 0
        stackX[stackPtr] = startX
        stackY[stackPtr] = startY
        stackPtr++

        const visited = new Uint8Array(totalPixels)

        while (stackPtr > 0) {
            stackPtr--
            const x = stackX[stackPtr]
            const y = stackY[stackPtr]
            const vIdx = y * w + x

            if (visited[vIdx]) continue
            if (!match(vIdx * 4)) continue

            // Find left edge
            let left = x
            while (left > 0 && !visited[y * w + left - 1] && match((y * w + left - 1) * 4)) {
                left--
            }

            // Fill rightward
            const yOff = y * w
            let right = left
            while (right < w && !visited[yOff + right] && match((yOff + right) * 4)) {
                const i = (yOff + right) * 4
                data[i] = fillR
                data[i + 1] = fillG
                data[i + 2] = fillB
                data[i + 3] = fillA
                visited[yOff + right] = 1
                right++
            }

            // Check rows above and below
            if (y > 0) {
                const aboveOff = (y - 1) * w
                for (let scanX = left; scanX < right; scanX++) {
                    if (!visited[aboveOff + scanX] && match((aboveOff + scanX) * 4)) {
                        stackX[stackPtr] = scanX
                        stackY[stackPtr] = y - 1
                        stackPtr++
                    }
                }
            }
            if (y < h - 1) {
                const belowOff = (y + 1) * w
                for (let scanX = left; scanX < right; scanX++) {
                    if (!visited[belowOff + scanX] && match((belowOff + scanX) * 4)) {
                        stackX[stackPtr] = scanX
                        stackY[stackPtr] = y + 1
                        stackPtr++
                    }
                }
            }
        }

        ctx.putImageData(imageData, 0, 0)
    },

    // --- Clear ---

    _clearCanvas() {
        if (!this.runtimeState.ctx) return

        this.runtimeState.ctx.fillStyle = this.values.backgroundColor
        this.runtimeState.ctx.fillRect(0, 0, this.values.canvasWidth, this.values.canvasHeight)
    }
})
