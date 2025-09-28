import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'randomfire',
    icon: '🔥',
    label: 'Random Fire',
    tooltip: 'Fires action events randomly based on Temperature. Higher temperature = more frequent firing.',

    elements: {
        temperatureControl: null,
        statusIndicator: null
    },
    values: {
        temperature: 1.0,
        isRunning: true
    },
    runtimeState: {
        lastFireTime: 0,
        nextFireDelay: 0,
        animationFrameId: null,
        connectedOutputs: new Set()
    },

    input: {
        'start': {
            label: 'Start/Stop',
            type: 'action',
            control: {},
            downCallback(){
                this._toggleRunning()
            }
        }
    },

    output: {
        'fire': {
            label: 'Fire',
            type: 'action',
            control: {}
        }
    },

    _toggleRunning(){
        this.values.isRunning = !this.values.isRunning
        if(this.values.isRunning){
            this._scheduleNextFire()
            this._startAnimation()
        } else {
            this._stopAnimation()
        }
        this._updateUI()
    },

    _calculateFireDelay(){
        // Temperature range: 0.0 to 10.0
        // Convert to firing frequency (fires per second)
        const minDelay = 0.05  // 20 Hz max at temp 10
        const maxDelay = 5.0   // 0.2 Hz min at temp 0.1

        // Clamp temperature to avoid division by zero
        const temp = Math.max(this.values.temperature, 0.01)

        // Exponential relationship: higher temp = shorter delay
        const baseDelay = 1.0 / temp
        const clampedDelay = Math.max(minDelay, Math.min(maxDelay, baseDelay))

        // Add randomness: ±50% variation
        const randomFactor = 0.5 + Math.random()
        return clampedDelay * randomFactor
    },

    _scheduleNextFire(){
        if(!this.values.isRunning) return

        this.runtimeState.nextFireDelay = this._calculateFireDelay() * 1000 // Convert to ms
        this.runtimeState.lastFireTime = performance.now()
    },

    _fireEvent(){
        // Trigger connected action outputs
        this.triggerAction('fire', 'down')

        // Visual feedback
        this._showFireIndicator()

        // Schedule next fire
        this._scheduleNextFire()
    },

    _showFireIndicator(){
        if(this.elements.statusIndicator){
            this.elements.statusIndicator.style.background = 'var(--bg-hover)'

            // Reset after short duration
            setTimeout(() => {
                if(this.elements.statusIndicator){
                    this.elements.statusIndicator.style.background = this.values.isRunning ? 'var(--bg-interactive)' : 'var(--bg-secondary)'
                }
            }, 50)
        }
    },

    _updateLoop(){
        if(!this.values.isRunning){
            return
        }

        const currentTime = performance.now()
        const elapsed = currentTime - this.runtimeState.lastFireTime

        if(elapsed >= this.runtimeState.nextFireDelay){
            this._fireEvent()
        }

        // Continue loop
        this.runtimeState.animationFrameId = requestAnimationFrame(() => this._updateLoop())
    },

    _startAnimation(){
        if(this.runtimeState.animationFrameId){
            cancelAnimationFrame(this.runtimeState.animationFrameId)
        }
        this._updateLoop()
    },

    _stopAnimation(){
        if(this.runtimeState.animationFrameId){
            cancelAnimationFrame(this.runtimeState.animationFrameId)
            this.runtimeState.animationFrameId = null
        }
    },

    _updateUI(){
        if(!this.elements.statusIndicator){
            return
        }

        if(this.values.isRunning){
            this.elements.statusIndicator.textContent = '🔥 Active'
            this.elements.statusIndicator.style.background = 'var(--bg-interactive)'
            this.elements.statusIndicator.style.color = 'var(--text-secondary)'
        } else {
            this.elements.statusIndicator.textContent = '❄️ Stopped'
            this.elements.statusIndicator.style.background = 'var(--bg-secondary)'
            this.elements.statusIndicator.style.color = 'var(--text-muted)'
        }
    },

    onCreate(){
        if(!this.customArea){return}

        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div style="text-align:center; padding:0.25rem; border-radius:3px; font-size:0.8rem;" data-el="statusIndicator">🔥 Active</div>

                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Temperature</label>
                    <s-number value="${this.values.temperature}" default="1.0" min="0.01" max="10.0" step="0.01" unit="°" log-scale data-el="temperatureControl"></s-number>
                </div>

                <div style="font-size:0.7rem; color:#888; text-align:center;">
                    Higher temperature = more frequent firing
                </div>
            </div>
        `

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        // Add event listeners
        this.elements.temperatureControl.addEventListener('input', (e) => {
            this.values.temperature = parseFloat(e.target.value)
        })

        // Initialize
        this._updateUI()
        if(this.values.isRunning){
            this._scheduleNextFire()
            this._startAnimation()
        }
    },

    onDestroy(){
        this._stopAnimation()
    }
})