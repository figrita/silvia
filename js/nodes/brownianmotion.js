import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'brownianmotion',
    icon: '⚛️',
    label: 'Brownian Motion',
    tooltip: 'Random walk centered on the origin. Outputs X and Y positions that wander according to temperature and are pulled back by gravity.',

    elements: {
        canvas: null,
        temperatureControl: null,
        gravityControl: null,
        smoothingControl: null
    },
    values: {
        temperature: 0.5,
        gravity: 0.02,
        smoothing: 0,
        isRunning: true,
        x: 0,
        y: 0,
        smoothX: 0,
        smoothY: 0
    },
    runtimeState: {
        lastTime: null,
        pathHistory: null,
        animationFrameId: null
    },

    input: {
        'startStop': {
            label: 'Start/Stop',
            type: 'action',
            control: {},
            downCallback(){
                this.values.isRunning = !this.values.isRunning
                if(this.values.isRunning){
                    this.runtimeState.lastTime = performance.now()
                }
            }
        },
        'reset': {
            label: 'Reset',
            type: 'action',
            control: {},
            downCallback(){
                this.values.x = 0
                this.values.y = 0
                this.values.smoothX = 0
                this.values.smoothY = 0
                this.values.isRunning = true
                this.runtimeState.lastTime = performance.now()
                if(this.runtimeState.pathHistory){
                    this.runtimeState.pathHistory.length = 0
                }
            }
        }
    },

    output: {
        'x': {
            label: 'X',
            type: 'float',
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed) return
                gl.uniform1f(gl.getUniformLocation(program, uniformName), this.values.smoothX)
            }
        },
        'y': {
            label: 'Y',
            type: 'float',
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed) return
                gl.uniform1f(gl.getUniformLocation(program, uniformName), this.values.smoothY)
            }
        }
    },

    _step(){
        if(!this.values.isRunning) return

        const now = performance.now()
        if(!this.runtimeState.lastTime){
            this.runtimeState.lastTime = now
            return
        }
        const dt = Math.min((now - this.runtimeState.lastTime) / 1000, 0.1)
        this.runtimeState.lastTime = now

        const temp = this.values.temperature
        const grav = this.values.gravity

        // Random displacement scaled by sqrt(dt) for proper Brownian scaling
        const sqrtDt = Math.sqrt(dt)
        this.values.x += _gaussRandom() * temp * sqrtDt
        this.values.y += _gaussRandom() * temp * sqrtDt

        // Spring force toward origin (Ornstein-Uhlenbeck process)
        this.values.x -= this.values.x * grav
        this.values.y -= this.values.y * grav

        // Exponential smoothing (low-pass filter)
        const alpha = 1 - this.values.smoothing
        this.values.smoothX += alpha * (this.values.x - this.values.smoothX)
        this.values.smoothY += alpha * (this.values.y - this.values.smoothY)

        // Store path for visualization
        if(this.runtimeState.pathHistory){
            this.runtimeState.pathHistory.push({x: this.values.smoothX, y: this.values.smoothY})
            if(this.runtimeState.pathHistory.length > 500){
                this.runtimeState.pathHistory.shift()
            }
        }
    },

    onCreate(){
        if(!this.customArea) return

        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <canvas data-el="canvas" width="200" height="200" style="width: 100%; aspect-ratio: 1; border-radius: 4px;"></canvas>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Temperature</label>
                    <s-number value="${this.values.temperature}" default="${this.defaults.temperature}" min="0.01" max="5.0" step="0.01" log-scale data-el="temperatureControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Gravity</label>
                    <s-number value="${this.values.gravity}" default="${this.defaults.gravity}" min="0" max="1.0" step="0.001" data-el="gravityControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Smoothing</label>
                    <s-number value="${this.values.smoothing}" default="${this.defaults.smoothing}" min="0" max="0.99" step="0.01" data-el="smoothingControl"></s-number>
                </div>
            </div>
        `

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        this.runtimeState.pathHistory = []
        this.runtimeState.lastTime = performance.now()

        this.elements.temperatureControl.addEventListener('input', (e) => {
            this.values.temperature = parseFloat(e.target.value)
        })
        this.elements.gravityControl.addEventListener('input', (e) => {
            this.values.gravity = parseFloat(e.target.value)
        })
        this.elements.smoothingControl.addEventListener('input', (e) => {
            this.values.smoothing = parseFloat(e.target.value)
        })

        // Start XY plot animation
        const canvas = this.elements.canvas
        const ctx = canvas.getContext('2d')

        const animate = () => {
            this._step()
            this._drawXYPlot(canvas, ctx)
            this.runtimeState.animationFrameId = requestAnimationFrame(animate)
        }
        animate()
    },

    _drawXYPlot(canvas, ctx){
        const w = canvas.width
        const h = canvas.height
        const path = this.runtimeState.pathHistory
        if(!path) return

        // Background
        ctx.fillStyle = '#222'
        ctx.fillRect(0, 0, w, h)

        // Determine scale from path extents (auto-fit with padding)
        let extent = 1
        for(let i = 0; i < path.length; i++){
            extent = Math.max(extent, Math.abs(path[i].x), Math.abs(path[i].y))
        }
        extent = Math.max(extent, Math.abs(this.values.smoothX), Math.abs(this.values.smoothY))
        extent *= 1.3 // padding

        const toScreenX = (v) => (v / extent + 1) * 0.5 * w
        const toScreenY = (v) => (-v / extent + 1) * 0.5 * h

        // Grid: crosshairs at origin
        ctx.strokeStyle = '#444'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        const cx = toScreenX(0)
        const cy = toScreenY(0)
        ctx.beginPath()
        ctx.moveTo(cx, 0)
        ctx.lineTo(cx, h)
        ctx.moveTo(0, cy)
        ctx.lineTo(w, cy)
        ctx.stroke()
        ctx.setLineDash([])

        // Draw path with fade
        if(path.length > 1){
            const numberHue = getComputedStyle(document.documentElement).getPropertyValue('--number-hue').trim()
            const numberSat = getComputedStyle(document.documentElement).getPropertyValue('--number-sat').trim()

            ctx.lineWidth = 1.5
            for(let i = 1; i < path.length; i++){
                const alpha = (i / path.length) * 0.8
                ctx.strokeStyle = `hsla(${numberHue}, ${numberSat}, 60%, ${alpha})`
                ctx.beginPath()
                ctx.moveTo(toScreenX(path[i-1].x), toScreenY(path[i-1].y))
                ctx.lineTo(toScreenX(path[i].x), toScreenY(path[i].y))
                ctx.stroke()
            }
        }

        // Current position dot
        const dotX = toScreenX(this.values.smoothX)
        const dotY = toScreenY(this.values.smoothY)
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2)
        ctx.fill()

        // Value readout
        ctx.fillStyle = '#ccc'
        ctx.font = '11px monospace'
        ctx.textAlign = 'right'
        const sx = this.values.smoothX.toFixed(3)
        const sy = this.values.smoothY.toFixed(3)
        ctx.fillText(`${sx}, ${sy}`, w - 6, 14)
    },

    onDestroy(){
        if(this.runtimeState.animationFrameId){
            cancelAnimationFrame(this.runtimeState.animationFrameId)
        }
        this.runtimeState.pathHistory = null
    }
})

// Box-Muller transform for gaussian random numbers
function _gaussRandom(){
    let u = 0, v = 0
    while(u === 0) u = Math.random()
    while(v === 0) v = Math.random()
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}
