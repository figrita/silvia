import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'
import {RealtimeGraph} from '../realtimeGraph.js'
import {PhaseAccumulator} from '../phaseAccumulator.js'

registerNode({
    slug: 'automation',
    icon: '📈',
    label: 'Automation',
    tooltip: 'Records and plays back automation curves (with or without MIDI).',
    elements: {
        inputControl: null,
        durationControl: null,
        startTrimControl: null,
        minControl: null,
        maxControl: null,
        graphCanvas: null,
        statusLabel: null
    },
    values: {
        inputValue: 0.5,
        duration: 4.0,
        startTrim: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        isRecording: false,
        isPlaying: false,
        automationData: [], // Array of {time, value} points
        recordStartTime: 0
    },
    runtimeState: {
        phaseAccumulator: null,
        graph: null,
        lastInputValue: null,
        recordingTimeout: null
    },

    input: {
        'toggleRecord': {
            label: 'Start/Stop Recording',
            type: 'action',
            control: {},
            downCallback(){
                this._toggleRecord()
            }
        },
        'togglePlay': {
            label: 'Play/Pause Automation',
            type: 'action',
            control: {},
            downCallback(){
                this._togglePlay()
            }
        },
        'restart': {
            label: 'Restart from Beginning',
            type: 'action',
            control: {},
            downCallback(){
                this._retrigger()
            }
        },
        'clear': {
            label: 'Clear Automation Data',
            type: 'action',
            control: {},
            downCallback(){
                this._clearAutomation()
            }
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            range: '[min, max]',
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed){return}
                const location = gl.getUniformLocation(program, uniformName)
                const value = this._getCurrentValue()
                gl.uniform1f(location, value)
            }
        }
    },

    _getCurrentValue(){
        if(!this.values.isPlaying || this.values.automationData.length === 0){
            // When not playing, lerp input value (0-1) to min-max range
            return this.values.minValue + this.values.inputValue * (this.values.maxValue - this.values.minValue)
        }

        // Initialize phase accumulator if needed
        if(!this.runtimeState.phaseAccumulator){
            this.runtimeState.phaseAccumulator = new PhaseAccumulator({
                initialSpeed: 1.0 / this.values.duration,
                transitionDuration: 0.05,
                minSpeed: -10.0,
                maxSpeed: 10.0
            })
        }

        // Update phase with current speed (1/duration)
        const safeDuration = Math.max(this.values.duration, 0.01)
        const speed = 1.0 / safeDuration
        const phase = this.runtimeState.phaseAccumulator.update(speed)

        const loopMode = this.getOption('loop_mode')
        let normalizedTime = 0

        if(loopMode === 'once'){
            normalizedTime = Math.min(phase, 1.0)
            if(phase >= 1.0){
                // Stop playing when reached end
                this.values.isPlaying = false
                this._updateUI()
            }
        } else if(loopMode === 'loop'){
            normalizedTime = phase % 1.0
        }

        // Interpolate automation curve at normalized time and lerp to min-max range
        const normalizedValue = this._interpolateAutomation(normalizedTime)
        return this.values.minValue + normalizedValue * (this.values.maxValue - this.values.minValue)
    },

    _interpolateAutomation(normalizedTime){
        if(this.values.automationData.length === 0){
            return 0.0 // Return normalized 0 when no data
        }

        // Apply start trim - adjust the time range
        const effectiveDuration = this.values.duration - this.values.startTrim
        const targetTime = this.values.startTrim + normalizedTime * effectiveDuration

        // Find surrounding points
        let leftPoint = null
        let rightPoint = null

        for(let i = 0; i < this.values.automationData.length; i++){
            const point = this.values.automationData[i]
            if(point.time <= targetTime){
                leftPoint = point
            }
            if(point.time >= targetTime && !rightPoint){
                rightPoint = point
                break
            }
        }

        // Handle edge cases
        if(!leftPoint && !rightPoint){
            return 0.0 // Return normalized 0 when no data
        }
        if(!leftPoint){
            return rightPoint.value
        }
        if(!rightPoint){
            return leftPoint.value
        }
        if(leftPoint === rightPoint){
            return leftPoint.value
        }

        // Linear interpolation between points
        const timeDiff = rightPoint.time - leftPoint.time
        const valueDiff = rightPoint.value - leftPoint.value
        const t = (targetTime - leftPoint.time) / timeDiff

        return leftPoint.value + t * valueDiff
    },

    _toggleRecord(){
        if(this.values.isRecording){
            this._stopRecording()
        } else {
            this._startRecording()
        }
    },

    _startRecording(){
        this.values.isRecording = true
        this.values.isPlaying = false
        this.values.automationData = []
        this.values.recordStartTime = performance.now() / 1000

        // Set up timeout to auto-stop recording after duration
        this.runtimeState.recordingTimeout = setTimeout(() => {
            if(this.values.isRecording){
                this._stopRecording()
            }
        }, this.values.duration * 1000)

        this._updateUI()

        // Start monitoring input changes
        this._monitorInput()
    },

    _stopRecording(){
        this.values.isRecording = false

        if(this.runtimeState.recordingTimeout){
            clearTimeout(this.runtimeState.recordingTimeout)
            this.runtimeState.recordingTimeout = null
        }

        this._updateUI()
        this._updateGraph()
    },

    _monitorInput(){
        if(!this.values.isRecording){
            return
        }

        const inputValue = this.values.inputValue

        if(inputValue !== this.runtimeState.lastInputValue){
            const currentTime = performance.now() / 1000
            const relativeTime = currentTime - this.values.recordStartTime

            if(relativeTime <= this.values.duration){
                // Store normalized input value (0-1 range)
                const normalizedValue = Math.max(0.0, Math.min(1.0, inputValue))

                this.values.automationData.push({
                    time: relativeTime,
                    value: normalizedValue
                })

                this.runtimeState.lastInputValue = inputValue
            }
        }

        // Continue monitoring
        if(this.values.isRecording){
            requestAnimationFrame(() => this._monitorInput())
        }
    },

    _togglePlay(){
        if(this.values.isPlaying){
            this._stopPlaying()
        } else {
            this._startPlaying()
        }
    },

    _startPlaying(){
        if(this.values.automationData.length === 0){
            return // Nothing to play
        }

        this.values.isPlaying = true
        this.values.isRecording = false

        // Reset phase accumulator
        if(this.runtimeState.phaseAccumulator){
            this.runtimeState.phaseAccumulator.resetPhase(0)
            this.runtimeState.phaseAccumulator.resume()
        }

        this._updateUI()
    },

    _stopPlaying(){
        this.values.isPlaying = false

        if(this.runtimeState.phaseAccumulator){
            this.runtimeState.phaseAccumulator.pause()
        }

        this._updateUI()
    },

    _retrigger(){
        if(this.values.automationData.length === 0){
            return
        }

        // Reset and start playing
        if(this.runtimeState.phaseAccumulator){
            this.runtimeState.phaseAccumulator.resetPhase(0)
            this.runtimeState.phaseAccumulator.resume()
        }

        this.values.isPlaying = true
        this._updateUI()
    },

    _clearAutomation(){
        this.values.automationData = []
        this.values.isRecording = false
        this.values.isPlaying = false

        if(this.runtimeState.recordingTimeout){
            clearTimeout(this.runtimeState.recordingTimeout)
            this.runtimeState.recordingTimeout = null
        }

        this._updateUI()
        this._updateGraph()
    },

    _updateUI(){
        if(!this.elements.statusLabel){
            return
        }

        // Update status
        let status = 'Ready'
        if(this.values.isRecording){
            status = 'Recording...'
        } else if(this.values.isPlaying){
            status = 'Playing'
        } else if(this.values.automationData.length > 0){
            status = `${this.values.automationData.length} points recorded`
        }
        this.elements.statusLabel.textContent = status
    },

    _updateGraph(){
        if(!this.runtimeState.graph){
            return
        }

        // Clear graph history when automation data changes
        this.runtimeState.graph.clearHistory()
    },

    onCreate(){
        if(!this.customArea){return}

        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div style="font-size:0.8rem; color:#888; text-align:center; padding:0.25rem;" data-el="statusLabel">Ready</div>

                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Input Value</label>
                    <s-number value="${this.values.inputValue}" default="0.5" min="0.0" max="1.0" step="0.01" data-el="inputControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Duration</label>
                    <s-number value="${this.values.duration}" default="4.0" min="0.1" max="60.0" step="0.1" unit="s" data-el="durationControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Start Trim</label>
                    <s-number value="${this.values.startTrim}" default="0.0" min="0.0" max="${this.values.duration}" step="0.01" unit="s" data-el="startTrimControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Min Value</label>
                    <s-number value="${this.values.minValue}" default="0.0" min="-10.0" max="10.0" step="0.01" data-el="minControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Max Value</label>
                    <s-number value="${this.values.maxValue}" default="1.0" min="-10.0" max="10.0" step="0.01" data-el="maxControl"></s-number>
                </div>

                <canvas data-el="graphCanvas" width="320" height="120" style="width:100%; height:120px; border:1px solid #555; background:#222; margin-top:0.5rem; border-radius: 4px;"></canvas>
            </div>
        `

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        // Add event listeners
        this.elements.inputControl.addEventListener('input', (e) => {
            this.values.inputValue = parseFloat(e.target.value)
        })
        this.elements.durationControl.addEventListener('input', (e) => {
            this.values.duration = parseFloat(e.target.value)
            this._updateStartTrimMax()
        })
        this.elements.startTrimControl.addEventListener('input', (e) => {
            this.values.startTrim = parseFloat(e.target.value)
        })
        this.elements.minControl.addEventListener('input', (e) => {
            this.values.minValue = parseFloat(e.target.value)
            this._updateGraphScale()
        })
        this.elements.maxControl.addEventListener('input', (e) => {
            this.values.maxValue = parseFloat(e.target.value)
            this._updateGraphScale()
        })

        // Initialize graph
        this.runtimeState.graph = new RealtimeGraph(this.elements.graphCanvas, {
            historySize: 200,
            gridLines: 4,
            gridSpacing: 40,
            minValue: this.values.minValue,
            maxValue: this.values.maxValue,
            autoScale: false
        })

        // Start animation loop for graph updates
        this.runtimeState.graph.startAnimation(() => {
            return this._getCurrentValue()
        })

        this._updateUI()
        this._updateStartTrimMax()
    },

    _updateGraphScale(){
        if(this.runtimeState.graph){
            this.runtimeState.graph.setOptions({
                minValue: this.values.minValue,
                maxValue: this.values.maxValue
            })
        }
    },

    _updateStartTrimMax(){
        if(this.elements.startTrimControl){
            // Start trim can go up to the full duration
            const maxTrim = this.values.duration
            this.elements.startTrimControl.max = maxTrim
            // Clamp current value if it exceeds new max
            if(this.values.startTrim > maxTrim){
                this.values.startTrim = maxTrim
                this.elements.startTrimControl.value = maxTrim
            }
        }
    },

    onDestroy(){
        if(this.runtimeState.graph){
            this.runtimeState.graph.destroy()
        }
        if(this.runtimeState.recordingTimeout){
            clearTimeout(this.runtimeState.recordingTimeout)
        }
        this.runtimeState.phaseAccumulator = null
    },

    options: {
        'loop_mode': {
            label: 'Loop Mode',
            type: 'select',
            default: 'loop',
            choices: [
                {value: 'once', name: 'Once'},
                {value: 'loop', name: 'Loop'}
            ]
        }
    }
})