import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

// Wells: {x, y, strength} or {x, y, tether}
const PRESETS = [
    {name: 'DVD', x: -0.7, y: 0.5, vx: 0.8, vy: 0.6, drag: 0, gravityX: 0, gravityY: 0, bounce: 1.0, edgeX: 'bounce', edgeY: 'bounce', wells: []},
    {name: 'Drop', x: 0, y: 0.9, vx: 0.4, vy: 0, drag: 0.003, gravityX: 0, gravityY: -3.0, bounce: 0.85, edgeX: 'bounce', edgeY: 'bounce', wells: []},
    {name: 'Orbit', x: 0.7, y: 0, vx: 0, vy: 1.6, drag: 0, gravityX: 0, gravityY: 0, bounce: 1.0, edgeX: 'unbound', edgeY: 'unbound', wells: [{x: 0, y: 0, strength: 2.0}]},
    {name: 'Spiral', x: 0.8, y: 0, vx: 0, vy: 1.4, drag: 0.003, gravityX: 0, gravityY: 0, bounce: 1.0, edgeX: 'unbound', edgeY: 'unbound', wells: [{x: 0, y: 0, strength: 2.0}]},
    {name: 'Figure 8', x: 0, y: 0.05, vx: 1.35, vy: 0, drag: 0.001, gravityX: 0, gravityY: 0, bounce: 1.0, edgeX: 'unbound', edgeY: 'unbound', wells: [{x: -0.4, y: 0, strength: 2.0}, {x: 0.4, y: 0, strength: 2.0}]},
    {name: 'Pendulum', x: 0.71, y: -0.21, vx: 0, vy: 0, drag: 0.001, gravityX: 0, gravityY: -3.0, bounce: 1.0, edgeX: 'unbound', edgeY: 'unbound', wells: [{x: 0, y: 0.5, tether: 1.0}]},
    {name: 'Pong', x: -0.8, y: 0.3, vx: 0.5, vy: 0.8, drag: 0, gravityX: 0, gravityY: -1.0, bounce: 1.0, edgeX: 'wrap', edgeY: 'bounce', wells: []},
    {name: 'Drift', x: 0, y: 0, vx: 0.35, vy: 0.2, drag: 0, gravityX: 0, gravityY: 0, bounce: 1.0, edgeX: 'wrap', edgeY: 'wrap', wells: []},
    {name: '3-Body', x: 0, y: -0.5, vx: 1.3, vy: 0.3, drag: 0, gravityX: 0, gravityY: 0, bounce: 1.0, edgeX: 'unbound', edgeY: 'unbound', wells: [{x: 0, y: 0.5, strength: 1.2}, {x: -0.45, y: -0.3, strength: 1.2}, {x: 0.45, y: -0.3, strength: 1.2}]}
]

const WELL_HIT_RADIUS = 14 // screen px

registerNode({
    slug: 'xypad',
    icon: '🕹️',
    label: 'XY Pad',
    tooltip: 'Interactive XY controller with physics. Right-click-drag to place gravity wells or tethers. Drag distance sets strength/radius.',

    elements: {},
    values: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        drag: 0.02,
        temperature: 0,
        spring: 0,
        gravityX: 0,
        gravityY: 0,
        bounce: 0.8,
        minX: -1,
        maxX: 1,
        minY: -1,
        maxY: 1
    },
    runtimeState: {
        lastTime: null,
        animationFrameId: null,
        wells: [],
        placingWell: null,
        isPointerDown: false,
        slingAnchorX: 0,
        slingAnchorY: 0,
        cachedHue: null,
        cachedSat: null,
        pathBuf: null, // Float64Array ring buffer [x0,y0,x1,y1,...]
        pathHead: 0,
        pathLen: 0
    },

    input: {
        'reset': {
            label: 'Reset',
            type: 'action',
            control: {},
            downCallback() {
                this.values.x = 0
                this.values.y = 0
                this.values.vx = 0
                this.values.vy = 0
                this._clearPath()
            }
        },
        'clearWells': {
            label: 'Clear Wells',
            type: 'action',
            control: {},
            downCallback() {
                this.runtimeState.wells.length = 0
            }
        },
    },

    output: {
        'x': {
            label: 'X',
            type: 'float',
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                gl.uniform1f(gl.getUniformLocation(program, uniformName), this.values.x)
            }
        },
        'y': {
            label: 'Y',
            type: 'float',
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                gl.uniform1f(gl.getUniformLocation(program, uniformName), this.values.y)
            }
        },
        'speed': {
            label: 'Speed',
            type: 'float',
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const speed = Math.sqrt(this.values.vx * this.values.vx + this.values.vy * this.values.vy)
                gl.uniform1f(gl.getUniformLocation(program, uniformName), speed)
            }
        },
        'bounced': {
            label: 'Bounced',
            type: 'action'
        }
    },

    options: {
        'edgeX': {
            label: 'Edge X',
            type: 'select',
            default: 'bounce',
            choices: [
                {value: 'bounce', name: 'Bounce'},
                {value: 'wrap', name: 'Wrap'},
                {value: 'clamp', name: 'Clamp'},
                {value: 'unbound', name: 'Unbound'}
            ]
        },
        'edgeY': {
            label: 'Edge Y',
            type: 'select',
            default: 'bounce',
            choices: [
                {value: 'bounce', name: 'Bounce'},
                {value: 'wrap', name: 'Wrap'},
                {value: 'clamp', name: 'Clamp'},
                {value: 'unbound', name: 'Unbound'}
            ]
        },
        'clickMode': {
            label: 'Click',
            type: 'select',
            default: 'slingshot',
            choices: [
                {value: 'slingshot', name: 'Slingshot'},
                {value: 'cursor', name: 'Cursor'}
            ]
        },
        'wellType': {
            label: 'Place Mode',
            type: 'select',
            default: 'gravity',
            choices: [
                {value: 'gravity', name: 'Gravity Well'},
                {value: 'tether', name: 'Tether'}
            ]
        }
    },

    onCreate() {
        if (!this.customArea) return

        const presetButtons = PRESETS.map((p, i) =>
            `<button data-preset="${i}" title="${p.name}" style="flex:1; min-width:0; padding: 2px 0; font-size: 0.85rem; background: hsl(0 0% 18%); border: 1px solid #555; border-radius: 4px; color: #ccc; cursor: pointer;">${i + 1}</button>`
        ).join('')

        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <canvas data-el="canvas" width="350" height="350"
                    style="width: 100%; aspect-ratio: 1; border-radius: 4px; cursor: crosshair; touch-action: none;"></canvas>
                <div style="display:flex; gap: 0.5rem;">
                    <div style="flex:1; text-align:center;">
                        <div style="font-size:0.7rem; color:#888;">X</div>
                        <div style="font-size:0.9rem; color:#ccc;" data-el="xDisplay">0.000</div>
                    </div>
                    <div style="flex:1; text-align:center;">
                        <div style="font-size:0.7rem; color:#888;">Y</div>
                        <div style="font-size:0.9rem; color:#ccc;" data-el="yDisplay">0.000</div>
                    </div>
                </div>
                <div data-el="presetBar" style="display:flex; gap: 2px;">${presetButtons}</div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 4px 12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="font-size:0.8rem; color:#ccc;">Drag</label>
                        <s-number value="${this.values.drag}" default="${this.defaults.drag}" min="0" max="0.1" step="0.001" data-el="dragControl"></s-number>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="font-size:0.8rem; color:#ccc;">Bounce</label>
                        <s-number value="${this.values.bounce}" default="${this.defaults.bounce}" min="0" max="1.5" step="0.01" data-el="bounceControl"></s-number>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="font-size:0.8rem; color:#ccc;">Temp</label>
                        <s-number value="${this.values.temperature}" default="${this.defaults.temperature}" min="0" max="5.0" step="0.01" log-scale data-el="temperatureControl"></s-number>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="font-size:0.8rem; color:#ccc;">Spring</label>
                        <s-number value="${this.values.spring}" default="${this.defaults.spring}" min="0" max="20.0" step="0.1" data-el="springControl"></s-number>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="font-size:0.8rem; color:#ccc;">Grav X</label>
                        <s-number value="${this.values.gravityX}" default="${this.defaults.gravityX}" min="-5.0" max="5.0" step="0.01" data-el="gravityXControl"></s-number>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="font-size:0.8rem; color:#ccc;">Grav Y</label>
                        <s-number value="${this.values.gravityY}" default="${this.defaults.gravityY}" min="-5.0" max="5.0" step="0.01" data-el="gravityYControl"></s-number>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="font-size:0.8rem; color:#ccc;">Min X</label>
                        <s-number value="${this.values.minX}" default="${this.defaults.minX}" min="-100" max="100" step="0.01" data-el="minXControl"></s-number>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="font-size:0.8rem; color:#ccc;">Max X</label>
                        <s-number value="${this.values.maxX}" default="${this.defaults.maxX}" min="-100" max="100" step="0.01" data-el="maxXControl"></s-number>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="font-size:0.8rem; color:#ccc;">Min Y</label>
                        <s-number value="${this.values.minY}" default="${this.defaults.minY}" min="-100" max="100" step="0.01" data-el="minYControl"></s-number>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="font-size:0.8rem; color:#ccc;">Max Y</label>
                        <s-number value="${this.values.maxY}" default="${this.defaults.maxY}" min="-100" max="100" step="0.01" data-el="maxYControl"></s-number>
                    </div>
                </div>
                <div style="font-size: 0.75rem; color: #666; text-align: center;">Right-drag: place well / Right-click well: remove</div>
            </div>
        `

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        this.runtimeState.pathBuf = new Float64Array(500 * 2)
        this.runtimeState.wells = []
        this.runtimeState.placingWell = null
        this.runtimeState.lastTime = performance.now()
        this._cacheThemeColors()

        this.elements.presetBar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-preset]')
            if (!btn) return
            this._applyPreset(parseInt(btn.dataset.preset))
        })

        this.elements.dragControl.addEventListener('input', (e) => {
            this.values.drag = parseFloat(e.target.value)
        })
        this.elements.temperatureControl.addEventListener('input', (e) => {
            this.values.temperature = parseFloat(e.target.value)
        })
        this.elements.springControl.addEventListener('input', (e) => {
            this.values.spring = parseFloat(e.target.value)
        })
        this.elements.gravityXControl.addEventListener('input', (e) => {
            this.values.gravityX = parseFloat(e.target.value)
        })
        this.elements.gravityYControl.addEventListener('input', (e) => {
            this.values.gravityY = parseFloat(e.target.value)
        })
        this.elements.bounceControl.addEventListener('input', (e) => {
            this.values.bounce = parseFloat(e.target.value)
        })
        this.elements.minXControl.addEventListener('input', (e) => {
            this.values.minX = parseFloat(e.target.value)
        })
        this.elements.maxXControl.addEventListener('input', (e) => {
            this.values.maxX = parseFloat(e.target.value)
        })
        this.elements.minYControl.addEventListener('input', (e) => {
            this.values.minY = parseFloat(e.target.value)
        })
        this.elements.maxYControl.addEventListener('input', (e) => {
            this.values.maxY = parseFloat(e.target.value)
        })

        const canvas = this.elements.canvas
        canvas.addEventListener('pointerdown', this._onPointerDown.bind(this))
        canvas.addEventListener('pointermove', this._onPointerMove.bind(this))
        canvas.addEventListener('pointerup', this._onPointerUp.bind(this))
        canvas.addEventListener('pointerleave', this._onPointerUp.bind(this))
        canvas.addEventListener('contextmenu', (e) => {
            if (!e.shiftKey) { e.preventDefault(); e.stopPropagation() }
        })

        const ctx = canvas.getContext('2d')
        const animate = () => {
            this._step()
            this._draw(canvas, ctx)
            this._updateDisplays()
            this.runtimeState.animationFrameId = requestAnimationFrame(animate)
        }
        animate()
    },

    _prepareForTime(virtualTime, fps){
        this._step(1 / fps)
        if(this.elements.canvas){
            this._draw(this.elements.canvas, this.elements.canvas.getContext('2d'))
            this._updateDisplays()
        }
    },

    _suspendRealtimeLoops(){
        if(this.runtimeState.animationFrameId){
            cancelAnimationFrame(this.runtimeState.animationFrameId)
            this.runtimeState.animationFrameId = null
        }
        this.runtimeState.isPointerDown = false
    },

    _resumeRealtimeLoops(){
        this.runtimeState.lastTime = performance.now()
        const canvas = this.elements.canvas
        if(canvas){
            const ctx = canvas.getContext('2d')
            const animate = () => {
                this._step()
                this._draw(canvas, ctx)
                this._updateDisplays()
                this.runtimeState.animationFrameId = requestAnimationFrame(animate)
            }
            animate()
        }
    },

    onDestroy() {
        if (this.runtimeState.animationFrameId) {
            cancelAnimationFrame(this.runtimeState.animationFrameId)
        }
        this.runtimeState.pathBuf = null
    },

    _cacheThemeColors() {
        const style = getComputedStyle(document.documentElement)
        this.runtimeState.cachedHue = style.getPropertyValue('--number-hue').trim()
        this.runtimeState.cachedSat = style.getPropertyValue('--number-sat').trim()
    },

    _setOption(key, value) {
        this.optionValues[key] = value
        const el = this.nodeEl.querySelector(`[data-option-el="${key}"]`)
        if (el) el.value = value
    },

    _applyPreset(index) {
        const p = PRESETS[index]
        if (!p) return

        this._clearPath()

        this._setOption('edgeX', p.edgeX)
        this._setOption('edgeY', p.edgeY)

        this.values.x = p.x
        this.values.y = p.y
        this.values.vx = p.vx
        this.values.vy = p.vy
        this.values.drag = p.drag
        this.values.temperature = 0
        this.values.spring = 0
        this.values.gravityX = p.gravityX
        this.values.gravityY = p.gravityY
        this.values.bounce = p.bounce

        this.runtimeState.wells = p.wells.map(w => ({...w}))

        this.elements.dragControl.value = p.drag
        this.elements.temperatureControl.value = 0
        this.elements.springControl.value = 0
        this.elements.gravityXControl.value = p.gravityX
        this.elements.gravityYControl.value = p.gravityY
        this.elements.bounceControl.value = p.bounce
    },

    _screenToWorld(e) {
        const canvas = this.elements.canvas
        const rect = canvas.getBoundingClientRect()
        const rangeX = (this.values.maxX - this.values.minX) || 1
        const rangeY = (this.values.maxY - this.values.minY) || 1
        const px = (e.clientX - rect.left) / rect.width
        const py = (e.clientY - rect.top) / rect.height
        return {
            x: this.values.minX + px * rangeX,
            y: this.values.maxY - py * rangeY
        }
    },

    _screenDist(e, wx, wy) {
        const canvas = this.elements.canvas
        const rect = canvas.getBoundingClientRect()
        const rangeX = (this.values.maxX - this.values.minX) || 1
        const rangeY = (this.values.maxY - this.values.minY) || 1
        const sx = ((wx - this.values.minX) / rangeX) * rect.width + rect.left
        const sy = (1 - (wy - this.values.minY) / rangeY) * rect.height + rect.top
        return Math.sqrt((e.clientX - sx) ** 2 + (e.clientY - sy) ** 2)
    },

    _onPointerDown(e) {
        if (e.button === 2) {
            if (e.shiftKey) return // let native context menu through
            e.preventDefault()
            const canvas = this.elements.canvas

            for (let i = this.runtimeState.wells.length - 1; i >= 0; i--) {
                const w = this.runtimeState.wells[i]
                if (this._screenDist(e, w.x, w.y) < WELL_HIT_RADIUS) {
                    this.runtimeState.wells.splice(i, 1)
                    return
                }
            }

            canvas.setPointerCapture(e.pointerId)
            const origin = this._screenToWorld(e)
            this.runtimeState.placingWell = {
                x: origin.x,
                y: origin.y,
                curX: e.clientX,
                curY: e.clientY,
                startX: e.clientX,
                startY: e.clientY,
                pointerId: e.pointerId
            }
            return
        }

        if (e.button !== 0) return

        const canvas = this.elements.canvas
        canvas.setPointerCapture(e.pointerId)
        this.runtimeState.isPointerDown = true
        this.values.vx = 0
        this.values.vy = 0

        if (this.getOption('clickMode') === 'slingshot') {
            const p = this._screenToWorld(e)
            this.values.x = p.x
            this.values.y = p.y
            this.runtimeState.slingAnchorX = p.x
            this.runtimeState.slingAnchorY = p.y
        } else {
            const p = this._screenToWorld(e)
            this.values.x = Math.max(this.values.minX, Math.min(this.values.maxX, p.x))
            this.values.y = Math.max(this.values.minY, Math.min(this.values.maxY, p.y))
        }
    },

    _onPointerMove(e) {
        if (this.runtimeState.placingWell && this.runtimeState.placingWell.pointerId === e.pointerId) {
            this.runtimeState.placingWell.curX = e.clientX
            this.runtimeState.placingWell.curY = e.clientY
            return
        }

        if (!this.runtimeState.isPointerDown) return
        const p = this._screenToWorld(e)

        if (this.getOption('clickMode') === 'slingshot') {
            this.values.x = p.x
            this.values.y = p.y
        } else {
            const prevX = this.values.x
            const prevY = this.values.y
            this.values.x = Math.max(this.values.minX, Math.min(this.values.maxX, p.x))
            this.values.y = Math.max(this.values.minY, Math.min(this.values.maxY, p.y))
            this.values.vx = (this.values.x - prevX) * 60
            this.values.vy = (this.values.y - prevY) * 60
        }
    },

    _onPointerUp(e) {
        if (this.runtimeState.placingWell && this.runtimeState.placingWell.pointerId === e.pointerId) {
            const pw = this.runtimeState.placingWell
            this.elements.canvas.releasePointerCapture(e.pointerId)

            const dragDist = Math.sqrt((pw.curX - pw.startX) ** 2 + (pw.curY - pw.startY) ** 2)
            const rect = this.elements.canvas.getBoundingClientRect()
            const rangeX = (this.values.maxX - this.values.minX) || 1
            const worldDragDist = (dragDist / rect.width) * rangeX

            if (this.getOption('wellType') === 'tether') {
                this.runtimeState.wells.push({x: pw.x, y: pw.y, tether: Math.max(0.05, worldDragDist)})
            } else {
                const strength = dragDist < 5 ? 2.0 : worldDragDist * 3
                this.runtimeState.wells.push({x: pw.x, y: pw.y, strength})
            }

            this.runtimeState.placingWell = null
            return
        }

        if (!this.runtimeState.isPointerDown) return
        this.elements.canvas.releasePointerCapture(e.pointerId)
        this.runtimeState.isPointerDown = false

        if (this.getOption('clickMode') === 'slingshot') {
            const dx = this.runtimeState.slingAnchorX - this.values.x
            const dy = this.runtimeState.slingAnchorY - this.values.y
            this.values.vx = dx * 5.0
            this.values.vy = dy * 5.0
            this.values.x = this.runtimeState.slingAnchorX
            this.values.y = this.runtimeState.slingAnchorY
            this._clearPath()
        }
    },


    _applyEdgeAxis(posKey, velKey, minKey, maxKey, mode) {
        if (mode === 'unbound') return false
        const min = this.values[minKey], max = this.values[maxKey]
        const range = max - min
        if (mode === 'wrap' && range > 0) {
            while (this.values[posKey] > max) this.values[posKey] -= range
            while (this.values[posKey] < min) this.values[posKey] += range
            return false
        }
        if (mode === 'clamp') {
            if (this.values[posKey] <= min) { this.values[posKey] = min; this.values[velKey] = 0 }
            else if (this.values[posKey] >= max) { this.values[posKey] = max; this.values[velKey] = 0 }
            return false
        }
        if (this.values[posKey] <= min) {
            this.values[posKey] = min
            this.values[velKey] = Math.abs(this.values[velKey]) * this.values.bounce
            return true
        }
        if (this.values[posKey] >= max) {
            this.values[posKey] = max
            this.values[velKey] = -Math.abs(this.values[velKey]) * this.values.bounce
            return true
        }
        return false
    },

    _step(overrideDt) {
        let dt
        if(overrideDt !== undefined){
            dt = overrideDt
        } else {
            const now = performance.now()
            if (!this.runtimeState.lastTime) {
                this.runtimeState.lastTime = now
                return
            }
            dt = Math.min((now - this.runtimeState.lastTime) / 1000, 0.1)
            this.runtimeState.lastTime = now
        }

        if (this.runtimeState.isPointerDown) return

        this.values.vx += this.values.gravityX * dt
        this.values.vy += this.values.gravityY * dt

        if (this.values.spring > 0) {
            const cx = (this.values.minX + this.values.maxX) / 2
            const cy = (this.values.minY + this.values.maxY) / 2
            this.values.vx += (cx - this.values.x) * this.values.spring * dt
            this.values.vy += (cy - this.values.y) * this.values.spring * dt
        }

        for (let i = 0; i < this.runtimeState.wells.length; i++) {
            const w = this.runtimeState.wells[i]
            if (w.tether != null) continue
            const dx = w.x - this.values.x
            const dy = w.y - this.values.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > 0.001) {
                const force = w.strength / (dist + 0.05)
                this.values.vx += (dx / dist) * force * dt
                this.values.vy += (dy / dist) * force * dt
            }
        }

        if (this.values.temperature > 0) {
            const sqrtDt = Math.sqrt(dt)
            this.values.vx += _gaussRandom() * this.values.temperature * sqrtDt
            this.values.vy += _gaussRandom() * this.values.temperature * sqrtDt
        }

        const dragFactor = Math.pow(1 - this.values.drag, dt * 60)
        this.values.vx *= dragFactor
        this.values.vy *= dragFactor

        if (Math.abs(this.values.vx) < 0.0001) this.values.vx = 0
        if (Math.abs(this.values.vy) < 0.0001) this.values.vy = 0

        const prevX = this.values.x
        const prevY = this.values.y
        this.values.x += this.values.vx * dt
        this.values.y += this.values.vy * dt

        for (let i = 0; i < this.runtimeState.wells.length; i++) {
            const w = this.runtimeState.wells[i]
            if (w.tether == null) continue
            const dx = this.values.x - w.x
            const dy = this.values.y - w.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 0.0001) {
                this.values.x = w.x + w.tether
                this.values.vx = 0
                this.values.vy = 0
                continue
            }
            const nx = dx / dist
            const ny = dy / dist
            this.values.x = w.x + nx * w.tether
            this.values.y = w.y + ny * w.tether
            const radial = this.values.vx * nx + this.values.vy * ny
            this.values.vx -= radial * nx
            this.values.vy -= radial * ny
        }

        let didBounce = false
        didBounce = this._applyEdgeAxis('x', 'vx', 'minX', 'maxX', this.getOption('edgeX')) || didBounce
        didBounce = this._applyEdgeAxis('y', 'vy', 'minY', 'maxY', this.getOption('edgeY')) || didBounce
        if (didBounce) this.triggerAction('bounced')

        this._recordPath()
    },

    _recordPath() {
        const buf = this.runtimeState.pathBuf
        if (!buf) return
        const i = this.runtimeState.pathHead * 2
        buf[i] = this.values.x
        buf[i + 1] = this.values.y
        this.runtimeState.pathHead = (this.runtimeState.pathHead + 1) % 500
        if (this.runtimeState.pathLen < 500) this.runtimeState.pathLen++
    },

    _clearPath() {
        this.runtimeState.pathHead = 0
        this.runtimeState.pathLen = 0
    },

    _updateDisplays() {
        if (this.elements.xDisplay) this.elements.xDisplay.textContent = this.values.x.toFixed(3)
        if (this.elements.yDisplay) this.elements.yDisplay.textContent = this.values.y.toFixed(3)
    },

    _draw(canvas, ctx) {
        const w = canvas.width
        const h = canvas.height
        const buf = this.runtimeState.pathBuf
        if (!buf) return
        const pathLen = this.runtimeState.pathLen
        const pathHead = this.runtimeState.pathHead

        const minX = this.values.minX
        const maxX = this.values.maxX
        const minY = this.values.minY
        const maxY = this.values.maxY
        const rangeX = maxX - minX || 1
        const rangeY = maxY - minY || 1

        const toSX = (v) => ((v - minX) / rangeX) * w
        const toSY = (v) => (1 - (v - minY) / rangeY) * h

        ctx.fillStyle = '#222'
        ctx.fillRect(0, 0, w, h)

        ctx.strokeStyle = '#444'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(toSX((minX + maxX) / 2), 0)
        ctx.lineTo(toSX((minX + maxX) / 2), h)
        ctx.moveTo(0, toSY((minY + maxY) / 2))
        ctx.lineTo(w, toSY((minY + maxY) / 2))
        ctx.stroke()
        ctx.setLineDash([])

        ctx.strokeStyle = '#555'
        ctx.lineWidth = 1
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

        for (let i = 0; i < this.runtimeState.wells.length; i++) {
            this._drawWell(ctx, this.runtimeState.wells[i], w, h, rangeX, rangeY, toSX, toSY, 1.0)
        }

        if (this.runtimeState.placingWell) {
            const pw = this.runtimeState.placingWell
            const rect = canvas.getBoundingClientRect()
            const dragDist = Math.sqrt((pw.curX - pw.startX) ** 2 + (pw.curY - pw.startY) ** 2)
            const worldDragDist = (dragDist / rect.width) * rangeX

            if (this.getOption('wellType') === 'tether') {
                this._drawWell(ctx, {x: pw.x, y: pw.y, tether: Math.max(0.05, worldDragDist)}, w, h, rangeX, rangeY, toSX, toSY, 0.5)
            } else {
                const strength = dragDist < 5 ? 2.0 : worldDragDist * 3
                this._drawWell(ctx, {x: pw.x, y: pw.y, strength}, w, h, rangeX, rangeY, toSX, toSY, 0.5)
            }
        }

        if (pathLen > 1) {
            const hue = this.runtimeState.cachedHue
            const sat = this.runtimeState.cachedSat
            const wrapThreshX = rangeX * 0.5
            const wrapThreshY = rangeY * 0.5
            const start = (pathHead - pathLen + 500) % 500

            ctx.lineWidth = 1.5
            for (let n = 1; n < pathLen; n++) {
                const prev = ((start + n - 1) % 500) * 2
                const cur = ((start + n) % 500) * 2
                const dx = Math.abs(buf[cur] - buf[prev])
                const dy = Math.abs(buf[cur + 1] - buf[prev + 1])
                if (dx > wrapThreshX || dy > wrapThreshY) continue
                const alpha = (n / pathLen) * 0.6
                ctx.strokeStyle = `hsla(${hue}, ${sat}, 60%, ${alpha})`
                ctx.beginPath()
                ctx.moveTo(toSX(buf[prev]), toSY(buf[prev + 1]))
                ctx.lineTo(toSX(buf[cur]), toSY(buf[cur + 1]))
                ctx.stroke()
            }
        }

        if (!this.runtimeState.isPointerDown && (Math.abs(this.values.vx) > 0.01 || Math.abs(this.values.vy) > 0.01)) {
            const bx = toSX(this.values.x)
            const by = toSY(this.values.y)
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(bx, by)
            ctx.lineTo(bx + this.values.vx * 0.15 * w / rangeX, by - this.values.vy * 0.15 * h / rangeY)
            ctx.stroke()
        }

        if (this.runtimeState.isPointerDown && this.getOption('clickMode') === 'slingshot') {
            const anchorX = toSX(this.runtimeState.slingAnchorX)
            const anchorY = toSY(this.runtimeState.slingAnchorY)
            const pullX = toSX(this.values.x)
            const pullY = toSY(this.values.y)

            ctx.strokeStyle = 'rgba(255, 100, 100, 0.6)'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(anchorX, anchorY)
            ctx.lineTo(pullX, pullY)
            ctx.stroke()

            const launchX = anchorX + (anchorX - pullX) * 0.5
            const launchY = anchorY + (anchorY - pullY) * 0.5
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.25)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(anchorX, anchorY)
            ctx.lineTo(launchX, launchY)
            ctx.stroke()
            ctx.setLineDash([])

            ctx.fillStyle = 'rgba(255, 100, 100, 0.7)'
            ctx.beginPath()
            ctx.arc(anchorX, anchorY, 4, 0, Math.PI * 2)
            ctx.fill()
        }

        const dotX = toSX(this.values.x)
        const dotY = toSY(this.values.y)

        if (this.runtimeState.isPointerDown) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
            ctx.beginPath()
            ctx.arc(dotX, dotY, 12, 0, Math.PI * 2)
            ctx.fill()
        }

        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(dotX, dotY, 5, 0, Math.PI * 2)
        ctx.fill()
    },

    _drawWell(ctx, well, w, h, rangeX, rangeY, toSX, toSY, opacity) {
        const wx = toSX(well.x)
        const wy = toSY(well.y)

        if (well.tether != null) {
            const rx = (well.tether / rangeX) * w
            const ry = (well.tether / rangeY) * h
            ctx.strokeStyle = `rgba(120, 200, 255, ${0.35 * opacity})`
            ctx.lineWidth = 1
            ctx.setLineDash([3, 4])
            ctx.beginPath()
            ctx.ellipse(wx, wy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
            ctx.stroke()
            ctx.setLineDash([])

            ctx.fillStyle = `rgba(120, 200, 255, ${0.9 * opacity})`
            ctx.beginPath()
            ctx.arc(wx, wy, 3, 0, Math.PI * 2)
            ctx.fill()

            const bx = toSX(this.values.x)
            const by = toSY(this.values.y)
            ctx.strokeStyle = `rgba(120, 200, 255, ${0.25 * opacity})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(wx, wy)
            ctx.lineTo(bx, by)
            ctx.stroke()
        } else {
            const ringRadius = Math.min(well.strength * 10, 50)
            ctx.strokeStyle = `rgba(255, 180, 80, ${0.25 * opacity})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(wx, wy, ringRadius, 0, Math.PI * 2)
            ctx.stroke()

            ctx.fillStyle = `rgba(255, 180, 80, ${0.9 * opacity})`
            ctx.beginPath()
            ctx.arc(wx, wy, 4, 0, Math.PI * 2)
            ctx.fill()

            ctx.strokeStyle = `rgba(255, 180, 80, ${0.5 * opacity})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(wx - 7, wy)
            ctx.lineTo(wx + 7, wy)
            ctx.moveTo(wx, wy - 7)
            ctx.lineTo(wx, wy + 7)
            ctx.stroke()
        }
    }
})

function _gaussRandom() {
    let u = 0, v = 0
    while (u === 0) u = Math.random()
    while (v === 0) v = Math.random()
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}
