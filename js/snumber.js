// /snumber.js

import {midiManager} from './midiManager.js'

const clamp = (num, min, max) => Math.min(Math.max(num, min), max)
const getPrecision = (step) => {
    if(!isFinite(step) || step === 0){return 0}
    // Handle both regular decimals and scientific notation (e.g., 1e-7)
    const absStep = Math.abs(step)
    if(absStep >= 1){
        // For values >= 1, check if it's a whole number
        return Math.floor(step) === step ? 0 : Math.max(0, -Math.floor(Math.log10(absStep % 1)))
    }
    // For values < 1, calculate decimal places needed
    return Math.max(0, Math.ceil(-Math.log10(absStep)))
}

// Logarithmic scale conversion functions
const linToLog = (value, min, max) => {
    if(min <= 0 || max <= 0 || value <= 0){
        // Fall back to linear for non-positive values
        return value
    }
    const logMin = Math.log(min)
    const logMax = Math.log(max)
    const logValue = Math.log(value)
    // Return position as 0-1 in log space
    return (logValue - logMin) / (logMax - logMin)
}

const logToLin = (normalizedPos, min, max) => {
    if(min <= 0 || max <= 0){
        // Fall back to linear for non-positive values
        return min + normalizedPos * (max - min)
    }
    const logMin = Math.log(min)
    const logMax = Math.log(max)
    const logValue = logMin + normalizedPos * (logMax - logMin)
    return Math.exp(logValue)
}

class SNumber extends HTMLElement{
    static observedAttributes = ['value', 'default', 'min', 'max', 'step', 'disabled', 'unit', 'log-scale', 'midi-disabled']

    _value = 0
    _default = 0
    _min = -Infinity
    _max = Infinity
    _step = 1
    _unit = ''
    _logScale = false
    _isUpdatePending = false

    // Store original values from node definition for reset
    _originalMin = -Infinity
    _originalMax = Infinity
    _originalStep = 1

    constructor(){
        super()
        this.innerHTML = `
          <div style="position: absolute; left: 19px; right: 19px; height: 100%;"><div class="s-number-slider"></div></div>
          <button class="s-number-btn s-number-decr" tabindex="-1">-</button>
          <input type="text" class="s-number-input" spellcheck="false" />
          <button class="s-number-btn s-number-incr" tabindex="-1">+</button>
        `
        this.inputEl = this.querySelector('.s-number-input')
        this.sliderEl = this.querySelector('.s-number-slider')
        this.decrBtn = this.querySelector('.s-number-decr')
        this.incrBtn = this.querySelector('.s-number-incr')
    }

    connectedCallback(){
        // Flag to prevent event dispatching during initialization
        this._initializing = true

        this._upgradeProperty('value')
        this._upgradeProperty('default')
        this._upgradeProperty('min')
        this._upgradeProperty('max')
        this._upgradeProperty('step')
        this._upgradeProperty('disabled')
        this._upgradeProperty('unit')
        this._upgradeProperty('logScale')
        this._upgradeProperty('midiDisabled')

        if(this.hasAttribute('value')){this._value = parseFloat(this.getAttribute('value'))}
        if(this.hasAttribute('default')){this._default = parseFloat(this.getAttribute('default'))}
        if(this.hasAttribute('min')){this._min = parseFloat(this.getAttribute('min'))}
        if(this.hasAttribute('max')){this._max = parseFloat(this.getAttribute('max'))}
        if(this.hasAttribute('step')){this._step = parseFloat(this.getAttribute('step'))}
        if(this.hasAttribute('unit')){this._unit = this.getAttribute('unit')}
        if(this.hasAttribute('log-scale')){this._logScale = true}

        // Store original values for reset functionality
        this._originalMin = this._min
        this._originalMax = this._max
        this._originalStep = this._step

        this._updateInput()
        this._addEventListeners()
        this._addMinMaxEditability()

        this._initializing = false
    }

    _upgradeProperty(prop){
        if(Object.hasOwn(this, prop)){
            const value = this[prop]
            delete this[prop]
            this[prop] = value
        }
    }

    attributeChangedCallback(name, oldValue, newValue){
        if(oldValue === newValue){return}

        switch(name){
            case 'value': this.value = newValue; break
            case 'default': this._default = parseFloat(newValue); break
            case 'min':
                this._min = parseFloat(newValue)
                if(this.minEl){this.minEl.textContent = this._formatMinMax(this._min)}
                this._requestUpdate()
                break
            case 'max':
                this._max = parseFloat(newValue)
                if(this.maxEl){this.maxEl.textContent = this._formatMinMax(this._max)}
                this._requestUpdate()
                break
            case 'step':
                this._step = parseFloat(newValue)
                if(this.stepEl){this.stepEl.textContent = this._formatStep(this._step)}
                this._requestUpdate()
                break
            case 'disabled':
                this.inputEl.disabled = this.hasAttribute('disabled')
                this.decrBtn.disabled = this.hasAttribute('disabled')
                this.incrBtn.disabled = this.hasAttribute('disabled')
                break
            case 'unit':
                this._unit = newValue
                this._requestUpdate()
                break
            case 'log-scale':
                this._logScale = newValue !== null
                this._requestUpdate()
                break
            case 'midi-disabled':
                // No special handling needed, just track the attribute
                break
        }
    }

    _roundToStep(value){
        if(this._step <= 0 || !isFinite(this._step)){return value}
        // Round to nearest step, using step's precision to avoid floating point errors
        const precision = getPrecision(this._step)
        const numSteps = Math.round(value / this._step)
        const roundedValue = numSteps * this._step
        return parseFloat(roundedValue.toFixed(precision))
    }

    get value(){return this._value}
    set value(val){
        if(this.disabled){return}

        const numericVal = parseFloat(val)
        if(isNaN(numericVal)){return}

        // Only clamp, don't round - preserve exact values set programmatically
        const clampedVal = clamp(numericVal, this._min, this._max)

        // Use a tolerance for float comparison to prevent re-renders
        if(Math.abs(this._value - clampedVal) < 1e-9){return}

        this._value = clampedVal
        this.setAttribute('value', this._value)
        this._requestUpdate()
        // --- FIX: Dispatch an 'input' event for live updates ---
        this._dispatchInput()
    }

    get default(){return this._default}
    set default(val){this._default = val; this.setAttribute('default', val)}

    get min(){return this._min}
    set min(val){
        // Swap if min is greater than max
        if(isFinite(val) && isFinite(this._max) && val > this._max){
            const temp = val
            val = this._max
            this._max = temp
            this.setAttribute('max', this._max)
            if(this.maxEl){this.maxEl.textContent = this._formatMinMax(this._max)}
        }
        
        this._min = val
        this.setAttribute('min', val)
        if(this.minEl){this.minEl.textContent = this._formatMinMax(val)}
        this._requestUpdate() // Redraw slider with new scale
    }

    get max(){return this._max}
    set max(val){
        // Swap if max is less than min
        if(isFinite(val) && isFinite(this._min) && val < this._min){
            const temp = val
            val = this._min
            this._min = temp
            this.setAttribute('min', this._min)
            if(this.minEl){this.minEl.textContent = this._formatMinMax(this._min)}
        }
        
        this._max = val
        this.setAttribute('max', val)
        if(this.maxEl){this.maxEl.textContent = this._formatMinMax(val)}
        this._requestUpdate() // Redraw slider with new scale
    }

    get step(){return this._step}
    set step(val){
        this._step = val
        this.setAttribute('step', val)
        if(this.stepEl){this.stepEl.textContent = this._formatStep(val)}
        this._requestUpdate() // Redraw value with new precision
    }

    get disabled(){return this.hasAttribute('disabled')}
    set disabled(val){
        if(val){this.setAttribute('disabled', '')}
        else {this.removeAttribute('disabled')}
    }

    get unit(){return this._unit}
    set unit(val){
        this._unit = val
        if(val){
            this.setAttribute('unit', val)
        } else {
            this.removeAttribute('unit')
        }
    }

    get logScale(){return this._logScale}
    set logScale(val){
        this._logScale = val
        if(val){
            this.setAttribute('log-scale', '')
        } else {
            this.removeAttribute('log-scale')
        }
        this._requestUpdate()
    }

    get midiDisabled(){return this.hasAttribute('midi-disabled')}
    set midiDisabled(val){
        if(val){
            this.setAttribute('midi-disabled', '')
        } else {
            this.removeAttribute('midi-disabled')
        }
    }

    _requestUpdate(){
        if(this._isUpdatePending){return}
        this._isUpdatePending = true
        requestAnimationFrame(() => {
            this._updateInput()
            this._isUpdatePending = false
        })
    }

    _updateInput(){
        const precision = getPrecision(this._step)
        const formattedValue = this._value.toFixed(precision)
        this.inputEl.value = this._unit ? `${formattedValue} ${this._unit}` : formattedValue

        const range = this._max - this._min
        if(range > 0 && isFinite(range)){
            let percent
            if(this._logScale && this._min > 0 && this._max > 0 && this._value > 0){
                // Use logarithmic positioning for the slider
                percent = linToLog(this._value, this._min, this._max) * 100
            } else {
                // Linear positioning
                percent = ((this._value - this._min) / range) * 100
            }
            this.sliderEl.style.width = `${clamp(percent, 0, 100)}%`
        } else {
            this.sliderEl.style.width = '0%'
        }
    }

    // --- FIX: Added dispatcher for 'input' event ---
    _dispatchInput(){
        // Don't dispatch events during initialization
        if(this._initializing) return
        this.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
    }

    _commitValue(newValue){
        // Round to step for user-initiated changes
        this.value = this._roundToStep(newValue)
        // Don't dispatch events during initialization
        if(this._initializing) return
        this.dispatchEvent(new Event('change', {bubbles: true, composed: true}))
    }

    _adjustPrecision(increase){
        // Adjust step size by 10x or 0.1x
        let newStep
        if(increase){
            // Make step finer (0.1x)
            newStep = this._step * 0.1
        } else {
            // Make step coarser (10x)
            newStep = this._step * 10
        }

        // Fix floating point precision errors by rounding to reasonable precision
        const precision = Math.max(0, Math.ceil(-Math.log10(newStep)) + 2)
        this.step = parseFloat(newStep.toFixed(precision))
    }

    _resetToDefaults(){
        // Reset value to default
        if(this._default != null){
            this._commitValue(this._default)
        }

        // Reset min/max/step to original values from node definition
        this.min = this._originalMin
        this.max = this._originalMax
        this.step = this._originalStep
    }

    _addEventListeners(){
        this.decrBtn.addEventListener('click', (e) => {
            if(this.disabled){return}
            if(e.ctrlKey || e.metaKey){
                // Decrease precision (make step bigger)
                this._adjustPrecision(false)
            } else {
                this._commitValue(this._value - this._step)
            }
        })
        this.incrBtn.addEventListener('click', (e) => {
            if(this.disabled){return}
            if(e.ctrlKey || e.metaKey){
                // Increase precision (make step smaller)
                this._adjustPrecision(true)
            } else {
                this._commitValue(this._value + this._step)
            }
        })

        // --- Mouse Wheel on component ---
        this.addEventListener('wheel', (e) => {
            if(this.disabled){return}
            
            // Only handle wheel events when the input element is focused
            if(document.activeElement !== this.inputEl){
                // Let the event bubble up to the editor for scrolling
                return
            }
            
            e.preventDefault()
            e.stopPropagation()
            const direction = e.deltaY > 0 ? -1 : 1
            
            if(this._logScale && this._min > 0 && this._max > 0 && this._value > 0){
                // For log scale, multiply/divide by a factor
                const factor = e.shiftKey ? 1.01 : ((e.ctrlKey || e.metaKey) ? 2 : 1.1)
                this.value = direction > 0 ? this._value * factor : this._value / factor
            } else {
                // Linear scale behavior
                const shiftMultiplier = e.shiftKey ? .1 : 1
                const ctrlMultiplier = (e.ctrlKey || e.metaKey) ? 10 : 1
                const multiplier = 10 * shiftMultiplier * ctrlMultiplier
                this.value = this._value + direction * this._step * multiplier
            }
            this._commitValue(this.value)
        }, {passive: false})

        this.inputEl.addEventListener('contextmenu', (e) => {
            if(this.disabled){return}

            e.preventDefault()
            e.stopImmediatePropagation()

            this.inputEl.focus()
            this.inputEl.select()
            return false
        })
        
        // Alt+Click for MIDI learn or unmap (works better cross-browser)
        this.inputEl.addEventListener('click', (e) => {
            if(this.disabled){return}
            
            if(e.altKey){
                // Check if MIDI is disabled for this element
                if(this.hasAttribute('midi-disabled')){
                    return
                }
                
                e.preventDefault()
                e.stopPropagation()
                
                // If already mapped, unmap it
                if(this.classList.contains('midi-mapped')){
                    midiManager.unmapElement(this, 'cc')
                } else {
                    midiManager.startLearning(this, 'cc')
                }
            }
        })
        this.inputEl.addEventListener('pointerdown', (e) => {
            if(this.disabled){return}

            let isDragging = false

            // --- Anchor-based logic ---
            // The "anchor" is the point from which we calculate the delta.
            // It gets reset every time the shift key state changes.
            let anchorX = e.clientX
            let anchorValue = this._value
            let lastShiftState = e.shiftKey

            const onPointerMove = (moveEvent) => {
                // Drag threshold: 3 pixels
                if(!isDragging && Math.abs(moveEvent.clientX - anchorX) > 3){
                    isDragging = true
                    document.body.classList.add('s-number-scrubbing')
                    document.body.style.cursor = 'ew-resize'
                    this.inputEl.setPointerCapture(e.pointerId)
                    this.inputEl.blur()
                }

                if(isDragging){
                    moveEvent.preventDefault()

                    const currentShiftState = moveEvent.shiftKey

                    // **THE CORE LOGIC:** If the shift key has been pressed or released
                    // since the last mouse move, we reset the anchor point.
                    if(currentShiftState !== lastShiftState){
                        anchorX = moveEvent.clientX // The new anchor is the current mouse X
                        anchorValue = this._value // The new anchor is the current numeric value
                        lastShiftState = currentShiftState // Update our state
                    }

                    // Calculate the delta from the most recent anchor
                    const deltaX = moveEvent.clientX - anchorX

                    if(this._logScale && this._min > 0 && this._max > 0 && anchorValue > 0){
                        // For log scale, use exponential changes
                        const multiplier = currentShiftState ? 0.001 : 0.01
                        const factor = Math.exp(deltaX * multiplier)
                        this.value = anchorValue * factor
                    } else {
                        // Linear scale behavior
                        const multiplier = currentShiftState ? 0.1 : 1
                        const sensitivity = this._step / 2
                        this.value = anchorValue + deltaX * sensitivity * multiplier
                    }
                }
            }

            const onPointerUp = (upEvent) => {
                document.removeEventListener('pointermove', onPointerMove)
                document.removeEventListener('pointerup', onPointerUp)
                document.removeEventListener('escape-pressed', onEscapePressed)
                document.body.classList.remove('s-number-scrubbing')
                if(isDragging){
                    this.inputEl.releasePointerCapture(upEvent.pointerId)
                    document.body.style.cursor = ''
                    this._commitValue(this._value)
                }
            }
            
            const onEscapePressed = () => {
                if(isDragging){
                    // Restore original value
                    this.value = anchorValue
                    // Clean up
                    document.removeEventListener('pointermove', onPointerMove)
                    document.removeEventListener('pointerup', onPointerUp)
                    document.removeEventListener('escape-pressed', onEscapePressed)
                    document.body.classList.remove('s-number-scrubbing')
                    this.inputEl.releasePointerCapture(e.pointerId)
                    document.body.style.cursor = ''
                }
            }

            document.addEventListener('pointermove', onPointerMove)
            document.addEventListener('pointerup', onPointerUp, {once: true})
            document.addEventListener('escape-pressed', onEscapePressed)
        })

        // --- Keyboard Shortcuts on Input ---
        this.inputEl.addEventListener('keydown', (e) => {
            if(this.disabled){return}

            if(e.key === 'ArrowUp' || e.key === 'ArrowDown'){
                e.preventDefault()
                const direction = e.key === 'ArrowUp' ? 1 : -1
                this._commitValue(this._value + direction * this._step)
                return
            }
            if(e.key === '[' || e.key === '{'){
                e.preventDefault()
                if(isFinite(this._min)){this._commitValue(this._min)}
                return
            }
            if(e.key === ']' || e.key === '}'){
                e.preventDefault()
                if(isFinite(this._max)){this._commitValue(this._max)}
                return
            }
            if(e.key === 'd'){
                e.preventDefault()
                if(this._default != null){this._commitValue(this._default)}
                return
            }
            if(e.key === 'r'){
                e.preventDefault()
                this._resetToDefaults()
                return
            }
            if(e.key === 'Enter'){
                this._handleBlur()
                this.inputEl.blur()
            }
        })

        this.inputEl.addEventListener('blur', this._handleBlur.bind(this))
        
        // Intercept input events from the internal input element
        this.inputEl.addEventListener('input', (e) => {
            if(this.disabled){return}
            
            // Stop the original event from bubbling
            e.stopPropagation()
            
            const rawText = e.target.value.replace(this._unit ? ` ${this._unit}` : '', '').trim()
            const parsed = parseFloat(rawText)
            
            if(!isNaN(parsed)){
                // Always clamp the internal value, but don't update the display
                const roundedVal = this._roundToStep(parsed)
                const clampedVal = clamp(roundedVal, this._min, this._max)
                
                const originalValue = this._value
                this._value = clampedVal
                this.setAttribute('value', this._value)
                
                // Dispatch our own input event with clamped value from the s-number element
                if(this._value !== originalValue){
                    // Create a synthetic event where this s-number element is the target
                    const syntheticEvent = new Event('input', {bubbles: true, composed: true})
                    // Override the target to be this s-number element with clamped value
                    Object.defineProperty(syntheticEvent, 'target', {
                        value: this,
                        writable: false
                    })
                    this.dispatchEvent(syntheticEvent)
                }
            }
        })

        // --- Slider track interaction ---
        this.addEventListener('pointerdown', (e) => {
            if(this.disabled || e.target.closest('.s-number-btn') || e.target === this.inputEl){return}
            e.preventDefault()

            const rect = this.getBoundingClientRect()
            const range = this._max - this._min
            if(range <= 0 || !isFinite(range)){return}

            const updateSliderValue = (moveEvent) => {
                const x = clamp(moveEvent.clientX, rect.left, rect.right)
                const percent = (x - rect.left) / rect.width
                
                if(this._logScale && this._min > 0 && this._max > 0){
                    // Convert from normalized position to logarithmic value
                    this.value = logToLin(percent, this._min, this._max)
                } else {
                    // Linear mapping
                    this.value = this._min + percent * range
                }
            }

            updateSliderValue(e)
            const onPointerMove = (moveEvent) => updateSliderValue(moveEvent)
            const onPointerUp = () => {
                document.removeEventListener('pointermove', onPointerMove)
                document.removeEventListener('pointerup', onPointerUp)
                this._commitValue(this._value)
            }
            document.addEventListener('pointermove', onPointerMove)
            document.addEventListener('pointerup', onPointerUp, {once: true})
        })
    }

    _handleBlur(){
        if(this.disabled){return}
        const parsed = parseFloat(this.inputEl.value)
        if(!isNaN(parsed)){
            // Force validation by setting through the value setter
            const originalValue = this._value
            this.value = parsed // This will clamp and validate
            
            // Only dispatch change event if the value actually changed
            if(this._value !== originalValue){
                this.dispatchEvent(new Event('change', {bubbles: true, composed: true}))
            }
            
            // Always update the input display to show the clamped value
            this._updateInput()
        } else {
            this._requestUpdate() // Revert to last valid value
        }
    }
    
    _addMinMaxEditability(){
        // Add min/max/step indicators that become editable on click
        const minMaxContainer = document.createElement('div')
        minMaxContainer.className = 's-number-minmax'
        minMaxContainer.innerHTML = `
            <span class="s-number-min" title="Click to edit min">${this._formatMinMax(this._min)}</span>
            <span class="s-number-step" title="Click to edit step">${this._formatStep(this._step)}</span>
            <span class="s-number-max" title="Click to edit max">${this._formatMinMax(this._max)}</span>
        `
        this.appendChild(minMaxContainer)

        this.minEl = this.querySelector('.s-number-min')
        this.stepEl = this.querySelector('.s-number-step')
        this.maxEl = this.querySelector('.s-number-max')
        
        // Make min editable on single click
        this.minEl.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            this._makeEditable(this.minEl, 'min')
        })
        
        // Make step editable on single click
        this.stepEl.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            this._makeEditable(this.stepEl, 'step')
        })

        // Make max editable on single click
        this.maxEl.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            this._makeEditable(this.maxEl, 'max')
        })
        
        // Prevent pointer events from bubbling up
        minMaxContainer.addEventListener('pointerdown', (e) => {
            e.stopPropagation()
        })
        minMaxContainer.addEventListener('pointermove', (e) => {
            e.stopPropagation()
        })
        minMaxContainer.addEventListener('pointerup', (e) => {
            e.stopPropagation()
        })
        
        // Track hover state
        let isHovered = false
        
        // Show/hide min/max on Ctrl key (or Cmd on Mac) only when hovered
        const handleCtrlKey = (e) => {
            if(isHovered && (e.ctrlKey || e.metaKey)){
                this.classList.add('show-minmax')
            } else if(!this.querySelector('.s-number-minmax-edit')){
                this.classList.remove('show-minmax')
            }
        }
        
        // Listen for Ctrl key (or Cmd on Mac) press/release globally
        document.addEventListener('keydown', handleCtrlKey)
        document.addEventListener('keyup', handleCtrlKey)
        
        // Track hover state and check Ctrl (or Cmd on Mac)
        this.addEventListener('mouseenter', (e) => {
            isHovered = true
            if(e.ctrlKey || e.metaKey){
                this.classList.add('show-minmax')
            }
        })
        
        this.addEventListener('mouseleave', () => {
            isHovered = false
            // Delay hiding for interaction
            setTimeout(() => {
                if(!this.querySelector('.s-number-minmax-edit')){
                    this.classList.remove('show-minmax')
                }
            }, 100)
        })
    }
    
    _formatMinMax(value){
        if(!isFinite(value)){
            return value > 0 ? '\u221e' : '-\u221e'
        }
        // Format with reasonable precision
        const precision = getPrecision(this._step)
        return precision > 0 ? value.toFixed(Math.min(precision, 3)) : value.toString()
    }

    _formatStep(value){
        if(!isFinite(value) || value <= 0){
            return '1'
        }
        // Format step with appropriate precision, avoiding scientific notation
        const precision = getPrecision(value)
        if(precision > 0){
            // toFixed avoids scientific notation and shows full decimal
            return value.toFixed(precision)
        }
        return value.toString()
    }
    
    _makeEditable(element, type){
        const currentValue = type === 'min' ? this._min : (type === 'max' ? this._max : this._step)
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 's-number-minmax-edit'
        // Format the value to avoid scientific notation in the edit field
        if(isFinite(currentValue)){
            const precision = getPrecision(currentValue)
            input.value = precision > 0 ? currentValue.toFixed(precision) : currentValue.toString()
        } else {
            input.value = ''
        }
        input.placeholder = isFinite(currentValue) ? '' : (type === 'min' ? '-\u221e' : (type === 'max' ? '\u221e' : '1'))
        
        element.style.display = 'none'
        element.parentNode.insertBefore(input, element)
        input.focus()
        input.select()
        
        const commitValue = () => {
            const newValue = input.value.trim()
            if(type === 'step'){
                // Handle step editing
                const numValue = parseFloat(newValue)
                if(!isNaN(numValue) && numValue > 0){
                    this.step = numValue
                }
                element.textContent = this._formatStep(this._step)
            } else if(newValue === '' || newValue === '-\u221e' || newValue === '\u221e'){
                // Set to infinity for min/max
                if(type === 'min'){
                    this.min = -Infinity
                } else {
                    this.max = Infinity
                }
                element.textContent = this._formatMinMax(type === 'min' ? this._min : this._max)
            } else {
                const numValue = parseFloat(newValue)
                if(!isNaN(numValue)){
                    if(type === 'min'){
                        this.min = numValue
                    } else {
                        this.max = numValue
                    }
                }
                element.textContent = this._formatMinMax(type === 'min' ? this._min : this._max)
            }

            element.style.display = ''
            input.remove()

            // Hide min/max indicators
            this.classList.remove('show-minmax')

            // Re-clamp current value if needed
            this.value = this._value
        }
        
        const cancelEdit = () => {
            element.style.display = ''
            input.remove()
            // Hide min/max indicators when canceling
            this.classList.remove('show-minmax')
        }
        
        input.addEventListener('blur', commitValue)
        input.addEventListener('keydown', (e) => {
            if(e.key === 'Enter'){
                commitValue()
            } else if(e.key === 'Escape'){
                cancelEdit()
            }
        })
    }
}

customElements.define('s-number', SNumber)