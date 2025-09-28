import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'
import {RealtimeGraph} from '../realtimeGraph.js'
import {PhaseAccumulator} from '../phaseAccumulator.js'

registerNode({
    slug: 'animation',
    icon: '🐰',
    label: 'Animation',
    tooltip: 'Animates between start and end values over specified duration in seconds. Multiple easing curves and loop modes available.',
    
    elements: {
        startControl: null,
        endControl: null,
        durationControl: null,
        graphCanvas: null
    },
    values: {
        startValue: 0.0,
        endValue: 1.0,
        duration: 1.0,
        isRunning: false
    },
    runtimeState: {
        startTime: -1,
        isPaused: false,
        pausedAt: 0,
        graph: null,
        phaseAccumulator: null
    },
    
    input: {
        'startStop': {
            label: 'Start/Stop',
            type: 'action',
            control: {},
            downCallback(){
                this._toggleAnimation()
            }
        },
        'restart': {
            label: 'Restart',
            type: 'action',
            control: {},
            downCallback(){
                this._restartAnimation()
            }
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            range: '[start, end]',
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
        if(!this.values.isRunning){
            return this.values.startValue
        }
        
        // Initialize phase accumulator if needed
        if(!this.runtimeState.phaseAccumulator){
            this.runtimeState.phaseAccumulator = new PhaseAccumulator({
                initialSpeed: 1.0 / this.values.duration,
                transitionDuration: 0.05, // 50ms for very smooth transitions
                minSpeed: -10.0,
                maxSpeed: 10.0
            })
        }

        // Update phase with current speed (1/duration)
        // Prevent division by zero and ensure minimum duration
        const safeDuration = Math.max(this.values.duration, 0.01)
        const speed = 1.0 / safeDuration
        const phase = this.runtimeState.phaseAccumulator.update(speed)
        
        const startVal = this.values.startValue
        const endVal = this.values.endValue
        
        const approachCurve = this.getOption('approach_curve')
        const returnCurve = this.getOption('return_curve')
        
        // Calculate cycle progress using phase (duration is now 1.0 by convention)
        const totalProgress = phase
        let t = 0
        let isApproaching = true
        
        // Handle different return curve behaviors
        if(returnCurve === 'stay'){
            // Once mode - clamp at end
            t = Math.min(totalProgress % 1, 1)
            if(totalProgress >= 1) t = 1
        } else if(returnCurve === 'jump'){
            // Loop mode - jump back to start
            t = totalProgress % 1
        } else {
            // Ping-pong modes with actual return curves
            const cycleProgress = totalProgress % 2
            if(cycleProgress <= 1){
                // Approaching (first half of cycle)
                t = cycleProgress
                isApproaching = true
            } else {
                // Returning (second half of cycle)
                t = cycleProgress - 1
                isApproaching = false
            }
        }
        
        // Apply appropriate curve
        const curveType = isApproaching ? approachCurve : returnCurve
        let tweened = this._applyCurve(t, curveType)
        
        // Invert for return phase
        if(!isApproaching){
            tweened = 1 - tweened
        }
        
        return startVal + (endVal - startVal) * tweened
    },
    
    _applyCurve(t, curveType){
        switch(curveType){
            case 'linear':
                return t
            case 'smooth':
                return -(Math.cos(Math.PI * t) - 1.0) / 2.0
            case 'ease_in':
                return t * t
            case 'ease_out':
                return Math.sin((t * Math.PI) / 2.0)
            case 'jump':
            case 'stay':
                // These are handled in _getCurrentValue logic, just return linear
                return t
            default:
                return t
        }
    },
    
    _toggleAnimation(){
        if(!this.values.isRunning){
            // Start animation
            this.values.isRunning = true
            if(this.runtimeState.phaseAccumulator){
                this.runtimeState.phaseAccumulator.resume()
            }
        } else {
            // If running and in Stay mode, restart instead of pause
            const returnCurve = this.getOption('return_curve')
            if(returnCurve === 'stay'){
                this._restartAnimation()
            } else {
                // Pause animation
                this.values.isRunning = false
                if(this.runtimeState.phaseAccumulator){
                    this.runtimeState.phaseAccumulator.pause()
                }
            }
        }
    },
    
    _restartAnimation(){
        this.values.isRunning = true
        if(this.runtimeState.phaseAccumulator){
            this.runtimeState.phaseAccumulator.resetPhase(0)
            this.runtimeState.phaseAccumulator.resume()
        }
    },
    
    
    onCreate(){
        if(!this.customArea){return}
        
        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Start Value</label>
                    <s-number value="${this.values.startValue}" default="${this.defaults.startValue}" min="-1000.0" max="1000.0" step="0.01" data-el="startControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">End Value</label>
                    <s-number value="${this.values.endValue}" default="${this.defaults.endValue}" min="-1000.0" max="1000.0" step="0.01" data-el="endControl"></s-number>
                </div>
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Duration</label>
                    <s-number value="${this.values.duration}" default="1.0" min="0.1" max="10.0" step="0.01" unit="s" data-el="durationControl"></s-number>
                </div>
                <canvas data-el="graphCanvas" width="320" height="120" style="width:100%; height:120px; border:1px solid #555; background:#222; margin-top:0.5rem; border-radius: 4px;"></canvas>
            </div>
        `
        
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)
        
        // Add listeners to update values when controls change
        // Use 'input' event for live updates (including MIDI)
        this.elements.startControl.addEventListener('input', (e) => {
            this.values.startValue = parseFloat(e.target.value)
            this._updateGraphScale()
        })
        this.elements.endControl.addEventListener('input', (e) => {
            this.values.endValue = parseFloat(e.target.value)
            this._updateGraphScale()
        })
        this.elements.durationControl.addEventListener('input', (e) => {
            this.values.duration = parseFloat(e.target.value)
        })
        
        // Initialize graph
        const minVal = Math.min(this.values.startValue, this.values.endValue)
        const maxVal = Math.max(this.values.startValue, this.values.endValue)
        this.runtimeState.graph = new RealtimeGraph(this.elements.graphCanvas, {
            historySize: 200,
            gridLines: 4,
            gridSpacing: 40,
            minValue: minVal,
            maxValue: maxVal,
            autoScale: false
        })
        
        // Start animation loop for graph updates
        this.runtimeState.graph.startAnimation(() => this._getCurrentValue())
        
        // Auto-restart if was running when saved
        if(this.values.isRunning){
            this.runtimeState.startTime = performance.now() / 1000
            this.runtimeState.isPaused = false
        }
    },
    
    _updateGraphScale(){
        if(this.runtimeState.graph){
            const minVal = Math.min(this.values.startValue, this.values.endValue)
            const maxVal = Math.max(this.values.startValue, this.values.endValue)
            this.runtimeState.graph.setOptions({
                minValue: minVal,
                maxValue: maxVal
            })
        }
    },
    
    onDestroy(){
        if(this.runtimeState.graph){
            this.runtimeState.graph.destroy()
        }
        // Phase accumulator will be garbage collected, no explicit cleanup needed
        this.runtimeState.phaseAccumulator = null
    },
    
    options: {
        'approach_curve': {
            label: 'Approach Curve',
            type: 'select',
            default: 'smooth',
            choices: [
                {value: 'linear', name: 'Linear'},
                {value: 'smooth', name: 'Smooth'},
                {value: 'ease_in', name: 'Ease-in'},
                {value: 'ease_out', name: 'Ease-out'}
            ]
        },
        'return_curve': {
            label: 'Return Curve',
            type: 'select',
            default: 'smooth',
            choices: [
                {value: 'linear', name: 'Linear'},
                {value: 'smooth', name: 'Smooth'},
                {value: 'ease_in', name: 'Ease-in'},
                {value: 'ease_out', name: 'Ease-out'},
                {value: 'jump', name: 'Jump'},
                {value: 'stay', name: 'Stay'}
            ]
        }
    }
})