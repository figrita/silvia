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

                let texture = textureMap.get(this)
                if(!texture){
                    texture = gl.createTexture()
                    textureMap.set(this, texture)
                }

                gl.activeTexture(gl.TEXTURE0 + textureUnit)
                gl.bindTexture(gl.TEXTURE_2D, texture)

                const width = this._getActualWidth()
                const height = this._getActualHeight()
                gl.texImage2D(
                    gl.TEXTURE_2D, 0, gl.LUMINANCE,
                    width, height, 0,
                    gl.LUMINANCE, gl.UNSIGNED_BYTE, this.runtimeState.textureData
                )

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
        autoRun: false
    },
    defaults: {
        gridScale: 4,
        initThreshold: 0.6,
        autoRun: false
    },
    runtimeState: {
        grid: [],
        textureData: null,
        isRunning: false,
        intervalId: null
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
                this._stepSimulation()
            }, 1000 / speedHz)
        }
    },

    _stepSimulation(){
        const width = this._getActualWidth()
        const height = this._getActualHeight()
        const nextGrid = Array(height).fill(null).map(() => Array(width).fill(0))
        const algorithm = this.getOption('algorithm')

        for(let y = 0; y < height; y++){
            for(let x = 0; x < width; x++){
                let liveNeighbors = 0
                for(let i = -1; i <= 1; i++){
                    for(let j = -1; j <= 1; j++){
                        if(i === 0 && j === 0){continue}
                        const nx = (x + j + width) % width
                        const ny = (y + i + height) % height
                        if(this.runtimeState.grid[ny][nx] === 1){
                            liveNeighbors++
                        }
                    }
                }

                const currentState = this.runtimeState.grid[y][x]

                if(algorithm === 'brians_brain'){
                    if(currentState === 1){nextGrid[y][x] = 2}
                    else if(currentState === 2){nextGrid[y][x] = 0}
                    else if(currentState === 0 && liveNeighbors === 2){nextGrid[y][x] = 1}
                    else {nextGrid[y][x] = 0}
                } else {
                    const rules = {
                        'life': {B: [3], S: [2, 3]},
                        'highlife': {B: [3, 6], S: [2, 3]},
                        'day_and_night': {B: [3, 6, 7, 8], S: [3, 4, 6, 7, 8]}
                    }
                    const {B, S} = rules[algorithm]
                    const wasAlive = currentState === 1

                    if(wasAlive && S.includes(liveNeighbors)){nextGrid[y][x] = 1}
                    else if(!wasAlive && B.includes(liveNeighbors)){nextGrid[y][x] = 1}
                    else {nextGrid[y][x] = 0}

                }
            }
        }
        this.runtimeState.grid = nextGrid
        this._updateTextureFromGrid()
    },

    _initGrid(){
        const width = this._getActualWidth()
        const height = this._getActualHeight()
        this.runtimeState.grid = Array(height).fill(null).map(() => Array(width).fill(0))
        this.runtimeState.textureData = new Uint8Array(width * height)
        this._randomizeGrid()
    },

    _randomizeGrid(){
        const width = this._getActualWidth()
        const height = this._getActualHeight()
        for(let y = 0; y < height; y++){
            for(let x = 0; x < width; x++){
                this.runtimeState.grid[y][x] = Math.random() > this.values.initThreshold ? 1 : 0
            }
        }
        this._updateTextureFromGrid()
    },

    _updateTextureFromGrid(){
        const width = this._getActualWidth()
        const height = this._getActualHeight()
        for(let y = 0; y < height; y++){
            for(let x = 0; x < width; x++){
                const state = this.runtimeState.grid[y][x]
                const i = (y * width + x)
                if(state === 1){this.runtimeState.textureData[i] = 255}
                else if(state === 2){this.runtimeState.textureData[i] = 128}
                else {this.runtimeState.textureData[i] = 0}
            }
        }
    },

    _createUI(){
        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
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
    }
})