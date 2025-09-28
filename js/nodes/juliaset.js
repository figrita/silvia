import {registerNode} from '../registry.js'
import {formatFloatGLSL} from '../utils.js'

// Shader for the node's internal preview canvas
const PREVIEW_VS = `#version 300 es
precision highp float;
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const PREVIEW_FS = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_zoom;
uniform vec2 u_juliaC;
uniform int u_maxIteration;

out vec4 fragColor;

// Smooth coloring function
vec3 color(int i, vec2 z) {
    if (i == u_maxIteration) return vec3(0.0, 0.0, 0.0);
    float log_zn = log(dot(z, z)) / 2.0;
    float nu = log(log_zn / log(2.0)) / log(2.0);
    float t = float(i) + 1.0 - nu;

    t = sqrt(t / float(u_maxIteration)) * 1.5;

    vec3 col1 = vec3(0.05, 0.01, 0.1);
    vec3 col2 = vec3(0.8, 0.2, 0.9);
    vec3 col3 = vec3(0.2, 0.9, 1.0);
    vec3 col4 = vec3(1.0, 1.0, 1.0);

    if (t < 0.5) return mix(col1, col2, t * 2.0);
    if (t < 1.0) return mix(col2, col3, (t - 0.5) * 2.0);
    return mix(col3, col4, (t - 1.0));
}

void main() {
    // Map fragment coordinates to complex plane, correcting for aspect ratio
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
    vec2 z = u_center + uv / u_zoom;

    int i;
    for (i = 0; i < u_maxIteration; i++) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + u_juliaC;
        if (dot(z, z) > 16.0) break;
    }

    fragColor = vec4(color(i, z), 1.0);
}
`

registerNode({
    slug: 'juliaset',
    icon: '🌀',
    label: 'Julia Set',
    tooltip: 'Renders parametric Julia fractals. Change the C parameter to explore different Julia sets. Renders as a gradient, or use as a texture mapping effect in map mode.',

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'foreground': {
            label: 'Foreground',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'background': {
            label: 'Background',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'centerX': {
            label: 'Center X',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.001, unit: '⬓'}
        },
        'centerY': {
            label: 'Center Y',
            type: 'float',
            control: {default: 0.0, min: -2.0, max: 2.0, step: 0.001, unit: '⬓'}
        },
        'zoom': {
            label: 'Zoom',
            type: 'float',
            control: {default: 1.0, min: 0.01, max: 100000.0, step: 0.01}
        },
        'cReal': {
            label: 'C Real',
            type: 'float',
            control: {default: -0.7, min: -2.0, max: 2.0, step: 0.001, unit: '⬓'}
        },
        'cImag': {
            label: 'C Imaginary',
            type: 'float',
            control: {default: 0.27015, min: -2.0, max: 2.0, step: 0.001, unit: '⬓'}
        },
        'iterations': {
            label: 'Iterations',
            type: 'float',
            control: {default: 50, min: 10, max: 500, step: 1}
        },
        'strength': {
            label: 'Map Strength',
            type: 'float',
            control: {default: 1.3, min: -5.0, max: 5.0, step: 0.01}
        },
        'timeSpeed': {
            label: 'Time Speed',
            type: 'float',
            control: {default: 0.5, min: 0.0, max: 5.0, step: 0.01}
        }
    },

    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'classic',
            choices: [
                {value: 'classic', name: 'Classic'},
                {value: 'smooth', name: 'Smooth Color'},
                {value: 'map', name: 'Texture Map'}
            ]
        }
    },

    output: {
        'color': {
            label: 'Color',
            type: 'color',
            genCode(cc, funcName){
                const mode = this.getOption('mode')
                const inputColor = this.getInput('input', cc, 'finalUV')
                const foreground = this.getInput('foreground', cc)
                const background = this.getInput('background', cc)
                const centerX = this.getInput('centerX', cc)
                const centerY = this.getInput('centerY', cc)
                const zoom = this.getInput('zoom', cc)
                const cReal = this.getInput('cReal', cc)
                const cImag = this.getInput('cImag', cc)
                const iterations = this.getInput('iterations', cc)
                const strength = this.getInput('strength', cc)
                const timeMult = this.getInput('timeSpeed', cc)

                if (mode === 'map') {
                    const escapeRadius = '10000.0'
                    return `vec4 ${funcName}(vec2 uv) {
    vec2 center = vec2(${centerX}, ${centerY});
    vec2 z = center + (uv) / ${zoom};
    vec2 c = vec2(${cReal}, ${cImag});

    int maxIter = int(${iterations});
    int i;
    for (i = 0; i < maxIter; i++) {
        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
        if (dot(z,z) > ${escapeRadius}) break;
    }

    vec2 finalUV;
    if (i < maxIter) {
        float tu = mod(atan(z.y, z.x)/(2.0*PI) + u_time * ${timeMult}, 1.0);
        float tv = log2(log(dot(z,z))/log(${escapeRadius}));
        float isOddIteration = mod(float(i), 2.0);
        float flipped_tv = mix(tv, 1.0 - tv, isOddIteration);
        finalUV = vec2(tu, flipped_tv);
    } else {
        finalUV = uv + z * ${strength};
    }

    return ${inputColor};
}`
                } else if (mode === 'smooth') {
                    return `vec4 ${funcName}(vec2 uv) {
    vec2 center = vec2(${centerX}, ${centerY});
    vec2 z = center + (uv) / ${zoom};
    vec2 c = vec2(${cReal}, ${cImag});

    int maxIter = int(${iterations});
    int i;
    for (i = 0; i < maxIter; i++) {
        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
        if (dot(z,z) > 16.0) break;
    }

    vec3 col;
    if (i == maxIter) {
        col = vec3(0.0);
    } else {
        float log_zn = log(dot(z, z)) / 2.0;
        float nu = log(log_zn / log(2.0)) / log(2.0);
        float t = float(i) + 1.0 - nu;
        t = sqrt(t / float(maxIter)) * 1.5;

        vec3 col1 = vec3(0.05, 0.01, 0.1);
        vec3 col2 = vec3(0.8, 0.2, 0.9);
        vec3 col3 = vec3(0.2, 0.9, 1.0);
        vec3 col4 = vec3(1.0, 1.0, 1.0);

        if (t < 0.5) col = mix(col1, col2, t * 2.0);
        else if (t < 1.0) col = mix(col2, col3, (t - 0.5) * 2.0);
        else col = mix(col3, col4, (t - 1.0));
    }

    return vec4(col, 1.0);
}`
                } else {
                    return `vec4 ${funcName}(vec2 uv) {
    vec2 center = vec2(${centerX}, ${centerY});
    vec2 z = center + (uv) / ${zoom};
    vec2 c = vec2(${cReal}, ${cImag});

    int maxIter = int(${iterations});

    for (int i = 0; i < maxIter; i++) {
        if (length(z) > 2.0) {
            float t = float(i) / float(maxIter);
            return mix(${background}, ${foreground}, t);
        }
        float temp = z.x * z.x - z.y * z.y + c.x;
        z.y = 2.0 * z.x * z.y + c.y;
        z.x = temp;
    }

    return ${background};
}`
                }
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                const centerX = this.getInput('centerX', cc)
                const centerY = this.getInput('centerY', cc)
                const zoom = this.getInput('zoom', cc)
                const cReal = this.getInput('cReal', cc)
                const cImag = this.getInput('cImag', cc)
                const iterations = this.getInput('iterations', cc)

                return `float ${funcName}(vec2 uv) {
    vec2 center = vec2(${centerX}, ${centerY});
    vec2 z = center + (uv - 0.5) / ${zoom};
    vec2 c = vec2(${cReal}, ${cImag});

    int maxIter = int(${iterations});

    for (int i = 0; i < maxIter; i++) {
        if (length(z) > 2.0) {
            return float(i) / float(maxIter);
        }
        float temp = z.x * z.x - z.y * z.y + c.x;
        z.y = 2.0 * z.x * z.y + c.y;
        z.x = temp;
    }

    return 0.0;
}`
            }
        }
    },

    elements: {
        centerX: null,
        centerY: null,
        zoom: null,
        cReal: null,
        cImag: null,
        previewCanvas: null
    },
    values: {
        centerX: 0.0,
        centerY: 0.0,
        zoom: 1.0,
        cReal: -0.7,
        cImag: 0.27015
    },
    runtimeState: {
        previewGL: null,
        previewProgram: null,
        uniformLocations: {},
        isPanning: false,
        panStart: {x: 0, y: 0, centerX: 0, centerY: 0},
        isUpdatingControls: false
    },

    onCreate(){
        if(!this.customArea){return}

        this.elements.centerX = this.nodeEl.querySelector('[data-input-el="centerX"]')
        this.elements.centerY = this.nodeEl.querySelector('[data-input-el="centerY"]')
        this.elements.zoom = this.nodeEl.querySelector('[data-input-el="zoom"]')
        this.elements.cReal = this.nodeEl.querySelector('[data-input-el="cReal"]')
        this.elements.cImag = this.nodeEl.querySelector('[data-input-el="cImag"]')

        // Initialize values from current control values
        if(this.elements.centerX) this.values.centerX = parseFloat(this.elements.centerX.value)
        if(this.elements.centerY) this.values.centerY = parseFloat(this.elements.centerY.value)
        if(this.elements.zoom) this.values.zoom = parseFloat(this.elements.zoom.value)
        if(this.elements.cReal) this.values.cReal = parseFloat(this.elements.cReal.value)
        if(this.elements.cImag) this.values.cImag = parseFloat(this.elements.cImag.value)

        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = 240
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        canvas.style.display = 'block'
        canvas.style.marginTop = '0.5rem'
        canvas.style.cursor = 'grab'
        canvas.tabIndex = 0  // Make canvas focusable
        canvas.style.outline = 'none'  // Remove default focus outline
        canvas.style.transition = 'box-shadow 0.2s ease'
        this.customArea.appendChild(canvas)
        this.elements.previewCanvas = canvas

        if(!this._initPreviewWebGL(canvas)){return}

        canvas.addEventListener('pointerdown', this._handlePanStart.bind(this))
        canvas.addEventListener('pointermove', this._handlePanMove.bind(this))
        canvas.addEventListener('pointerup', this._handlePanEnd.bind(this))
        canvas.addEventListener('pointerleave', this._handlePanEnd.bind(this))
        canvas.addEventListener('wheel', this._handleZoom.bind(this), {passive: false})
        canvas.addEventListener('click', () => canvas.focus())  // Focus canvas on click for zoom
        canvas.addEventListener('focus', () => {
            canvas.style.boxShadow = '0 0 0 2px hsla(var(--theme-hue), var(--theme-sat-full), 50%, 0.5)'
        })
        canvas.addEventListener('blur', () => {
            canvas.style.boxShadow = 'none'
        })

        // Use 'input' event for live updates (including MIDI)
        this.elements.centerX.addEventListener('input', this._updateFromControls.bind(this))
        this.elements.centerY.addEventListener('input', this._updateFromControls.bind(this))
        this.elements.zoom.addEventListener('input', this._updateFromControls.bind(this))
        this.elements.cReal.addEventListener('input', this._updateFromControls.bind(this))
        this.elements.cImag.addEventListener('input', this._updateFromControls.bind(this))

        const iterationEl = this.nodeEl.querySelector('[data-input-el="iterations"]')
        if(iterationEl){iterationEl.addEventListener('input', () => this._renderPreview())}

        this._renderPreview()
    },

    onDestroy(){
        if(this.runtimeState.previewGL){
            this.runtimeState.previewGL.deleteProgram(this.runtimeState.previewProgram)
        }
    },

    _handlePanStart(e){
        this.runtimeState.isPanning = true
        this.elements.previewCanvas.style.cursor = 'grabbing'
        this.runtimeState.panStart.x = e.clientX
        this.runtimeState.panStart.y = e.clientY
        this.runtimeState.panStart.centerX = this.values.centerX
        this.runtimeState.panStart.centerY = this.values.centerY
    },

    _handlePanMove(e){
        if(!this.runtimeState.isPanning){return}
        const dx = e.clientX - this.runtimeState.panStart.x
        const dy = e.clientY - this.runtimeState.panStart.y

        const deltaComplexX = -dx / (this.elements.previewCanvas.height * this.values.zoom)
        const deltaComplexY = dy / (this.elements.previewCanvas.height * this.values.zoom)

        this.values.centerX = this.runtimeState.panStart.centerX + deltaComplexX
        this.values.centerY = this.runtimeState.panStart.centerY + deltaComplexY

        this._updateControlsFromValues()
        this._renderPreview()
    },

    _handlePanEnd(){
        this.runtimeState.isPanning = false
        this.elements.previewCanvas.style.cursor = 'grab'
    },

    _handleZoom(e){
        // Only handle zoom when canvas is focused
        if(document.activeElement !== this.elements.previewCanvas){
            return  // Let the event bubble up for editor scrolling
        }

        e.preventDefault()
        e.stopPropagation()
        const rect = this.elements.previewCanvas.getBoundingClientRect()
        const scroll = e.deltaY < 0 ? 1.25 : 0.8

        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        const complexMouse = this._screenToComplex(mouseX, mouseY)

        this.values.centerX = complexMouse.x - (complexMouse.x - this.values.centerX) / scroll
        this.values.centerY = complexMouse.y - (complexMouse.y - this.values.centerY) / scroll
        this.values.zoom *= scroll

        this._updateControlsFromValues()
        this._renderPreview()
    },

    _updateControlsFromValues(){
        this.runtimeState.isUpdatingControls = true
        this.elements.centerX.value = this.values.centerX.toFixed(8)
        this.elements.centerY.value = this.values.centerY.toFixed(8)
        this.elements.zoom.value = this.values.zoom.toFixed(4)
        this.elements.cReal.value = this.values.cReal.toFixed(8)
        this.elements.cImag.value = this.values.cImag.toFixed(8)
        this.runtimeState.isUpdatingControls = false
    },

    _updateFromControls(){
        if(this.runtimeState.isUpdatingControls) return
        this.values.centerX = parseFloat(this.elements.centerX.value)
        this.values.centerY = parseFloat(this.elements.centerY.value)
        this.values.zoom = parseFloat(this.elements.zoom.value)
        this.values.cReal = parseFloat(this.elements.cReal.value)
        this.values.cImag = parseFloat(this.elements.cImag.value)
        this._renderPreview()
    },

    _screenToComplex(screenX, screenY){
        const h = this.elements.previewCanvas.height
        const w = this.elements.previewCanvas.width
        const uvx = (screenX - 0.5 * w) / h
        const uvy = -(screenY - 0.5 * h) / h
        return {
            x: this.values.centerX + uvx / this.values.zoom,
            y: this.values.centerY + uvy / this.values.zoom
        }
    },

    _renderPreview(){
        if(!this.runtimeState.previewGL || !this.runtimeState.previewProgram){return}
        const gl = this.runtimeState.previewGL
        gl.useProgram(this.runtimeState.previewProgram)

        const iterEl = this.nodeEl.querySelector('[data-input-el="iterations"]')
        const maxIter = iterEl ? parseInt(iterEl.value, 10) : 50

        gl.uniform2f(this.runtimeState.uniformLocations.resolution, gl.canvas.width, gl.canvas.height)
        gl.uniform2f(this.runtimeState.uniformLocations.center, this.values.centerX, this.values.centerY)
        gl.uniform1f(this.runtimeState.uniformLocations.zoom, this.values.zoom)
        gl.uniform2f(this.runtimeState.uniformLocations.juliaC, this.values.cReal, this.values.cImag)
        gl.uniform1i(this.runtimeState.uniformLocations.maxIter, maxIter)

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },

    _initPreviewWebGL(canvas){
        const gl = canvas.getContext('webgl2', {antialias: true})
        if(!gl){return false}
        this.runtimeState.previewGL = gl
        const vs = this._createShader(gl.VERTEX_SHADER, PREVIEW_VS)
        const fs = this._createShader(gl.FRAGMENT_SHADER, PREVIEW_FS)
        this.runtimeState.previewProgram = this._createProgram(vs, fs)
        if(!this.runtimeState.previewProgram){return false}
        gl.useProgram(this.runtimeState.previewProgram)
        this.runtimeState.uniformLocations.resolution = gl.getUniformLocation(this.runtimeState.previewProgram, 'u_resolution')
        this.runtimeState.uniformLocations.center = gl.getUniformLocation(this.runtimeState.previewProgram, 'u_center')
        this.runtimeState.uniformLocations.zoom = gl.getUniformLocation(this.runtimeState.previewProgram, 'u_zoom')
        this.runtimeState.uniformLocations.juliaC = gl.getUniformLocation(this.runtimeState.previewProgram, 'u_juliaC')
        this.runtimeState.uniformLocations.maxIter = gl.getUniformLocation(this.runtimeState.previewProgram, 'u_maxIteration')
        const positionBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
        const posAttrib = gl.getAttribLocation(this.runtimeState.previewProgram, 'a_pos')
        gl.enableVertexAttribArray(posAttrib)
        gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0)
        return true
    },

    _createShader(type, source){
        const gl = this.runtimeState.previewGL
        const shader = gl.createShader(type)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
            console.error(`Julia Preview Shader Error: ${gl.getShaderInfoLog(shader)}`)
            gl.deleteShader(shader)
            return null
        }
        return shader
    },

    _createProgram(vertexShader, fragmentShader){
        const gl = this.runtimeState.previewGL
        const program = gl.createProgram()
        gl.attachShader(program, vertexShader)
        gl.attachShader(program, fragmentShader)
        gl.linkProgram(program)
        if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
            console.error(`Julia Preview Program Link Error: ${gl.getProgramInfoLog(program)}`)
            gl.deleteProgram(program)
            return null
        }
        return program
    }
})