import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'euclideanrhythm',
    icon: '⚪',
    label: 'Euclidean Rhythm',
    tooltip: 'Generate Euclidean rhythms with beat count and rotation controls for each lane.',

    elements: {
        grid: null,
        runButton: null,
        resetButton: null,
        clearButton: null,
        bpmControl: null,
        gateControl: null
    },
    values: {
        bpm: 120,
        gateLength: 0.5,
        steps: 16,
        lanes: [
            {beats: 4, rotation: 0},
            {beats: 3, rotation: 0},
            {beats: 5, rotation: 0},
            {beats: 2, rotation: 0}
        ]
    },
    runtimeState: {
        isRunning: false,
        currentStep: -1,
        startTime: 0,
        lastStepIndex: -1,
        animationFrameId: null,
        gateTimeouts: [],
        patterns: [[], [], [], []],
        stepEls: null,  // Cached DOM refs: stepEls[step] = NodeList of lane elements
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

    // Writes pattern directly into dest array (no allocation)
    _generateEuclideanPattern(beats, steps, dest){
        if(beats === 0 || steps === 0){ dest.fill(false); return }
        if(beats >= steps){ dest.fill(true); return }

        dest.fill(false)
        let slope = beats / steps
        let error = 0

        for(let i = 0; i < steps; i++){
            error += slope
            if(error >= 1){
                dest[i] = true
                error -= 1
            }
        }
    },

    // Rotates src into dest in-place (no allocation)
    _rotatePattern(src, rotation, steps, dest){
        if(rotation === 0){
            for(let i = 0; i < steps; i++) dest[i] = src[i]
            return
        }
        for(let i = 0; i < steps; i++){
            dest[((i + rotation) % steps + steps) % steps] = src[i]
        }
    },

    _updatePatterns(){
        const steps = this.values.steps
        // Lazily allocate scratch + pattern arrays (reused across updates)
        if(!this._scratchPattern || this._scratchPattern.length !== steps){
            this._scratchPattern = new Array(steps)
            for(let lane = 0; lane < 4; lane++){
                this.runtimeState.patterns[lane] = new Array(steps)
            }
        }
        for(let lane = 0; lane < 4; lane++){
            const {beats, rotation} = this.values.lanes[lane]
            this._generateEuclideanPattern(beats, steps, this._scratchPattern)
            this._rotatePattern(this._scratchPattern, rotation, steps, this.runtimeState.patterns[lane])
        }
    },

    _run(timestamp){
        if(!this.runtimeState.isRunning || this.isDestroyed){return}

        const bpm = this.values.bpm
        const timePerStep = (60 / bpm / 4) * 1000

        const elapsedTime = timestamp - this.runtimeState.startTime
        const targetStepIndex = Math.floor(elapsedTime / timePerStep) % this.values.steps

        if(targetStepIndex !== this.runtimeState.lastStepIndex){
            this.runtimeState.currentStep = targetStepIndex
            this.runtimeState.lastStepIndex = targetStepIndex

            this._executeCurrentStep()
        }

        this.runtimeState.animationFrameId = requestAnimationFrame((t) => this._run(t))
    },

    _executeCurrentStep(){
        this._updatePlayhead()

        for(let i = 0; i < this.runtimeState.gateTimeouts.length; i++) clearTimeout(this.runtimeState.gateTimeouts[i])
        this.runtimeState.gateTimeouts.length = 0

        for(let lane = 0; lane < 4; lane++){
            this.triggerAction(`lane${lane + 1}`, 'up')
        }

        const gateLength = this.values.gateLength
        const bpm = this.values.bpm
        const timePerStep = (60 / bpm / 4) * 1000
        const gateTime = timePerStep * gateLength

        for(let lane = 0; lane < 4; lane++){
            if(this.runtimeState.patterns[lane][this.runtimeState.currentStep]){
                this.triggerAction(`lane${lane + 1}`, 'down')

                if(gateLength < 0.99){
                    const timeout = setTimeout(() => {
                        this.triggerAction(`lane${lane + 1}`, 'up')
                    }, gateTime)
                    this.runtimeState.gateTimeouts.push(timeout)
                }
            }
        }
    },

    _manualStep(){
        if(!this.runtimeState.isRunning){
            this.runtimeState.currentStep = (this.runtimeState.currentStep + 1) % this.values.steps
            this._executeCurrentStep()
        } else {
            this.runtimeState.currentStep = (this.runtimeState.currentStep + 1) % this.values.steps
            this.runtimeState.lastStepIndex = this.runtimeState.currentStep

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
            for(let i = 0; i < this.runtimeState.gateTimeouts.length; i++) clearTimeout(this.runtimeState.gateTimeouts[i])
            this.runtimeState.gateTimeouts.length = 0

            for(let lane = 0; lane < 4; lane++){
                this.triggerAction(`lane${lane + 1}`, 'up')
            }
        }

        if(this.runtimeState.isRunning){
            this.runtimeState.startTime = performance.now()

            if(this.runtimeState.currentStep >= 0){
                const bpm = this.values.bpm
                const timePerStep = (60 / bpm / 4) * 1000
                this.runtimeState.startTime -= this.runtimeState.currentStep * timePerStep
            }

            this.runtimeState.lastStepIndex = this.runtimeState.currentStep
            this.runtimeState.animationFrameId = requestAnimationFrame((t) => this._run(t))
        } else {
            if(this.runtimeState.animationFrameId){
                cancelAnimationFrame(this.runtimeState.animationFrameId)
            }
            this._updatePlayhead()
        }
    },

    _resetSequence(){
        this.runtimeState.currentStep = -1
        this.runtimeState.lastStepIndex = -1

        if(this.runtimeState.isRunning){
            this.runtimeState.startTime = performance.now()
        }

        this._updatePlayhead()
    },

    _createUI(){
        let gridHtml = ''

        // Create grid first (above controls)
        for(let lane = 0; lane < 4; lane++){
            gridHtml += `<div class="euc-lane" data-lane="${lane}">`
            for(let step = 0; step < this.values.steps; step++){
                gridHtml += `<div class="euc-step" data-lane="${lane}" data-step="${step}"></div>`
            }
            gridHtml += '</div>'
        }

        // Create lane controls separately
        let controlsHtml = ''
        for(let lane = 0; lane < 4; lane++){
            controlsHtml += `<div class="euc-lane-controls">`
            controlsHtml += `<div class="euc-lane-label">Lane ${lane + 1}</div>`
            controlsHtml += `<div class="euc-control-group">`
            controlsHtml += `<label>Beats</label>`
            controlsHtml += `<s-number value="${this.values.lanes[lane].beats}" default="${this.values.lanes[lane].beats}" min="0" max="16" step="1" data-lane="${lane}" data-param="beats"></s-number>`
            controlsHtml += `</div>`
            controlsHtml += `<div class="euc-control-group">`
            controlsHtml += `<label>Rotate</label>`
            controlsHtml += `<s-number value="${this.values.lanes[lane].rotation}" default="${this.values.lanes[lane].rotation}" min="-8" max="8" step="1" data-lane="${lane}" data-param="rotation"></s-number>`
            controlsHtml += `</div>`
            controlsHtml += `</div>`
        }

        const html = `
            <style>
                .euc-container { padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
                .euc-params { display: flex; gap: 1rem; margin-bottom: 0.5rem; align-items: center; }
                .euc-param { display: flex; align-items: center; gap: 0.5rem; }
                .euc-param label { font-size: 0.9rem; color: #ccc; }
                .euc-grid { margin: auto; }
                .euc-lane { display: flex; gap: 0.25rem; margin-bottom: 0.25rem; }
                .euc-lane-controls { display: flex; align-items: center; gap: 0.5rem; min-width: 200px; padding: 0.25rem; background: #333; border-radius: 3px; margin-bottom: 0.25rem; }
                .euc-lane-label { min-width: 50px; font-size: 0.8rem; color: #ccc; font-weight: bold; }
                .euc-control-group { display: flex; align-items: center; gap: 0.25rem; }
                .euc-control-group label { font-size: 0.7rem; color: #999; min-width: 30px; }
                .euc-step { width: 16px; height: 16px; background-color: #333; border: 1px solid #555; border-radius: 3px; }
                .euc-step:nth-child(4n+1) { background-color: #3d3d3d; }
                .euc-step.active { background-color: #a87; }
                .euc-step.playhead { box-shadow: 0 0 5px #fffc, inset 0 0 3px #fff8; border-color: #fff; }
                .euc-controls { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
                .euc-controls button { flex-grow: 1; font-family: monospace; background: #444; color: #ccc; border: 1px solid #666; padding: 5px; border-radius: 4px; cursor: pointer; }
                .euc-controls button:hover { background-color: #555; }
            </style>
            <div class="euc-container">
                <div class="euc-params">
                    <div class="euc-param">
                        <label>BPM</label>
                        <s-number value="${this.values.bpm}" default="${this.values.bpm}" min="20" max="300" step="1" data-el="bpmControl"></s-number>
                    </div>
                    <div class="euc-param">
                        <label>Gate</label>
                        <s-number value="${this.values.gateLength}" default="${this.values.gateLength}" min="0.1" max="1.0" step="0.05" data-el="gateControl"></s-number>
                    </div>
                </div>
                <div class="euc-grid" data-el="grid">${gridHtml}</div>
                <div class="euc-lane-controls-container">${controlsHtml}</div>
                <div class="euc-controls">
                    <button class="btn" data-el="runButton">Start</button>
                    <button class="btn" data-el="resetButton">Reset</button>
                    <button class="btn" data-el="clearButton">Clear</button>
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        // Cache step DOM refs — stepEls[step] = NodeList across all lanes
        // Also cache per-lane-per-step for _updateGrid
        const steps = this.values.steps
        this.runtimeState.stepEls = new Array(steps)
        this._gridCells = new Array(4)
        for(let lane = 0; lane < 4; lane++){
            this._gridCells[lane] = new Array(steps)
        }
        for(let step = 0; step < steps; step++){
            this.runtimeState.stepEls[step] = this.elements.grid.querySelectorAll(`.euc-step[data-step="${step}"]`)
        }
        for(let lane = 0; lane < 4; lane++){
            for(let step = 0; step < steps; step++){
                this._gridCells[lane][step] = this.elements.grid.querySelector(`[data-lane="${lane}"][data-step="${step}"]`)
            }
        }
    },

    _updateGrid(){
        const steps = this.values.steps
        for(let lane = 0; lane < 4; lane++){
            const pattern = this.runtimeState.patterns[lane]
            for(let step = 0; step < steps; step++){
                const el = this._gridCells[lane][step]
                if(el) el.classList.toggle('active', pattern[step])
            }
        }
    },

    _updatePlayhead(){
        const stepEls = this.runtimeState.stepEls
        const prev = this.runtimeState.prevPlayheadStep
        const cur = this.runtimeState.currentStep

        if(prev > -1 && stepEls[prev]){
            stepEls[prev].forEach(el => el.classList.remove('playhead'))
        }
        if(cur > -1 && stepEls[cur]){
            stepEls[cur].forEach(el => el.classList.add('playhead'))
        }
        this.runtimeState.prevPlayheadStep = cur
    },

    _addEventListeners(){
        this.elements.bpmControl.addEventListener('input', (e) => {
            this.values.bpm = parseFloat(e.target.value)
        })

        this.elements.gateControl.addEventListener('input', (e) => {
            this.values.gateLength = parseFloat(e.target.value)
        })

        this.customArea.addEventListener('input', (e) => {
            if(e.target.tagName === 'S-NUMBER' && e.target.dataset.lane){
                const lane = parseInt(e.target.dataset.lane)
                const param = e.target.dataset.param
                const value = parseInt(e.target.value)

                this.values.lanes[lane][param] = value
                this._updatePatterns()
                this._updateGrid()
            }
        })

        this.elements.runButton.addEventListener('click', () => this._toggleRunning())
        this.elements.resetButton.addEventListener('click', () => this._resetSequence())
        this.elements.clearButton.addEventListener('click', () => {
            this.values.lanes.forEach(lane => {
                lane.beats = 0
                lane.rotation = 0
            })
            this._updatePatterns()
            this._updateGrid()
        })
    },

    onCreate(){
        if(!this.customArea){return}
        this._createUI()
        this._updatePatterns()
        this._updateGrid()
        this._addEventListeners()
    },

    onDestroy(){
        if(this.runtimeState.animationFrameId){
            cancelAnimationFrame(this.runtimeState.animationFrameId)
        }
        for(let i = 0; i < this.runtimeState.gateTimeouts.length; i++) clearTimeout(this.runtimeState.gateTimeouts[i])
        this.runtimeState.gateTimeouts.length = 0
    }
})