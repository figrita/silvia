import {autowire, StringToFragment} from '../utils.js'
import {registerNode} from '../registry.js'

registerNode({
    slug: 'cellularautomata',
    icon: '🦠',
    label: 'Cellular Automata',
    tooltip: 'Generates complex patterns using cellular automata rules like Conway\'s Game of Life.',
    input: {
        'aliveInput': {label: 'Alive Color', type: 'color', control: {default: '#11ccffff'}},
        'deadInput': {label: 'Dead Color', type: 'color', control: {default: '#cc11ffff'}},
        'step': {label: 'Step', type: 'action', control: {}, downCallback(){this._stepSimulation()}},
        'randomize': {label: 'Randomize', type: 'action', control: {}, downCallback(){this._randomizeGrid()}}
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            // The GLSL code mixes between the two color inputs based on the mask from our texture.
            genCode(cc, funcName, uniformName){
                const aliveColor = this.getInput('aliveInput', cc) || 'vec4(1.0, 1.0, 1.0, 1.0)'
                const deadColor = this.getInput('deadInput', cc) || 'vec4(0.0, 0.0, 0.0, 1.0)'

                return `vec4 ${funcName}(vec2 uv) {
                    // Sample mask value from generated texture (red channel for grayscale)
                    float state = texture(${uniformName}, uv).r;
                    
                    // Mix between the two input colors.
                    return mix(${deadColor}, ${aliveColor}, state);
                }`
            },
            // This now uploads a single-channel (LUMINANCE) texture.
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
                if(this.isDestroyed || !this.runtimeState.textureData){return}

                let entry = textureMap.get(this)
                if(!entry){
                    const tex = gl.createTexture()
                    entry = {tex, w: 0, h: 0}
                    textureMap.set(this, entry)
                }

                gl.activeTexture(gl.TEXTURE0 + textureUnit)
                gl.bindTexture(gl.TEXTURE_2D, entry.tex)

                const width = this._getActualWidth()
                const height = this._getActualHeight()
                if(entry.w === width && entry.h === height){
                    gl.texSubImage2D(
                        gl.TEXTURE_2D, 0, 0, 0,
                        width, height,
                        gl.LUMINANCE, gl.UNSIGNED_BYTE, this.runtimeState.textureData
                    )
                } else {
                    gl.texImage2D(
                        gl.TEXTURE_2D, 0, gl.LUMINANCE,
                        width, height, 0,
                        gl.LUMINANCE, gl.UNSIGNED_BYTE, this.runtimeState.textureData
                    )
                    entry.w = width; entry.h = height
                }

                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1i(location, textureUnit)
            }
        }
    },

    options: {
        'algorithm': {
            label: 'Algorithm',
            type: 'select',
            default: 'life',
            choices: [
                {value: 'life', name: 'Conway\'s Life (B3/S23)'},
                {value: 'highlife', name: 'HighLife (B36/S23)'},
                {value: 'day_and_night', name: 'Day & Night (B3678/S34678)'},
                {value: 'brians_brain', name: 'Brian\'s Brain (3-state)'}
            ]
        }
    },

    elements: {},
    values: {
        gridScale: 4,  // Integer multiplier, actual size = gridScale * 16
        initThreshold: 0.6,
        trailDecay: 0.05,
        stepsPerFrame: 1,
        autoRun: false
    },
    defaults: {
        gridScale: 4,
        initThreshold: 0.6,
        trailDecay: 0.05,
        stepsPerFrame: 1,
        autoRun: false
    },
    runtimeState: {
        grid: null,
        gridNext: null,
        trailMap: null,
        textureData: null,
        isRunning: false,
        intervalId: null,
        previewCtx: null,
        previewImgData: null,
        painting: false,
        paintX: 0,
        paintY: 0
    },

    onCreate(){
        if(!this.customArea){return}

        this._createUI()

        // Initialize UI controls from `values`
        this.elements.scaleControl.value = this.values.gridScale
        this.elements.thresholdControl.value = this.values.initThreshold

        this._initGrid() // Call once to set initial state

        // If auto-run is enabled on load, start the simulation
        if (this.values.autoRun && !this.runtimeState.isRunning) {
            this.runtimeState.isRunning = true
            this._startStopSimulation()
        }

        // Add listeners to update `values` and trigger simulation changes
        // Use 'input' event for live updates (including MIDI)
        this.elements.scaleControl.addEventListener('input', () => {
            const scale = parseInt(this.elements.scaleControl.value, 10)
            this.values.gridScale = scale
            this._initGrid()
        })
        this.elements.thresholdControl.addEventListener('input', () => {
            this.values.initThreshold = parseFloat(this.elements.thresholdControl.value)
            this._randomizeGrid()
        })
        this.elements.trailDecayControl.addEventListener('input', () => {
            this.values.trailDecay = parseFloat(this.elements.trailDecayControl.value)
        })
        this.elements.spfControl.addEventListener('input', () => {
            this.values.stepsPerFrame = parseInt(this.elements.spfControl.value, 10)
        })
    },

    onDestroy(){
        if(this.runtimeState.intervalId){clearInterval(this.runtimeState.intervalId)}
    },

    _getActualWidth(){
        return this.values.gridScale * 16
    },

    _getActualHeight(){
        return this.values.gridScale * 16
    },

    _startStopSimulation(){
        if(this.runtimeState.intervalId){clearInterval(this.runtimeState.intervalId)}
        if(this.runtimeState.isRunning){
            const speedHz = 30
            this.runtimeState.intervalId = setInterval(() => {
                const n = this.values.stepsPerFrame
                for(let i = 0; i < n; i++){
                    this._stepSimulation(i === n - 1)
                }
            }, 1000 / speedHz)
        }
    },

    _stepSimulation(render = true){
        const w = this._getActualWidth()
        const h = this._getActualHeight()
        const grid = this.runtimeState.grid
        const next = this.runtimeState.gridNext
        const algorithm = this.getOption('algorithm')
        const isBrians = algorithm === 'brians_brain'

        // Build birth/survive lookup tables (indexed by neighbor count 0-8)
        let birthLUT, surviveLUT
        if(!isBrians){
            birthLUT = new Uint8Array(9)
            surviveLUT = new Uint8Array(9)
            const rulesets = {
                'life': [[3], [2, 3]],
                'highlife': [[3, 6], [2, 3]],
                'day_and_night': [[3, 6, 7, 8], [3, 4, 6, 7, 8]]
            }
            const [B, S] = rulesets[algorithm]
            for(let i = 0; i < B.length; i++) birthLUT[B[i]] = 1
            for(let i = 0; i < S.length; i++) surviveLUT[S[i]] = 1
        }

        for(let y = 0; y < h; y++){
            const ym = ((y - 1) + h) % h
            const yp = (y + 1) % h
            const yOff = y * w
            const ymOff = ym * w
            const ypOff = yp * w
            for(let x = 0; x < w; x++){
                const xm = ((x - 1) + w) % w
                const xp = (x + 1) % w

                const n =
                    (grid[ymOff + xm] === 1) + (grid[ymOff + x] === 1) + (grid[ymOff + xp] === 1) +
                    (grid[yOff + xm] === 1)  +                           (grid[yOff + xp] === 1) +
                    (grid[ypOff + xm] === 1) + (grid[ypOff + x] === 1) + (grid[ypOff + xp] === 1)

                const cur = grid[yOff + x]
                const idx = yOff + x

                if(isBrians){
                    if(cur === 1) next[idx] = 2
                    else if(cur === 2) next[idx] = 0
                    else next[idx] = n === 2 ? 1 : 0
                } else {
                    if(cur === 1) next[idx] = surviveLUT[n]
                    else next[idx] = birthLUT[n]
                }
            }
        }

        // Swap buffers
        this.runtimeState.grid = next
        this.runtimeState.gridNext = grid
        if(render) this._updateTextureFromGrid()
    },

    _initGrid(){
        const width = this._getActualWidth()
        const height = this._getActualHeight()
        const size = width * height
        this.runtimeState.grid = new Uint8Array(size)
        this.runtimeState.gridNext = new Uint8Array(size)
        this.runtimeState.trailMap = new Float32Array(size)
        this.runtimeState.textureData = new Uint8Array(size)
        this._randomizeGrid()
    },

    _randomizeGrid(){
        const size = this._getActualWidth() * this._getActualHeight()
        const grid = this.runtimeState.grid
        const thresh = this.values.initThreshold
        for(let i = 0; i < size; i++){
            grid[i] = Math.random() > thresh ? 1 : 0
        }
        this.runtimeState.trailMap.fill(0)
        this._updateTextureFromGrid()
    },

    _updateTextureFromGrid(){
        const size = this._getActualWidth() * this._getActualHeight()
        const grid = this.runtimeState.grid
        const trailMap = this.runtimeState.trailMap
        const textureData = this.runtimeState.textureData
        const retain = 1.0 - this.values.trailDecay

        for(let i = 0; i < size; i++){
            const state = grid[i]
            if(state === 1) trailMap[i] = 1.0
            else if(state === 2) trailMap[i] = trailMap[i] < 0.5 ? 0.5 : trailMap[i]
            else trailMap[i] *= retain

            const v = (trailMap[i] * 255) | 0
            textureData[i] = v > 255 ? 255 : v
        }
        this._renderPreview()
    },

    _renderPreview(){
        const ctx = this.runtimeState.previewCtx
        if(!ctx) return
        const canvas = ctx.canvas
        const w = this._getActualWidth()
        const h = this._getActualHeight()
        const data = this.runtimeState.textureData
        if(!data) return

        const pw = canvas.width
        const ph = canvas.height
        if(!this.runtimeState.previewImgData || this.runtimeState.previewImgData.width !== pw){
            this.runtimeState.previewImgData = ctx.createImageData(pw, ph)
        }
        const pixels = this.runtimeState.previewImgData.data

        // Tile ~1.5 worlds, flip Y to match OpenGL
        for(let py = 0; py < ph; py++){
            const sy = (h - 1) - (Math.floor(py / ph * h * 1.5) % h)
            for(let px = 0; px < pw; px++){
                const sx = Math.floor(px / pw * w * 1.5) % w
                const v = data[sy * w + sx]
                const idx = (py * pw + px) * 4
                pixels[idx] = v
                pixels[idx + 1] = v
                pixels[idx + 2] = v
                pixels[idx + 3] = 255
            }
        }
        ctx.putImageData(this.runtimeState.previewImgData, 0, 0)
    },

    _sprayAt(canvasX, canvasY){
        const canvas = this.runtimeState.previewCtx.canvas
        const w = this._getActualWidth()
        const h = this._getActualHeight()
        const simX = Math.floor((canvasX / canvas.clientWidth) * w * 1.5) % w
        const simY = (h - 1) - (Math.floor((canvasY / canvas.clientHeight) * h * 1.5) % h)
        const radius = Math.max(w, h) * 0.1
        const grid = this.runtimeState.grid

        for(let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy++){
            for(let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++){
                if(dx * dx + dy * dy > radius * radius) continue
                if(Math.random() > 0.5) continue
                const gx = ((simX + dx) % w + w) % w
                const gy = ((simY + dy) % h + h) % h
                grid[gy * w + gx] = 1
            }
        }
        this._updateTextureFromGrid()
        this._renderPreview()
    },

    _createUI(){
        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <canvas data-el="previewCanvas" width="300" height="300" style="width:300px; height:300px; display:block; margin:0 auto; cursor:crosshair; image-rendering:pixelated;"></canvas>
                <div class="checkbox-group" style="margin:0;">
                    <label>
                        <input type="checkbox" data-el="runCheckbox">
                        <span>Auto-Run</span>
                    </label>
                </div>
                <hr style="margin: 0.2rem 0; border-top-color: #9994;" />
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label for="ca-scale" style="font-size:0.9rem; color:#ccc;">Grid Scale (×16)</label>
                    <s-number midi-disabled id="ca-scale" value="${this.values.gridScale}" default="${this.defaults.gridScale}" min="1" max="16" step="1" data-el="scaleControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label for="ca-threshold" style="font-size:0.9rem; color:#ccc;">Init Threshold</label>
                    <s-number id="ca-threshold" value="${this.values.initThreshold}" default="${this.defaults.initThreshold}" min="0.0" max="1.0" step="0.01" data-el="thresholdControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Trail Decay</label>
                    <s-number value="${this.values.trailDecay}" default="${this.defaults.trailDecay}" min="0.001" max="1.0" step="0.005" data-el="trailDecayControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Steps/Frame</label>
                    <s-number midi-disabled value="${this.values.stepsPerFrame}" default="${this.defaults.stepsPerFrame}" min="1" max="20" step="1" data-el="spfControl"></s-number>
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)

        // Set initial checkbox state from persistent values
        this.elements.runCheckbox.checked = this.values.autoRun

        this.elements.runCheckbox.addEventListener('change', (e) => {
            this.values.autoRun = e.target.checked  // Persist the state
            this.runtimeState.isRunning = e.target.checked
            this._startStopSimulation()
        })

        this.customArea.appendChild(fragment)

        // Set up preview canvas with spray-can drawing
        const previewCanvas = this.elements.previewCanvas
        this.runtimeState.previewCtx = previewCanvas.getContext('2d')

        previewCanvas.addEventListener('pointerdown', (e) => {
            this.runtimeState.painting = true
            previewCanvas.setPointerCapture(e.pointerId)
            const rect = previewCanvas.getBoundingClientRect()
            this._sprayAt(e.clientX - rect.left, e.clientY - rect.top)
        })
        previewCanvas.addEventListener('pointermove', (e) => {
            if(!this.runtimeState.painting) return
            const rect = previewCanvas.getBoundingClientRect()
            this._sprayAt(e.clientX - rect.left, e.clientY - rect.top)
        })
        previewCanvas.addEventListener('pointerup', () => {
            this.runtimeState.painting = false
        })
        previewCanvas.addEventListener('pointerleave', () => {
            this.runtimeState.painting = false
        })

        this._renderPreview()
    }
})