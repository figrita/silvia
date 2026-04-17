import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'stepsequencer',
    icon: '🎹',
    label: 'Step Sequencer',
    tooltip: 'Multi-step sequencer with programmable patterns. Set values for each step and control playback speed.',
    elements: {
        grid: null,
        runButton: null,
        resetButton: null,
        clearButton: null,
        bpmControl: null,
        gateControl: null
    },
    values: {
        stepStates: Array(4).fill(null).map(() => Array(16).fill(false)),
        bpm: 120,
        gateLength: 0.5
    },
    runtimeState: {
        isRunning: false,
        currentStep: -1,
        startTime: 0,  // When the sequencer started
        lastStepIndex: -1,  // Track the last step we triggered
        animationFrameId: null,
        gateTimeouts: [],  // Track gate release timeouts
        stepEls: null,  // Cached DOM refs: stepEls[step] = array of 4 lane elements
        prevPlayheadStep: -1
    },

    input: {
        'startStop': {label: 'Start/Stop', type: 'action', control: {}, downCallback(){this._toggleRunning()}},
        'reset': {label: 'Reset', type: 'action', control: {}, downCallback(){this._resetSequence()}},
        'step': {label: 'Step', type: 'action', control: {}, downCallback(){this._manualStep()}}
    },
    output: {
        'lane1': {label: 'Lane 1', type: 'action'},
        'lane2': {label: 'Lane 2', type: 'action'},
        'lane3': {label: 'Lane 3', type: 'action'},
        'lane4': {label: 'Lane 4', type: 'action'}
    },

    onCreate(){
        if(!this.customArea){return}
        this._createUI()

        // Initialize UI from values (which may have been loaded from a patch)
        for(let lane = 0; lane < 4; lane++){
            for(let step = 0; step < 16; step++){
                if(this.values.stepStates[lane][step]){
                    this.elements.grid.querySelector(`[data-lane="${lane}"][data-step="${step}"]`).classList.add('active')
                }
            }
        }

        this._addEventListeners()
    },

    _prepareForTime(virtualTime, fps){
        if(!this.runtimeState.isRunning) return

        // Invariants maintained across calls:
        //   _lastAbsoluteStep : last step whose _executeCurrentStep() has been run (-1 before any)
        //   _lastGateUpStep   : last step whose gate-up has been emitted (-1 before any)
        //   _laneActive       : always reflects the lane states of _lastAbsoluteStep
        // Branches handle: (1) carry-over gate-up for the prior frame's step,
        // (2) intermediate steps skipped between frames, (3) gate-up for the current step.
        const bpm = this.values.bpm
        const timePerStep = 60 / bpm / 4
        const gateLength = this.values.gateLength
        const hasGate = gateLength < 0.99
        const absoluteStep = Math.floor(virtualTime / timePerStep)

        if(this.runtimeState._lastAbsoluteStep === undefined) this.runtimeState._lastAbsoluteStep = -1
        if(this.runtimeState._lastGateUpStep === undefined) this.runtimeState._lastGateUpStep = -1

        // Carry-over: fire gate-up for the previous frame's step if its time has now passed
        if(hasGate && this.runtimeState._lastAbsoluteStep >= 0 &&
           this.runtimeState._lastGateUpStep < this.runtimeState._lastAbsoluteStep){
            const gateUpTime = this.runtimeState._lastAbsoluteStep * timePerStep + gateLength * timePerStep
            if(virtualTime >= gateUpTime){
                for(let lane = 0; lane < 4; lane++){
                    if(this.runtimeState._laneActive?.[lane]) this.triggerAction(`lane${lane + 1}`, 'up')
                }
                this.runtimeState._lastGateUpStep = this.runtimeState._lastAbsoluteStep
            }
        }

        if(absoluteStep > this.runtimeState._lastAbsoluteStep){
            const from = this.runtimeState._lastAbsoluteStep + 1
            for(let s = from; s <= absoluteStep; s++){
                // Before executing step s, _laneActive reflects step s-1.
                // Close gate for s-1 if not yet done.
                if(hasGate && this.runtimeState._lastGateUpStep < s - 1){
                    for(let lane = 0; lane < 4; lane++){
                        if(this.runtimeState._laneActive?.[lane]) this.triggerAction(`lane${lane + 1}`, 'up')
                    }
                    this.runtimeState._lastGateUpStep = s - 1
                }
                this.runtimeState.currentStep = s % 16
                this._executeCurrentStep() // updates _laneActive to step s
                // Close gate for step s if it's a fully-past step
                if(hasGate && s < absoluteStep){
                    for(let lane = 0; lane < 4; lane++){
                        if(this.runtimeState._laneActive?.[lane]) this.triggerAction(`lane${lane + 1}`, 'up')
                    }
                    this.runtimeState._lastGateUpStep = s
                }
            }
            // Close gate for absoluteStep if its gate-up time is before virtualTime
            if(hasGate && this.runtimeState._lastGateUpStep < absoluteStep){
                const gateUpTime = absoluteStep * timePerStep + gateLength * timePerStep
                if(virtualTime >= gateUpTime){
                    for(let lane = 0; lane < 4; lane++){
                        if(this.runtimeState._laneActive?.[lane]) this.triggerAction(`lane${lane + 1}`, 'up')
                    }
                    this.runtimeState._lastGateUpStep = absoluteStep
                }
            }
            this.runtimeState._lastAbsoluteStep = absoluteStep
            this.runtimeState.lastStepIndex = this.runtimeState.currentStep
        }
    },

    _suspendRealtimeLoops(){
        if(this.runtimeState.animationFrameId){
            cancelAnimationFrame(this.runtimeState.animationFrameId)
            this.runtimeState.animationFrameId = null
        }
        for(let i = 0; i < this.runtimeState.gateTimeouts.length; i++) clearTimeout(this.runtimeState.gateTimeouts[i])
        this.runtimeState.gateTimeouts.length = 0
        // Force-start for offline and save previous state
        this.runtimeState._wasRunning = this.runtimeState.isRunning
        this.runtimeState.isRunning = true
        this.runtimeState.currentStep = -1
        this.runtimeState.lastStepIndex = -1
        this.runtimeState._lastAbsoluteStep = -1
        this.runtimeState._lastGateUpStep = -1
        this.runtimeState._laneActive = [false, false, false, false]
        this.runtimeState._isOffline = true
    },

    _resumeRealtimeLoops(){
        this.runtimeState._isOffline = false
        this.runtimeState.isRunning = this.runtimeState._wasRunning ?? this.runtimeState.isRunning
        if(this.runtimeState.isRunning){
            this.runtimeState.startTime = performance.now()
            if(this.runtimeState.currentStep >= 0){
                const bpm = this.values.bpm
                const timePerStep = (60 / bpm / 4) * 1000
                this.runtimeState.startTime -= this.runtimeState.currentStep * timePerStep
            }
            this.runtimeState.lastStepIndex = this.runtimeState.currentStep
            this.runtimeState.animationFrameId = requestAnimationFrame((t) => this._run(t))
        }
    },

    onDestroy(){
        if(this.runtimeState.animationFrameId){
            cancelAnimationFrame(this.runtimeState.animationFrameId)
        }
        // Clear any pending gate timeouts
        for(let i = 0; i < this.runtimeState.gateTimeouts.length; i++) clearTimeout(this.runtimeState.gateTimeouts[i])
        this.runtimeState.gateTimeouts.length = 0
    },

    _run(timestamp){
        if(!this.runtimeState.isRunning || this.isDestroyed){return}

        const bpm = this.values.bpm
        // Time per 16th note step in milliseconds
        const timePerStep = (60 / bpm / 4) * 1000
        
        // Calculate current step from elapsed time
        const elapsedTime = timestamp - this.runtimeState.startTime
        const targetStepIndex = Math.floor(elapsedTime / timePerStep) % 16
        
        // Only trigger if we've moved to a new step
        if(targetStepIndex !== this.runtimeState.lastStepIndex){
            this.runtimeState.currentStep = targetStepIndex
            this.runtimeState.lastStepIndex = targetStepIndex
            
            this._executeCurrentStep()
        }

        this.runtimeState.animationFrameId = requestAnimationFrame((t) => this._run(t))
    },

    _executeCurrentStep(){
        this._updatePlayhead()

        // Clear any previous gate timeouts
        for(let i = 0; i < this.runtimeState.gateTimeouts.length; i++) clearTimeout(this.runtimeState.gateTimeouts[i])
        this.runtimeState.gateTimeouts.length = 0

        const gateLength = this.values.gateLength
        const bpm = this.values.bpm
        const timePerStep = (60 / bpm / 4) * 1000
        const gateTime = timePerStep * gateLength
        const step = this.runtimeState.currentStep

        for(let lane = 0; lane < 4; lane++){
            const wasActive = this.runtimeState._laneActive?.[lane] ?? false
            const isActive = this.values.stepStates[lane][step]

            if(wasActive && !isActive){
                // Lane becoming inactive — release gate
                this.triggerAction(`lane${lane + 1}`, 'up')
            }

            if(isActive && !wasActive){
                // Lane becoming active — trigger gate
                this.triggerAction(`lane${lane + 1}`, 'down')
            }
            // Lane staying active: no up/down cycle, gate remains held

            // Offline render path manages gate-up via _prepareForTime's virtual-time
            // logic; setTimeout would fire at wall-clock and emit spurious gate-ups.
            if(isActive && gateLength < 0.99 && !this.runtimeState._isOffline){
                // Schedule gate release within the step
                const timeout = setTimeout(() => {
                    this.triggerAction(`lane${lane + 1}`, 'up')
                }, gateTime)
                this.runtimeState.gateTimeouts.push(timeout)
            }
        }

        // Track active lanes for next step comparison
        if(!this.runtimeState._laneActive){
            this.runtimeState._laneActive = [false, false, false, false]
        }
        for(let lane = 0; lane < 4; lane++){
            this.runtimeState._laneActive[lane] = this.values.stepStates[lane][step]
        }
    },

    _manualStep(){
        // If not running, manually advance to the next step
        if(!this.runtimeState.isRunning){
            // Advance to next step
            this.runtimeState.currentStep = (this.runtimeState.currentStep + 1) % 16
            this._executeCurrentStep()
        } else {
            // If running, reset the timing to sync with the manual step
            this.runtimeState.currentStep = (this.runtimeState.currentStep + 1) % 16
            this.runtimeState.lastStepIndex = this.runtimeState.currentStep
            
            // Reset start time to keep in sync
            const bpm = this.values.bpm
            const timePerStep = (60 / bpm / 4) * 1000
            this.runtimeState.startTime = performance.now() - (this.runtimeState.currentStep * timePerStep)
            
            this._executeCurrentStep()
        }
    },

    _toggleRunning(){
        this.runtimeState.isRunning = !this.runtimeState.isRunning
        this.elements.runButton.textContent = this.runtimeState.isRunning ? 'Stop' : 'Start'
        
        if(!this.runtimeState.isRunning){
            // Clear any pending gate timeouts when stopping
            for(let i = 0; i < this.runtimeState.gateTimeouts.length; i++) clearTimeout(this.runtimeState.gateTimeouts[i])
            this.runtimeState.gateTimeouts.length = 0

            // Send up events for any lanes that might still be gated
            for(let lane = 0; lane < 4; lane++){
                this.triggerAction(`lane${lane + 1}`, 'up')
            }
        }
        
        if(this.runtimeState.isRunning){
            // Record the start time for drift-free timing
            this.runtimeState.startTime = performance.now()
            
            // If we're resuming from a stopped position, adjust start time to continue from current step
            if(this.runtimeState.currentStep >= 0){
                const bpm = this.values.bpm
                const timePerStep = (60 / bpm / 4) * 1000
                // Backdate the start time so we continue from the current step
                this.runtimeState.startTime -= this.runtimeState.currentStep * timePerStep
            }
            
            this.runtimeState.lastStepIndex = this.runtimeState.currentStep
            this.runtimeState.animationFrameId = requestAnimationFrame((t) => this._run(t))
        } else {
            if(this.runtimeState.animationFrameId){
                cancelAnimationFrame(this.runtimeState.animationFrameId)
            }
            this._updatePlayhead() // Update to show inactive state
        }
    },

    _resetSequence(){
        this.runtimeState.currentStep = -1
        this.runtimeState.lastStepIndex = -1
        
        // If running, reset the start time to now
        if(this.runtimeState.isRunning){
            this.runtimeState.startTime = performance.now()
        }
        
        this._updatePlayhead()
    },

    _createUI(){
        let gridHtml = ''
        for(let lane = 0; lane < 4; lane++){
            gridHtml += '<div class="seq-lane">'
            for(let step = 0; step < 16; step++){
                gridHtml += `<div class="seq-step" data-lane="${lane}" data-step="${step}"></div>`
            }
            gridHtml += '</div>'
        }

        const html = `
            <style>
                .seq-container { padding: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; }
                .seq-params { display: flex; gap: 1rem; margin-bottom: 0.5rem; align-items: center; }
                .seq-param { display: flex; align-items: center; gap: 0.5rem; }
                .seq-param label { font-size: 0.9rem; color: #ccc; }
                .seq-lane { display: flex; gap: 0.25rem; }
                .seq-step { width: 16px; height: 16px; background-color: #333; border: 1px solid #555; border-radius: 3px; cursor: pointer; }
                .seq-step:nth-child(4n+1) { background-color: #3d3d3d; }
                .seq-step.active { background-color: #a87; }
                .seq-step.playhead { box-shadow: 0 0 5px #fffc, inset 0 0 3px #fff8; border-color: #fff; }
                .seq-controls { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
                .seq-controls button { flex-grow: 1; font-family: monospace; background: #444; color: #ccc; border: 1px solid #666; padding: 5px; border-radius: 4px; cursor: pointer; }
                .seq-controls button:hover { background-color: #555; }
            </style>
            <div class="seq-container">
                <div class="seq-params">
                    <div class="seq-param">
                        <label>BPM</label>
                        <s-number midi-disabled value="${this.values.bpm}" default="${this.defaults.bpm}" min="20" max="300" step="1" data-el="bpmControl"></s-number>
                    </div>
                    <div class="seq-param">
                        <label>Gate</label>
                        <s-number midi-disabled value="${this.values.gateLength}" default="${this.defaults.gateLength}" min="0.1" max="1.0" step="0.05" data-el="gateControl"></s-number>
                    </div>
                </div>
                <div class="seq-grid" data-el="grid">${gridHtml}</div>
                <div class="seq-controls">
                    <button class="btn" data-el="runButton">Start</button>
                    <button class="btn" data-el="resetButton">Reset</button>
                    <button class="btn" data-el="clearButton">Clear</button>
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        // Cache step DOM refs — avoids querySelectorAll on every playhead update
        this.runtimeState.stepEls = new Array(16)
        for(let step = 0; step < 16; step++){
            this.runtimeState.stepEls[step] = this.elements.grid.querySelectorAll(`.seq-step[data-step="${step}"]`)
        }
    },

    _addEventListeners(){
        // Add listeners for BPM and Gate controls
        this.elements.bpmControl.addEventListener('input', (e) => {
            this.values.bpm = parseFloat(e.target.value)
        })
        
        this.elements.gateControl.addEventListener('input', (e) => {
            this.values.gateLength = parseFloat(e.target.value)
        })
        
        // Grid click handling
        this.elements.grid.addEventListener('click', (e) => {
            if(e.target.classList.contains('seq-step')){
                const {lane, step} = e.target.dataset
                const laneIdx = parseInt(lane, 10)
                const stepIdx = parseInt(step, 10)
                // Update the persistent state in `values`
                this.values.stepStates[laneIdx][stepIdx] = !this.values.stepStates[laneIdx][stepIdx]
                e.target.classList.toggle('active', this.values.stepStates[laneIdx][stepIdx])
            }
        })

        this.elements.runButton.addEventListener('click', () => this._toggleRunning())
        this.elements.resetButton.addEventListener('click', () => this._resetSequence())
        this.elements.clearButton.addEventListener('click', () => {
            // Update the persistent state in `values`
            this.values.stepStates = Array(4).fill(null).map(() => Array(16).fill(false))
            this.elements.grid.querySelectorAll('.seq-step.active').forEach(el => el.classList.remove('active'))
        })
    },

    _updatePlayhead(){
        const stepEls = this.runtimeState.stepEls
        const prev = this.runtimeState.prevPlayheadStep
        const cur = this.runtimeState.currentStep

        // Remove playhead from previous step (O(4) instead of full querySelectorAll)
        if(prev > -1 && stepEls[prev]){
            stepEls[prev].forEach(el => el.classList.remove('playhead'))
        }
        // Add playhead to current step
        if(cur > -1 && stepEls[cur]){
            stepEls[cur].forEach(el => el.classList.add('playhead'))
        }
        this.runtimeState.prevPlayheadStep = cur
    }
})