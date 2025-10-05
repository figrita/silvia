import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

// Standard mapping indices
const BTN_A = 0, BTN_B = 1, BTN_X = 2, BTN_Y = 3
const BTN_DPAD_UP = 12, BTN_DPAD_DOWN = 13, BTN_DPAD_LEFT = 14, BTN_DPAD_RIGHT = 15
const AXIS_LX = 0, AXIS_LY = 1, AXIS_RX = 2, AXIS_RY = 3
const TRIGGER_L = 6, TRIGGER_R = 7

registerNode({
    slug: 'gamepad',
    icon: '🎮',
    label: 'Gamepad',
    tooltip: 'Interfaces with connected game controllers. Outputs analog stick positions, trigger values, and button states.',
    elements: {
        status: null,
        scanButton: null
    },
    runtimeState: {
        gamepad: null,
        animationFrameId: null,
        outputValues: {
            leftStickX: 0, leftStickY: 0, rightStickX: 0, rightStickY: 0,
            leftTrigger: 0, rightTrigger: 0
        },
        buttonPrevState: new Array(20).fill(false)
    },

    input: {},
    output: {
        'leftStickX': {label: 'Left Stick X', type: 'float', range: '[-1, 1]'},
        'leftStickY': {label: 'Left Stick Y', type: 'float', range: '[-1, 1]'},
        'rightStickX': {label: 'Right Stick X', type: 'float', range: '[-1, 1]'},
        'rightStickY': {label: 'Right Stick Y', type: 'float', range: '[-1, 1]'},
        'leftTrigger': {label: 'Left Trigger', type: 'float', range: '[0, 1]'},
        'rightTrigger': {label: 'Right Trigger', type: 'float', range: '[0, 1]'},
        'buttonA': {label: 'Button A (Cross)', type: 'action'},
        'buttonB': {label: 'Button B (Circle)', type: 'action'},
        'buttonX': {label: 'Button X (Square)', type: 'action'},
        'buttonY': {label: 'Button Y (Triangle)', type: 'action'},
        'dpadUp': {label: 'D-pad Up', type: 'action'},
        'dpadDown': {label: 'D-pad Down', type: 'action'},
        'dpadLeft': {label: 'D-pad Left', type: 'action'},
        'dpadRight': {label: 'D-pad Right', type: 'action'}
    },

    onCreate(){
        if(!this.customArea){return}
        this._createUI()

        Object.values(this.output).forEach(port => {
            if(port.type === 'float'){
                port.genCode = (cc, funcName, uniformName) => `float ${funcName}(vec2 uv) { return ${uniformName}; }`
                port.floatUniformUpdate = (uniformName, gl, program) => {
                    if(this.isDestroyed){return}
                    const location = gl.getUniformLocation(program, uniformName)
                    // Find the key for the current port to access runtimeState.outputValues
                    const portKey = Object.keys(this.output).find(key => this.output[key] === port)
                    if(portKey){
                        gl.uniform1f(location, this.runtimeState.outputValues[portKey])
                    }
                }
            }
        })

        window.addEventListener('gamepadconnected', this._handleConnection)
        window.addEventListener('gamepaddisconnected', this._handleDisconnection)

        this._scanGamepads()
    },

    onDestroy(){
        if(this.runtimeState.animationFrameId){cancelAnimationFrame(this.runtimeState.animationFrameId)}

        window.removeEventListener('gamepadconnected', this._handleConnection)
        window.removeEventListener('gamepaddisconnected', this._handleDisconnection)
    },

    _handleConnection(e){
        console.log('Gamepad connected:', e.gamepad.id)
        if(!this.runtimeState.gamepad){
            this._scanGamepads()
        }
    },

    _handleDisconnection(e){
        console.log('Gamepad disconnected:', e.gamepad.id)
        if(this.runtimeState.gamepad && this.runtimeState.gamepad.index === e.gamepad.index){
            this.runtimeState.gamepad = null
            this._stopPolling()
            this.elements.status.textContent = 'Status: Disconnected'
        }
    },

    _scanGamepads(){
        const gamepads = navigator.getGamepads()
        const firstGamepad = Array.from(gamepads).find(g => g)
        if(firstGamepad){
            this.runtimeState.gamepad = firstGamepad
            this.elements.status.textContent = `Status: ${this.runtimeState.gamepad.id}`
            this._startPolling()
        } else {
            this.elements.status.textContent = 'Status: No gamepad found (Try pressing a button)'
        }
    },

    _startPolling(){
        if(this.runtimeState.animationFrameId){return}
        this.runtimeState.animationFrameId = requestAnimationFrame(() => this._poll())
    },

    _stopPolling(){
        if(this.runtimeState.animationFrameId){cancelAnimationFrame(this.runtimeState.animationFrameId)}
        this.runtimeState.animationFrameId = null
    },

    _poll(){
        if(!this.runtimeState.gamepad || this.isDestroyed){
            this._stopPolling()
            return
        }

        const freshGamepad = navigator.getGamepads()[this.runtimeState.gamepad.index]
        if(!freshGamepad){
            this._stopPolling()
            return
        }

        const applyDeadzone = (val, threshold = 0.1) => Math.abs(val) < threshold ? 0 : val
        this.runtimeState.outputValues.leftStickX = applyDeadzone(freshGamepad.axes[AXIS_LX])
        this.runtimeState.outputValues.leftStickY = -applyDeadzone(freshGamepad.axes[AXIS_LY])
        this.runtimeState.outputValues.rightStickX = applyDeadzone(freshGamepad.axes[AXIS_RX])
        this.runtimeState.outputValues.rightStickY = -applyDeadzone(freshGamepad.axes[AXIS_RY])

        this.runtimeState.outputValues.leftTrigger = freshGamepad.buttons[TRIGGER_L]?.value ?? 0
        this.runtimeState.outputValues.rightTrigger = freshGamepad.buttons[TRIGGER_R]?.value ?? 0

        const checkButton = (index, actionName) => {
            const isPressed = freshGamepad.buttons[index]?.pressed ?? false
            const wasPressed = this.runtimeState.buttonPrevState[index]
            
            // Trigger down event on press
            if(isPressed && !wasPressed){
                this.triggerAction(actionName, 'down')
            }
            // Trigger up event on release
            if(!isPressed && wasPressed){
                this.triggerAction(actionName, 'up')
            }
            this.runtimeState.buttonPrevState[index] = isPressed
        }

        checkButton(BTN_A, 'buttonA')
        checkButton(BTN_B, 'buttonB')
        checkButton(BTN_X, 'buttonX')
        checkButton(BTN_Y, 'buttonY')
        checkButton(BTN_DPAD_UP, 'dpadUp')
        checkButton(BTN_DPAD_DOWN, 'dpadDown')
        checkButton(BTN_DPAD_LEFT, 'dpadLeft')
        checkButton(BTN_DPAD_RIGHT, 'dpadRight')

        this.runtimeState.animationFrameId = requestAnimationFrame(() => this._poll())
    },

    _createUI(){
        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem; color: #ccc; font-size: 0.9rem;">
                <p data-el="status" style="margin:0; width: 16rem;">Status: Scanning...</p>
                <button class="btn" data-el="scanButton" style="font-family: monospace; background: #444; color: #ccc; border: 1px solid #666; padding: 5px; border-radius: 4px; cursor: pointer;">
                    Rescan for Gamepads
                </button>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)
        this.elements.scanButton.addEventListener('click', () => this._scanGamepads())
    }
})