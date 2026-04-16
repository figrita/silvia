import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'smoothcounter',
    icon: '🎚️',
    label: 'Smooth Counter',
    tooltip: 'Like Counter, but smoothly interpolates toward the target value. Good for smooth fades, camera moves, etc.',

    runtimeState: {
        animationFrameId: null,
        lastTime: 0
    },

    elements: {
        minControl: null,
        maxControl: null,
        stepControl: null,
        speedControl: null,
        displayEl: null
    },
    values: {
        min: 0,
        max: 1,
        step: 0.1,
        speed: 5,
        current: 0,
        target: 0
    },

    input: {
        'increment': {
            label: 'Increment',
            type: 'action',
            control: {},
            downCallback(){
                this._nudge(1)
            }
        },
        'decrement': {
            label: 'Decrement',
            type: 'action',
            control: {},
            downCallback(){
                this._nudge(-1)
            }
        },
        'reset': {
            label: 'Reset',
            type: 'action',
            control: {},
            downCallback(){
                this.values.target = this.values.min
            }
        },
        'set': {
            label: 'Set to Max',
            type: 'action',
            control: {},
            downCallback(){
                this.values.target = this.values.max
            }
        },
        'jump': {
            label: 'Jump (skip smooth)',
            type: 'action',
            control: {},
            downCallback(){
                this.values.current = this.values.target
            }
        }
    },

    options: {
        'mode': {
            label: 'Mode',
            type: 'select',
            default: 'clamp',
            choices: [
                {value: 'clamp', name: 'Clamp'},
                {value: 'wrap', name: 'Wrap'}
            ]
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed){return}
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, this.values.current)
            }
        },
        'normalized': {
            label: 'Normalized',
            type: 'float',
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed){return}
                const location = gl.getUniformLocation(program, uniformName)
                const range = this.values.max - this.values.min
                const normalized = range > 0 ? (this.values.current - this.values.min) / range : 0
                gl.uniform1f(location, normalized)
            }
        }
    },

    _nudge(direction){
        const mode = this.getOption('mode')

        if(mode === 'wrap'){
            // Phase accumulator — target increases/decreases without bound,
            // _tick wraps current into [min, max) continuously
            this.values.target += direction * this.values.step
        } else {
            this.values.target = Math.max(this.values.min,
                Math.min(this.values.max,
                    this.values.target + direction * this.values.step))
        }
    },

    _advanceSmoothing(dt){
        if(dt <= 0 || dt >= 0.2) return
        const diff = this.values.target - this.values.current
        if(Math.abs(diff) > 1e-7){
            this.values.current += diff * (1 - Math.exp(-this.values.speed * dt))

            if(this.getOption('mode') === 'wrap'){
                const range = this.values.max - this.values.min
                if(range > 0){
                    this.values.current = this.values.min + ((this.values.current - this.values.min) % range + range) % range
                    this.values.target = this.values.min + ((this.values.target - this.values.min) % range + range) % range
                }
            }

            this._updateDisplay()
        }
    },

    _tick(timestamp){
        if(this.isDestroyed) return

        const dt = this.runtimeState.lastTime
            ? (timestamp - this.runtimeState.lastTime) / 1000
            : 0
        this.runtimeState.lastTime = timestamp

        this._advanceSmoothing(dt)

        this.runtimeState.animationFrameId = requestAnimationFrame((t) => this._tick(t))
    },

    _prepareForTime(virtualTime, fps){
        this._advanceSmoothing(1 / fps)
    },

    _suspendRealtimeLoops(){
        if(this.runtimeState.animationFrameId){
            cancelAnimationFrame(this.runtimeState.animationFrameId)
            this.runtimeState.animationFrameId = null
        }
    },

    _resumeRealtimeLoops(){
        this.runtimeState.lastTime = 0
        this.runtimeState.animationFrameId = requestAnimationFrame((t) => this._tick(t))
    },

    _updateDisplay(){
        if(this.elements.displayEl){
            function decimalPlaces(num) {
                const numStr = num.toString();
                const dotIndex = numStr.indexOf('.');
                return dotIndex === -1 ? 0 : numStr.length - dotIndex - 1;
            }
            const places = Math.max(decimalPlaces(this.values.step), 2)
            this.elements.displayEl.textContent = this.values.current.toFixed(places)
        }
    },

    onCreate(){
        if(!this.customArea){return}

        this.values.current = this.values.current ?? this.values.min
        this.values.target = this.values.target ?? this.values.current

        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Min</label>
                    <s-number midi-disabled value="${this.values.min}" default="${this.defaults.min}" min="-10000" max="10000" step="1" data-el="minControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Max</label>
                    <s-number midi-disabled value="${this.values.max}" default="${this.defaults.max}" min="-10000" max="10000" step="1" data-el="maxControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Step</label>
                    <s-number midi-disabled value="${this.values.step}" default="${this.defaults.step}" min="0.001" max="100" step="0.01" data-el="stepControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Speed</label>
                    <s-number midi-disabled value="${this.values.speed}" default="${this.defaults.speed}" min="0.1" max="50" step="0.1" data-el="speedControl"></s-number>
                </div>
                <div style="text-align:center; font-size:1.2rem; color:#fff; padding:0.5rem; background:#333; border-radius:4px;" data-el="displayEl">
                    ${this.values.current}
                </div>
            </div>
        `

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        this.customArea.addEventListener('input', (e) => {
            const el = e.target
            const val = parseFloat(el.value)
            if(isNaN(val)) return

            switch(el.dataset.el){
                case 'minControl':
                    this.values.min = val
                    this.values.target = Math.max(this.values.min, Math.min(this.values.max, this.values.target))
                    break
                case 'maxControl':
                    this.values.max = val
                    this.values.target = Math.max(this.values.min, Math.min(this.values.max, this.values.target))
                    break
                case 'stepControl':
                    if(val > 0) this.values.step = val
                    break
                case 'speedControl':
                    if(val > 0) this.values.speed = val
                    break
                default:
                    return
            }
            this._updateDisplay()
        })

        this._updateDisplay()
        this.runtimeState.animationFrameId = requestAnimationFrame((t) => this._tick(t))
    },

    onDestroy(){
        if(this.runtimeState.animationFrameId){
            cancelAnimationFrame(this.runtimeState.animationFrameId)
        }
    }
})
