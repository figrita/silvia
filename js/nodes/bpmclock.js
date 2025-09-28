import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'bpmclock',
    icon: '🎵',
    label: 'BPM Clock',
    tooltip: 'Generates rhythmic triggers at specified BPM. Includes tap tempo, subdivisions, and adjustable gate length for precise timing.',

    elements: {
        bpmControl: null,
        gateControl: null,
        displayEl: null
    },
    values: {
        bpm: 120,
        gateLength: 0.5
    },
    runtimeState: {
        startTime: 0,
        lastBeat: -1,
        tapTimes: [],
        isRunning: false,
        animationFrameId: null,
        gateTimeout: null
    },

    input: {
        'startStop': {
            label: 'Start/Stop',
            type: 'action',
            control: {},
            downCallback(){
                this.runtimeState.isRunning = !this.runtimeState.isRunning

                if(this.runtimeState.isRunning){
                    this.runtimeState.startTime = performance.now()
                    this.runtimeState.lastBeat = -1
                    this.runtimeState.animationFrameId = requestAnimationFrame((t) => this._run(t))
                } else {
                    if(this.runtimeState.animationFrameId){
                        cancelAnimationFrame(this.runtimeState.animationFrameId)
                    }
                    if(this.runtimeState.gateTimeout){
                        clearTimeout(this.runtimeState.gateTimeout)
                        this.triggerAction('trigger', 'up')
                    }
                }
                this._updateDisplay()
            }
        },
        'reset': {
            label: 'Reset',
            type: 'action',
            control: {},
            downCallback(){
                this.runtimeState.startTime = performance.now()
                this.runtimeState.lastBeat = -1
                this._updateDisplay()
            }
        },
        'tap': {
            label: 'Tap Tempo',
            type: 'action',
            control: {},
            downCallback(){
                this._handleTap()
            }
        }
    },

    options: {
        'subdivision': {
            label: 'Subdivision',
            type: 'select',
            default: '1',
            choices: [
                {value: '4', name: 'Whole Note'},
                {value: '2', name: 'Half Note'},
                {value: '1', name: 'Quarter Note'},
                {value: '0.5', name: 'Eighth Note'},
                {value: '0.25', name: 'Sixteenth Note'},
                {value: '0.333', name: 'Triplet'},
                {value: '0.125', name: '32nd Note'}
            ]
        }
    },

    output: {
        'trigger': {
            label: 'Trigger',
            type: 'action'
        }
    },

    _run(timestamp){
        if(!this.runtimeState.isRunning || this.isDestroyed){return}

        const subdivision = parseFloat(this.getOption('subdivision'))
        const beatsPerSecond = this.values.bpm / 60
        const timePerBeat = (1000 / beatsPerSecond) * subdivision

        const elapsed = timestamp - this.runtimeState.startTime
        const currentBeat = Math.floor(elapsed / timePerBeat)

        // Trigger on new beat
        if(currentBeat !== this.runtimeState.lastBeat){
            this.runtimeState.lastBeat = currentBeat

            // Clear previous gate
            if(this.runtimeState.gateTimeout){
                clearTimeout(this.runtimeState.gateTimeout)
                this.triggerAction('trigger', 'up')
            }

            // Trigger down
            this.triggerAction('trigger', 'down')

            // Schedule up based on gate length
            const gateTime = timePerBeat * this.values.gateLength
            if(this.values.gateLength < 0.99){
                this.runtimeState.gateTimeout = setTimeout(() => {
                    this.triggerAction('trigger', 'up')
                }, gateTime)
            }

            this._updateDisplay()
        }

        this.runtimeState.animationFrameId = requestAnimationFrame((t) => this._run(t))
    },

    _handleTap(){
        const now = performance.now()

        // Add current tap time
        this.runtimeState.tapTimes.push(now)

        // Keep only taps from last 2 seconds
        this.runtimeState.tapTimes = this.runtimeState.tapTimes.filter(t => now - t < 2000)

        // Calculate BPM from tap intervals
        if(this.runtimeState.tapTimes.length >= 2){
            let totalInterval = 0
            for(let i = 1; i < this.runtimeState.tapTimes.length; i++){
                totalInterval += this.runtimeState.tapTimes[i] - this.runtimeState.tapTimes[i-1]
            }
            const avgInterval = totalInterval / (this.runtimeState.tapTimes.length - 1)
            const bpm = Math.round(60000 / avgInterval)  // Convert ms to BPM

            if(bpm > 20 && bpm < 300){
                this.values.bpm = bpm
                if(this.elements.bpmControl){
                    this.elements.bpmControl.value = bpm
                }
                this._updateDisplay()
            }
        }
    },

    _updateDisplay(){
        if(this.elements.displayEl){
            const beat = this.runtimeState.lastBeat
            const subdivision = parseFloat(this.getOption('subdivision'))
            const subdivisionName = subdivision === 4 ? '𝅝' :
                                   subdivision === 2 ? '𝅗𝅥' :
                                   subdivision === 1 ? '♩' :
                                   subdivision === 0.5 ? '♪' :
                                   subdivision === 0.25 ? '♬' : '♫'
            this.elements.displayEl.textContent = `${this.values.bpm} BPM ${subdivisionName} Beat: ${beat} ${this.runtimeState.isRunning ? '▶' : '⏸'}`
        }
    },

    onCreate(){
        if(!this.customArea){return}

        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">BPM</label>
                    <s-number midi-disabled value="${this.values.bpm}" default="${this.defaults.bpm}" min="20" max="300" step="1" data-el="bpmControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center;">
                    <label style="font-size:0.9rem; color:#ccc;">Gate</label>
                    <s-number midi-disabled value="${this.values.gateLength}" default="${this.defaults.gateLength}" min="0.1" max="1.0" step="0.05" data-el="gateControl"></s-number>
                </div>
                <div style="text-align:center; font-size:0.9rem; color:#fff; padding:0.5rem; background:#333; border-radius:4px;" data-el="displayEl">
                    ${this.values.bpm} BPM ♩ Beat: 0 ▶
                </div>
            </div>
        `

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        // Add listeners
        this.elements.bpmControl.addEventListener('input', (e) => {
            this.values.bpm = parseFloat(e.target.value)
            this._updateDisplay()
        })

        this.elements.gateControl.addEventListener('input', (e) => {
            this.values.gateLength = parseFloat(e.target.value)
        })

        // Start running automatically
        this.runtimeState.isRunning = true
        this.runtimeState.startTime = performance.now()
        this.runtimeState.animationFrameId = requestAnimationFrame((t) => this._run(t))
        this._updateDisplay()
    },

    onDestroy(){
        if(this.runtimeState.animationFrameId){
            cancelAnimationFrame(this.runtimeState.animationFrameId)
        }
        if(this.runtimeState.gateTimeout){
            clearTimeout(this.runtimeState.gateTimeout)
        }
    }
})