import {autowire, StringToFragment} from '../utils.js'
import {registerNode} from '../registry.js'
import {SNode} from '../snode.js'

registerNode({
    slug: 'slimemold',
    icon: '🧫',
    label: 'Slime Mold',
    tooltip: 'Simulates Physarum slime mold (Jones, 2010). Thousands of agents wander a grid, each sniffing for scent trails with 3 forward sensors. They turn toward the strongest scent (Attract) or away from it (Repel), drop scent when they move, and the scent slowly diffuses and fades. Networks, veins, spots, and stripes emerge from just these rules. Sensor Angle = how wide the sensors spread. Rotation Angle = how sharply agents turn. Sensor Offset = how far ahead they sense (pattern scale). Trail Decay = how fast scent fades. Based on "Characteristics of Pattern Formation and Evolution in Approximations of Physarum Transport Networks" by Jeff Jones, Artificial Life 16(2), 2010.',

    input: {
        'trailColor': {label: 'Trail Color', type: 'color', control: {default: '#ffcc11ff'}},
        'bgColor': {label: 'Background', type: 'color', control: {default: '#0a0a1aff'}},
        'randomSensors': {label: 'Random Sensors', type: 'action', control: {}, downCallback(){this._randomizeParams()}},
        'scatter': {label: 'Scatter', type: 'action', control: {}, downCallback(){this._scatterAgents()}},
        'clearTrails': {label: 'Clear Trails', type: 'action', control: {}, downCallback(){
            this.runtimeState.trailMap.fill(0)
            this._updateTexture()
        }}
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName){
                const trailColor = this.getInput('trailColor', cc)
                const bgColor = this.getInput('bgColor', cc)

                return `vec4 ${funcName}(vec2 uv) {
    float trail = texture(${uniformName}, uv).r;
    return mix(${bgColor}, ${trailColor}, trail);
}`
            },
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

                const width = this._getWidth()
                const height = this._getHeight()
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
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1i(location, textureUnit)
            }
        },
        'density': {
            label: 'Density',
            type: 'float',
            genCode(cc, funcName, uniformName){
                // Reuse the same texture uniform from the color output
                const texSlug = this.slug
                const texId = this.id
                const texUniform = `u_texture_${texSlug}${texId}_output`
                if(!cc.uniforms.has(texUniform)){
                    cc.uniforms.set(texUniform, {
                        type: 'sampler2D',
                        sourcePort: this.output.output
                    })
                }

                const scale = this.values.densityScale.toFixed(4)
                return `float ${funcName}(vec2 uv) {
    return texture(${texUniform}, uv).r * ${scale};
}`
            }
        }
    },

    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'attract',
            choices: [
                {value: 'attract', name: 'Attract'},
                {value: 'repel', name: 'Repel'}
            ]
        }
    },

    elements: {},
    values: {
        gridScale: 8,
        populationPct: 12,
        sensorAngle: 22.5,
        rotationAngle: 45,
        sensorOffset: 9,
        decay: 0.05,
        jitter: 0.02,
        stepsPerFrame: 3,
        pushStrength: 3.0,
        densityScale: 5.0,
    },
    defaults: {
        gridScale: 8,
        populationPct: 12,
        sensorAngle: 22.5,
        rotationAngle: 45,
        sensorOffset: 9,
        decay: 0.05,
        jitter: 0.02,
        stepsPerFrame: 3,
        pushStrength: 3.0,
        densityScale: 5.0
    },
    runtimeState: {
        agentX: null,
        agentY: null,
        agentAngle: null,
        agentCount: 0,
        trailMap: null,
        trailMapTemp: null,
        textureData: null,
        isRunning: false,
        intervalId: null,
        previewCtx: null,
        pushing: false,
        pushX: 0,
        pushY: 0,
        trailMax: 20
    },

    onCreate(){
        if(!this.customArea){return}
        this._createUI()

        this.elements.scaleControl.value = this.values.gridScale
        this.elements.populationControl.value = this.values.populationPct
        this.elements.saControl.value = this.values.sensorAngle
        this.elements.raControl.value = this.values.rotationAngle
        this.elements.soControl.value = this.values.sensorOffset
        this.elements.decayControl.value = this.values.decay
        this.elements.jitterControl.value = this.values.jitter
        this.elements.spfControl.value = this.values.stepsPerFrame
        this.elements.pushControl.value = this.values.pushStrength
        this.elements.densityScaleControl.value = this.values.densityScale

        this._initSimulation()
        this.runtimeState.isRunning = true
        this._startStopSimulation()

        this.elements.scaleControl.addEventListener('input', () => {
            const oldScale = this.values.gridScale
            this.values.gridScale = parseInt(this.elements.scaleControl.value, 10)
            this._rescaleGrid(oldScale)
        })
        this.elements.populationControl.addEventListener('input', () => {
            this.values.populationPct = parseFloat(this.elements.populationControl.value)
            this._adjustPopulation()
        })
        this.elements.saControl.addEventListener('input', () => {
            this.values.sensorAngle = parseFloat(this.elements.saControl.value)
        })
        this.elements.raControl.addEventListener('input', () => {
            this.values.rotationAngle = parseFloat(this.elements.raControl.value)
        })
        this.elements.soControl.addEventListener('input', () => {
            this.values.sensorOffset = parseFloat(this.elements.soControl.value)
        })
        this.elements.decayControl.addEventListener('input', () => {
            this.values.decay = parseFloat(this.elements.decayControl.value)
        })
        this.elements.jitterControl.addEventListener('input', () => {
            this.values.jitter = parseFloat(this.elements.jitterControl.value)
        })
        this.elements.spfControl.addEventListener('input', () => {
            this.values.stepsPerFrame = parseInt(this.elements.spfControl.value, 10)
        })
        this.elements.pushControl.addEventListener('input', () => {
            this.values.pushStrength = parseFloat(this.elements.pushControl.value)
        })
        this.elements.densityScaleControl.addEventListener('input', () => {
            this.values.densityScale = parseFloat(this.elements.densityScaleControl.value)
            SNode.refreshDownstreamOutputs(this)
        })
    },

    onDestroy(){
        if(this.runtimeState.intervalId){clearInterval(this.runtimeState.intervalId)}
    },

    _getWidth(){ return this.values.gridScale * 16 },
    _getHeight(){ return this.values.gridScale * 16 },

    _startStopSimulation(){
        if(this.runtimeState.intervalId){clearInterval(this.runtimeState.intervalId)}
        if(this.runtimeState.isRunning){
            this.runtimeState.intervalId = setInterval(() => {
                const n = this.values.stepsPerFrame
                for(let i = 0; i < n; i++){
                    this._stepSimulation(i === n - 1)
                }
            }, 1000 / 30)
        }
    },

    _initSimulation(){
        const w = this._getWidth()
        const h = this._getHeight()
        this.runtimeState.trailMap = new Float32Array(w * h)
        this.runtimeState.trailMapTemp = new Float32Array(w * h)
        this.runtimeState.textureData = new Uint8Array(w * h)

        const totalCells = w * h
        const numAgents = Math.floor(totalCells * this.values.populationPct / 100)

        // Struct-of-arrays: flat typed arrays for cache-friendly access
        const maxAgents = Math.ceil(totalCells * 0.40) // 40% max population
        this.runtimeState.agentX = new Float32Array(maxAgents)
        this.runtimeState.agentY = new Float32Array(maxAgents)
        this.runtimeState.agentAngle = new Float32Array(maxAgents)
        this.runtimeState.agentCount = numAgents

        const ax = this.runtimeState.agentX
        const ay = this.runtimeState.agentY
        const aa = this.runtimeState.agentAngle
        const TWO_PI = Math.PI * 2
        for(let i = 0; i < numAgents; i++){
            ax[i] = Math.random() * w
            ay[i] = Math.random() * h
            aa[i] = Math.random() * TWO_PI
        }

        this._updateTexture()
    },

    _rescaleGrid(oldScale){
        const oldW = oldScale * 16
        const oldH = oldScale * 16
        const newW = this._getWidth()
        const newH = this._getHeight()
        const oldTrail = this.runtimeState.trailMap
        const ratio = newW / oldW

        // Resample trail map (nearest-neighbor)
        const newTrail = new Float32Array(newW * newH)
        for(let y = 0; y < newH; y++){
            const srcY = Math.min(Math.floor(y / ratio), oldH - 1)
            const srcYOff = srcY * oldW
            const dstYOff = y * newW
            for(let x = 0; x < newW; x++){
                const srcX = Math.min(Math.floor(x / ratio), oldW - 1)
                newTrail[dstYOff + x] = oldTrail[srcYOff + srcX]
            }
        }

        this.runtimeState.trailMap = newTrail
        this.runtimeState.trailMapTemp = new Float32Array(newW * newH)
        this.runtimeState.textureData = new Uint8Array(newW * newH)

        // Reallocate agent arrays for new max population
        const newMax = Math.ceil(newW * newH * 0.40)
        const copyCount = Math.min(this.runtimeState.agentCount, newMax)
        const oldX = this.runtimeState.agentX
        const oldY = this.runtimeState.agentY
        const oldA = this.runtimeState.agentAngle
        const newAX = new Float32Array(newMax)
        const newAY = new Float32Array(newMax)
        const newAA = new Float32Array(newMax)
        for(let i = 0; i < copyCount; i++){
            newAX[i] = oldX[i] * ratio
            newAY[i] = oldY[i] * ratio
            newAA[i] = oldA[i]
        }
        this.runtimeState.agentX = newAX
        this.runtimeState.agentY = newAY
        this.runtimeState.agentAngle = newAA
        this.runtimeState.agentCount = copyCount

        // Rebalance population for the new grid size
        this._adjustPopulation()
        this._updateTexture()
    },

    _scatterAgents(){
        const w = this._getWidth()
        const h = this._getHeight()
        const ax = this.runtimeState.agentX
        const ay = this.runtimeState.agentY
        const aa = this.runtimeState.agentAngle
        const count = this.runtimeState.agentCount
        const TWO_PI = Math.PI * 2
        for(let i = 0; i < count; i++){
            ax[i] = Math.random() * w
            ay[i] = Math.random() * h
            aa[i] = Math.random() * TWO_PI
        }
    },

    _randomizeParams(){
        this.values.sensorAngle = 1 + Math.random() * 179
        this.values.rotationAngle = 1 + Math.random() * 179
        this.values.sensorOffset = 1 + Math.floor(Math.random() * 39)

        this.elements.saControl.value = this.values.sensorAngle
        this.elements.raControl.value = this.values.rotationAngle
        this.elements.soControl.value = this.values.sensorOffset
    },

    _adjustPopulation(){
        const w = this._getWidth()
        const h = this._getHeight()
        const totalCells = w * h
        const targetCount = Math.floor(totalCells * this.values.populationPct / 100)
        const count = this.runtimeState.agentCount
        const ax = this.runtimeState.agentX
        const ay = this.runtimeState.agentY
        const aa = this.runtimeState.agentAngle

        if(targetCount > count){
            const TWO_PI = Math.PI * 2
            for(let i = count; i < targetCount; i++){
                ax[i] = Math.random() * w
                ay[i] = Math.random() * h
                aa[i] = Math.random() * TWO_PI
            }
        }
        // Shrinking just lowers the count — no deallocation needed
        this.runtimeState.agentCount = targetCount
    },

    _stepSimulation(render = true){
        const w = this._getWidth()
        const h = this._getHeight()
        const count = this.runtimeState.agentCount
        const ax = this.runtimeState.agentX
        const ay = this.runtimeState.agentY
        const aa = this.runtimeState.agentAngle
        const trailMap = this.runtimeState.trailMap
        const isRepel = this.getOption('mode') === 'repel'

        const SA = this.values.sensorAngle * Math.PI / 180
        const RA = this.values.rotationAngle * Math.PI / 180
        const SO = this.values.sensorOffset
        const decayT = this.values.decay
        const jitter = this.values.jitter
        const depT = 5.0
        const TWO_PI = Math.PI * 2

        // Precompute sensor angle trig for angle addition identities
        const cosSA = Math.cos(SA)
        const sinSA = Math.sin(SA)

        // Motor stage: every agent moves forward and deposits trail
        for(let i = 0; i < count; i++){
            if(Math.random() < jitter){
                aa[i] = Math.random() * TWO_PI
            }
            let nx = ax[i] + Math.cos(aa[i])
            let ny = ay[i] + Math.sin(aa[i])
            // Branchless-style wrapping (if-branches faster than double modulo)
            if(nx < 0) nx += w; else if(nx >= w) nx -= w
            if(ny < 0) ny += h; else if(ny >= h) ny -= h
            ax[i] = nx
            ay[i] = ny

            trailMap[(ny | 0) * w + (nx | 0)] += depT
        }

        // Sensory stage: sniff and turn
        // Uses angle addition identities to avoid 4 extra trig calls per agent:
        //   cos(A ± SA) = cosA·cosSA ∓ sinA·sinSA
        //   sin(A ± SA) = sinA·cosSA ± cosA·sinSA
        for(let i = 0; i < count; i++){
            const cosA = Math.cos(aa[i])
            const sinA = Math.sin(aa[i])

            // Forward sensor
            let sx = ax[i] + cosA * SO
            let sy = ay[i] + sinA * SO
            let gx = ((sx | 0) % w + w) % w
            let gy = ((sy | 0) % h + h) % h
            const F = trailMap[gy * w + gx]

            // Left sensor: angle + SA
            const cosL = cosA * cosSA - sinA * sinSA
            const sinL = sinA * cosSA + cosA * sinSA
            sx = ax[i] + cosL * SO
            sy = ay[i] + sinL * SO
            gx = ((sx | 0) % w + w) % w
            gy = ((sy | 0) % h + h) % h
            const FL = trailMap[gy * w + gx]

            // Right sensor: angle - SA
            const cosR = cosA * cosSA + sinA * sinSA
            const sinR = sinA * cosSA - cosA * sinSA
            sx = ax[i] + cosR * SO
            sy = ay[i] + sinR * SO
            gx = ((sx | 0) % w + w) % w
            gy = ((sy | 0) % h + h) % h
            const FR = trailMap[gy * w + gx]

            if(isRepel){
                if(F < FL && F < FR){
                    // Forward weakest -- keep going
                } else if(F > FL && F > FR){
                    aa[i] += (Math.random() < 0.5 ? RA : -RA)
                } else if(FL > FR){
                    aa[i] -= RA
                } else if(FR > FL){
                    aa[i] += RA
                }
            } else {
                if(F > FL && F > FR){
                    // Forward strongest -- keep going
                } else if(F < FL && F < FR){
                    aa[i] += (Math.random() < 0.5 ? RA : -RA)
                } else if(FL < FR){
                    aa[i] -= RA
                } else if(FR < FL){
                    aa[i] += RA
                }
            }
        }

        // Push agents if pointer is held
        this._applyPush()

        // Diffusion: 3x3 mean filter with decay (periodic boundary)
        this._diffuseTrail(w, h, decayT)

        if(render) this._updateTexture()
    },

    _diffuseTrail(w, h, decayT){
        const src = this.runtimeState.trailMap
        const dst = this.runtimeState.trailMapTemp
        const retain = (1.0 - decayT) / 9.0 // combine division and decay into one multiply

        for(let y = 0; y < h; y++){
            const ymOff = ((y - 1 + h) % h) * w
            const yOff  = y * w
            const ypOff = ((y + 1) % h) * w
            for(let x = 0; x < w; x++){
                const xm = x > 0 ? x - 1 : w - 1
                const xp = x < w - 1 ? x + 1 : 0
                dst[yOff + x] = (
                    src[ymOff + xm] + src[ymOff + x] + src[ymOff + xp] +
                    src[yOff  + xm] + src[yOff  + x] + src[yOff  + xp] +
                    src[ypOff + xm] + src[ypOff + x] + src[ypOff + xp]
                ) * retain
            }
        }

        this.runtimeState.trailMap = dst
        this.runtimeState.trailMapTemp = src
    },

    _updateTexture(){
        const trailMap = this.runtimeState.trailMap
        const textureData = this.runtimeState.textureData
        const len = trailMap.length

        // Find current max and smooth toward it to avoid flicker
        let curMax = 0
        for(let i = 0; i < len; i++){
            if(trailMap[i] > curMax) curMax = trailMap[i]
        }
        if(curMax < 1) curMax = 1
        // Smooth: rise fast, fall slow
        const prevMax = this.runtimeState.trailMax
        this.runtimeState.trailMax = curMax > prevMax
            ? prevMax + (curMax - prevMax) * 0.3
            : prevMax + (curMax - prevMax) * 0.02

        const scale = 255 / this.runtimeState.trailMax
        for(let i = 0; i < len; i++){
            const v = (trailMap[i] * scale) | 0
            textureData[i] = v > 255 ? 255 : v
        }

        this._renderPreview()
    },

    _renderPreview(){
        const ctx = this.runtimeState.previewCtx
        if(!ctx) return
        const canvas = ctx.canvas
        const w = this._getWidth()
        const h = this._getHeight()
        const data = this.runtimeState.textureData
        if(!data) return

        const pw = canvas.width
        const ph = canvas.height
        if(!this.runtimeState.previewImgData || this.runtimeState.previewImgData.width !== pw){
            this.runtimeState.previewImgData = ctx.createImageData(pw, ph)
        }
        const pixels = this.runtimeState.previewImgData.data

        // Tile the sim texture across the fixed canvas (~1.5 worlds)
        // Flip Y to match OpenGL texture orientation (y=0 at bottom)
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

    _applyPush(){
        if(!this.runtimeState.pushing) return
        const w = this._getWidth()
        const h = this._getHeight()
        const px = this.runtimeState.pushX
        const py = this.runtimeState.pushY
        const radius = Math.max(w, h) * 0.25
        const radiusSq = radius * radius
        const axArr = this.runtimeState.agentX
        const ayArr = this.runtimeState.agentY
        const aaArr = this.runtimeState.agentAngle
        const count = this.runtimeState.agentCount
        const strength = this.values.pushStrength
        const halfW = w * 0.5
        const halfH = h * 0.5

        for(let i = 0; i < count; i++){
            let dx = axArr[i] - px
            let dy = ayArr[i] - py
            if(dx > halfW) dx -= w
            else if(dx < -halfW) dx += w
            if(dy > halfH) dy -= h
            else if(dy < -halfH) dy += h
            const distSq = dx * dx + dy * dy
            if(distSq < radiusSq){
                const dist = Math.sqrt(distSq) + 0.001
                const force = (1.0 - dist / radius) * strength
                let nx = axArr[i] + dx / dist * force
                let ny = ayArr[i] + dy / dist * force
                if(nx < 0) nx += w; else if(nx >= w) nx -= w
                if(ny < 0) ny += h; else if(ny >= h) ny -= h
                axArr[i] = nx
                ayArr[i] = ny
                aaArr[i] = Math.atan2(dy, dx)
            }
        }
    },

    _createUI(){
        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <canvas data-el="previewCanvas" width="300" height="300" style="width:300px; height:300px; display:block; margin:0 auto; cursor:crosshair; image-rendering:pixelated;"></canvas>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Sensor Angle</label>
                    <s-number value="${this.values.sensorAngle}" default="${this.defaults.sensorAngle}" min="1" max="180" step="0.5" data-el="saControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Rotation Angle</label>
                    <s-number value="${this.values.rotationAngle}" default="${this.defaults.rotationAngle}" min="1" max="180" step="0.5" data-el="raControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Sensor Offset</label>
                    <s-number value="${this.values.sensorOffset}" default="${this.defaults.sensorOffset}" min="1" max="40" step="1" data-el="soControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Trail Decay</label>
                    <s-number value="${this.values.decay}" default="${this.defaults.decay}" min="0.001" max="0.5" step="0.001" data-el="decayControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Jitter</label>
                    <s-number value="${this.values.jitter}" default="${this.defaults.jitter}" min="0" max="0.5" step="0.005" data-el="jitterControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Density Scale</label>
                    <s-number value="${this.values.densityScale}" default="${this.defaults.densityScale}" min="0.1" max="100" step="0.5" data-el="densityScaleControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Push Strength</label>
                    <s-number value="${this.values.pushStrength}" default="${this.defaults.pushStrength}" min="0" max="20" step="0.5" data-el="pushControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Steps/Frame</label>
                    <s-number midi-disabled value="${this.values.stepsPerFrame}" default="${this.defaults.stepsPerFrame}" min="1" max="20" step="1" data-el="spfControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Grid Scale (\u00d716)</label>
                    <s-number midi-disabled value="${this.values.gridScale}" default="${this.defaults.gridScale}" min="2" max="16" step="1" data-el="scaleControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Population %</label>
                    <s-number midi-disabled value="${this.values.populationPct}" default="${this.defaults.populationPct}" min="1" max="40" step="1" data-el="populationControl"></s-number>
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)

        this.customArea.appendChild(fragment)

        // Set up preview canvas
        const previewCanvas = this.elements.previewCanvas
        this.runtimeState.previewCtx = previewCanvas.getContext('2d')

        const getSimCoords = (e) => {
            const rect = previewCanvas.getBoundingClientRect()
            const cx = e.clientX - rect.left
            const cy = e.clientY - rect.top
            const w = this._getWidth()
            const h = this._getHeight()
            // Must match _renderPreview: scale & wrap first, then flip Y
            return {
                x: ((cx / rect.width) * w * 1.5) % w,
                y: (h - 1) - (((cy / rect.height) * h * 1.5) % h)
            }
        }

        previewCanvas.addEventListener('pointerdown', (e) => {
            this.runtimeState.pushing = true
            previewCanvas.setPointerCapture(e.pointerId)
            const pt = getSimCoords(e)
            this.runtimeState.pushX = pt.x
            this.runtimeState.pushY = pt.y
        })
        previewCanvas.addEventListener('pointermove', (e) => {
            if(!this.runtimeState.pushing) return
            const pt = getSimCoords(e)
            this.runtimeState.pushX = pt.x
            this.runtimeState.pushY = pt.y
        })
        previewCanvas.addEventListener('pointerup', () => {
            this.runtimeState.pushing = false
        })
        previewCanvas.addEventListener('pointerleave', () => {
            this.runtimeState.pushing = false
        })
    }
})
