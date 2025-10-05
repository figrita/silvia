import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'clockdivider',
    icon: '卌',
    label: 'Clock Divider',
    tooltip: 'Divides incoming clock signals by specified amounts. Trigger on first event, then wait for specified number of events before triggering again.',

    elements: {
        divisorControl: null,
        statusDisplay: null,
        resetButton: null
    },
    values: {
        divisor: 4
    },
    runtimeState: {
        eventCounter: 0,
        lastTriggerTime: 0
    },

    input: {
        'clock': {
            label: 'Clock In',
            type: 'action',
            control: {},
            downCallback(){
                this._handleClockEvent()
            }
        },
        'reset': {
            label: 'Reset',
            type: 'action',
            control: {},
            downCallback(){
                this._resetCounter()
            }
        }
    },
    output: {
        'divided': {
            label: 'Divided Out',
            type: 'action'
        }
    },

    _handleClockEvent(){
        // Increment counter first
        this.runtimeState.eventCounter++

        // Use closure to maintain clean event counting logic
        const shouldTrigger = (() => {
            // Trigger every divisor events (e.g., every 4th event for divisor=4)
            return this.runtimeState.eventCounter % this.values.divisor === 0
        })()

        if(shouldTrigger){
            // Trigger output
            this.triggerAction('divided', 'down')
            this.runtimeState.lastTriggerTime = performance.now()

            // Visual feedback
            this._flashTrigger()
        }

        this._updateDisplay()
    },

    _resetCounter(){
        this.runtimeState.eventCounter = 0
        this._updateDisplay()
    },

    _flashTrigger(){
        if(this.elements.statusDisplay){
            const originalBg = this.elements.statusDisplay.style.background
            this.elements.statusDisplay.style.background = 'var(--color-main)'

            setTimeout(() => {
                if(this.elements.statusDisplay){
                    this.elements.statusDisplay.style.background = originalBg
                }
            }, 100)
        }
    },

    _updateDisplay(){
        if(this.elements.statusDisplay){
            const divisor = this.values.divisor
            const counter = this.runtimeState.eventCounter
            const remaining = divisor - (counter % divisor)

            let status
            if(counter === 0){
                status = `Ready (÷${divisor})`
            } else {
                status = `${remaining} events to trigger`
            }

            this.elements.statusDisplay.textContent = status
        }
    },

    _createUI(){
        const html = `
            <style>
                .divider-container {
                    padding: 0.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    min-width: 180px;
                }
                .divider-param {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 0.5rem;
                }
                .divider-param label {
                    font-size: 0.9rem;
                    color: #ccc;
                }
                .divider-status {
                    text-align: center;
                    padding: 0.5rem;
                    background: #333;
                    border-radius: 4px;
                    font-size: 0.85rem;
                    color: #ddd;
                    border: 1px solid #555;
                    transition: background 0.1s ease;
                }
                .divider-controls {
                    display: flex;
                    gap: 0.5rem;
                }
                .divider-controls button {
                    flex-grow: 1;
                    font-family: monospace;
                    background: #444;
                    color: #ccc;
                    border: 1px solid #666;
                    padding: 5px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .divider-controls button:hover {
                    background-color: #555;
                }
                .divider-help {
                    font-size: 0.7rem;
                    color: #888;
                    text-align: center;
                    margin-top: 0.25rem;
                }
            </style>
            <div class="divider-container">
                <div class="divider-param">
                    <label>Division</label>
                    <s-number value="${this.values.divisor}" min="2" max="32" step="1" data-el="divisorControl"></s-number>
                </div>

                <div class="divider-status" data-el="statusDisplay">
                    Ready (÷${this.values.divisor})
                </div>

                <div class="divider-controls">
                    <button class="btn" data-el="resetButton">Reset</button>
                </div>

                <div class="divider-help">
                    Triggers on 1st event, then every ${this.values.divisor} events
                </div>
            </div>
        `

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)
    },

    _addEventListeners(){
        this.elements.divisorControl.addEventListener('input', (e) => {
            this.values.divisor = parseInt(e.target.value)
            this._resetCounter() // Reset when divisor changes
            this._updateHelpText()
        })

        this.elements.resetButton.addEventListener('click', () => {
            this._resetCounter()
        })
    },

    _updateHelpText(){
        const helpEl = this.customArea.querySelector('.divider-help')
        if(helpEl){
            helpEl.textContent = `Triggers on 1st event, then every ${this.values.divisor} events`
        }
    },

    onCreate(){
        if(!this.customArea){return}
        this._createUI()
        this._addEventListeners()
        this._updateDisplay()
    },

    onDestroy(){
        // No cleanup needed for this node
    }
})