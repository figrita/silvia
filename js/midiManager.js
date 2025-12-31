// midiManager.js - MIDI input and learn functionality

class MidiManager {
    constructor() {
        this.midiAccess = null
        this.inputs = new Map()
        this.isLearning = false
        this.learningTarget = null
        this.ccMappings = new Map() // Map of CC number to Set of s-number elements
        this.noteMappings = new Map() // Map of note number to Set of action buttons
        this.lastCCValues = new Map() // Store last CC values for smooth updates
        
        this.init()
        
        // Cancel learning on escape
        document.addEventListener('escape-pressed', () => {
            this.cancelLearning()
        })
    }
    
    async init() {
        if (!navigator.requestMIDIAccess) {
            console.warn('WebMIDI not supported in this browser')
            return
        }
        
        try {
            this.midiAccess = await navigator.requestMIDIAccess()
            console.log('MIDI access granted')
            
            // Listen for device changes
            this.midiAccess.onstatechange = (e) => this.handleStateChange(e)
            
            // Connect to all available inputs
            for (const input of this.midiAccess.inputs.values()) {
                this.connectInput(input)
            }
            
        } catch (err) {
            console.error('Failed to get MIDI access:', err)
            
            // Check if this is Firefox and provide helpful message
            if (err.message && err.message.includes('site permission add-on')) {
                console.warn('🎹 Firefox requires an add-on for WebMIDI support.')
                console.warn('Install from: https://addons.mozilla.org/en-US/firefox/addon/jazz-midi/')
                console.warn('Or use Chrome/Edge/Brave for native WebMIDI support.')
                
                // Disable MIDI learn to prevent confusion
                this.midiDisabled = true
                this.isFirefox = true
            }
        }
    }
    
    handleStateChange(e) {
        const port = e.port
        if (port.type === 'input') {
            if (port.state === 'connected') {
                this.connectInput(port)
            } else if (port.state === 'disconnected') {
                this.disconnectInput(port)
            }
        }
    }
    
    connectInput(input) {
        console.log(`MIDI input connected: ${input.name}`)
        this.inputs.set(input.id, input)
        input.onmidimessage = (e) => this.handleMidiMessage(e)
        
        // Test if messages are coming through
        console.log('MIDI input state:', input.state)
        console.log('MIDI input connection:', input.connection)
    }
    
    disconnectInput(input) {
        console.log(`MIDI input disconnected: ${input.name}`)
        this.inputs.delete(input.id)
    }
    
    handleMidiMessage(event) {
        const [status, data1, data2] = event.data
        const command = status >> 4
        const channel = status & 0xF
        
        // CC message (0xB = 11)
        if (command === 11) {
            const ccNumber = data1
            const value = data2
            
            if (this.isLearning && this.learningTarget) {
                this.learnCC(ccNumber)
            } else {
                this.handleCC(ccNumber, value)
            }
        }
        // Note On (0x9 = 9)
        else if (command === 9 && data2 > 0) {
            const note = data1
            const velocity = data2
            
            if (this.isLearning && this.learningTarget) {
                this.learnNote(note)
            } else {
                this.handleNoteOn(note, velocity)
            }
        }
        // Note Off (0x8 = 8) or Note On with velocity 0
        else if (command === 8 || (command === 9 && data2 === 0)) {
            const note = data1
            this.handleNoteOff(note)
        }
    }
    
    handleCC(ccNumber, value) {
        // Store the raw value
        this.lastCCValues.set(ccNumber, value)
        
        const mappings = this.ccMappings.get(ccNumber)
        if (!mappings) return
        
        for (const element of mappings) {
            if (!element.isConnected) {
                mappings.delete(element)
                continue
            }
            
            // Convert MIDI value (0-127) to element's range
            const normalizedValue = value / 127
            const min = parseFloat(element.getAttribute('min') || -Infinity)
            const max = parseFloat(element.getAttribute('max') || Infinity)
            const isLogScale = element.hasAttribute('log-scale')
            
            if (isFinite(min) && isFinite(max)) {
                let scaledValue
                if (isLogScale && min > 0 && max > 0) {
                    // For log scale, interpolate in log space
                    const logMin = Math.log(min)
                    const logMax = Math.log(max)
                    const logValue = logMin + normalizedValue * (logMax - logMin)
                    scaledValue = Math.exp(logValue)
                } else {
                    // Linear scaling
                    scaledValue = min + normalizedValue * (max - min)
                }
                element.value = scaledValue
            }
        }
    }
    
    handleNoteOn(note, velocity) {
        const mappings = this.noteMappings.get(note)
        if (!mappings) return
        
        for (const button of mappings) {
            if (!button.isConnected) {
                mappings.delete(button)
                continue
            }
            
            // Check if button has new-style down/up events by looking for stored metadata
            const hasDownUp = button._hasDownUpCallbacks
            
            if (hasDownUp) {
                // Trigger pointerdown event for new-style buttons
                button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
            } else {
                // Legacy - trigger click for old-style buttons
                button.click()
            }
            
            // Visual feedback
            button.classList.add('midi-triggered')
        }
    }
    
    handleNoteOff(note) {
        const mappings = this.noteMappings.get(note)
        if (!mappings) return
        
        for (const button of mappings) {
            if (!button.isConnected) {
                mappings.delete(button)
                continue
            }
            
            // Check if button has new-style down/up events
            const hasDownUp = button._hasDownUpCallbacks
            
            if (hasDownUp) {
                // Trigger pointerup event for new-style buttons
                button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
            }
            
            // Remove visual feedback
            button.classList.remove('midi-triggered')
        }
    }
    
    startLearning(element, type) {
        // Don't start learning if MIDI is disabled
        if (this.midiDisabled) {
            console.warn('MIDI is not available in this browser.')
            // Only show Firefox modal if this is Firefox
            if (this.isFirefox) {
                this.showFirefoxModal()
            }
            return
        }

        // Cancel any existing learning session first
        this.cancelLearning()

        console.log('Starting MIDI learn:', { element, type })
        this.isLearning = true
        this.learningTarget = { element, type }
        
        // Visual feedback
        element.classList.add('midi-learning')
        
        // Show learning indicator
        this.showLearningIndicator(element, type)
        
        // Cancel learning on timeout
        this.learningTimeout = setTimeout(() => {
            console.log('MIDI learn timeout')
            this.cancelLearning()
        }, 10000) // 10 second timeout
    }
    
    learnCC(ccNumber) {
        console.log('Learning CC:', ccNumber)
        if (!this.learningTarget || this.learningTarget.type !== 'cc') {
            console.log('Not in CC learn mode or no target')
            return
        }
        
        const element = this.learningTarget.element
        
        // Remove from any previous CC mapping
        this.unmapElement(element, 'cc')
        
        // Add to new CC mapping
        if (!this.ccMappings.has(ccNumber)) {
            this.ccMappings.set(ccNumber, new Set())
        }
        this.ccMappings.get(ccNumber).add(element)
        
        // Store mapping info on element
        element.dataset.midiCc = ccNumber
        
        // Add hover listener for the indicator dot
        this.addMappingHoverListener(element, `CC ${ccNumber}`)
        
        // Apply last known value if available
        if (this.lastCCValues.has(ccNumber)) {
            this.handleCC(ccNumber, this.lastCCValues.get(ccNumber))
        }
        
        this.finishLearning(`CC ${ccNumber}`)
    }
    
    restoreCCMapping(element, ccNumber) {
        // Remove from any previous CC mapping
        this.unmapElement(element, 'cc')
        
        // Add to CC mapping
        if (!this.ccMappings.has(ccNumber)) {
            this.ccMappings.set(ccNumber, new Set())
        }
        this.ccMappings.get(ccNumber).add(element)
        
        // Store mapping info on element
        element.dataset.midiCc = ccNumber
        element.classList.add('midi-mapped')
        
        // Add hover listener for the indicator dot
        this.addMappingHoverListener(element, `CC ${ccNumber}`)
        
        // Apply last known value if available
        if (this.lastCCValues.has(ccNumber)) {
            this.handleCC(ccNumber, this.lastCCValues.get(ccNumber))
        }
    }
    
    learnNote(note) {
        console.log('Learning Note:', note)
        if (!this.learningTarget || this.learningTarget.type !== 'note') {
            console.log('Not in note learn mode or no target')
            return
        }
        
        const button = this.learningTarget.element
        
        // Remove from any previous note mapping
        this.unmapElement(button, 'note')
        
        // Add to new note mapping
        if (!this.noteMappings.has(note)) {
            this.noteMappings.set(note, new Set())
        }
        this.noteMappings.get(note).add(button)
        
        // Store mapping info on button
        button.dataset.midiNote = note
        
        // Add hover listener for the indicator dot
        this.addMappingHoverListener(button, `Note ${note} (${this.noteToName(note)})`)
        
        this.finishLearning(`Note ${note} (${this.noteToName(note)})`)
    }
    
    restoreNoteMapping(button, note) {
        // Remove from any previous note mapping
        this.unmapElement(button, 'note')
        
        // Add to note mapping
        if (!this.noteMappings.has(note)) {
            this.noteMappings.set(note, new Set())
        }
        this.noteMappings.get(note).add(button)
        
        // Store mapping info on button
        button.dataset.midiNote = note
        button.classList.add('midi-mapped')
        
        // Add hover listener for the indicator dot
        this.addMappingHoverListener(button, `Note ${note} (${this.noteToName(note)})`)
    }
    
    finishLearning(mappingInfo) {
        clearTimeout(this.learningTimeout)
        
        const element = this.learningTarget.element
        element.classList.remove('midi-learning')
        element.classList.add('midi-mapped')
        
        // Just hide the learning indicator, no popup
        this.hideLearningIndicator()
        
        this.isLearning = false
        this.learningTarget = null
    }
    
    cancelLearning() {
        // Always clean up UI state first, regardless of internal state
        this.hideLearningIndicator()
        clearTimeout(this.learningTimeout)

        // Remove midi-learning class from any element that might have it
        // This is a safety net for any orphaned learning states
        document.querySelectorAll('.midi-learning').forEach(el => {
            el.classList.remove('midi-learning')
        })

        // Clean up internal state
        if (this.learningTarget) {
            this.learningTarget.element.classList.remove('midi-learning')
        }

        this.isLearning = false
        this.learningTarget = null
    }
    
    unmapElement(element, type) {
        // Hide tooltip immediately if it's showing
        this.hideMappingTooltip()
        
        if (type === 'cc') {
            const oldCC = parseInt(element.dataset.midiCc)
            if (!isNaN(oldCC) && this.ccMappings.has(oldCC)) {
                this.ccMappings.get(oldCC).delete(element)
            }
            delete element.dataset.midiCc
        } else if (type === 'note') {
            const oldNote = parseInt(element.dataset.midiNote)
            if (!isNaN(oldNote) && this.noteMappings.has(oldNote)) {
                this.noteMappings.get(oldNote).delete(element)
            }
            delete element.dataset.midiNote
        }
        
        // Remove hover listeners
        if (element._midiShowTooltip) {
            element.removeEventListener('mouseenter', element._midiShowTooltip)
            delete element._midiShowTooltip
        }
        if (element._midiHideTooltip) {
            element.removeEventListener('mouseleave', element._midiHideTooltip)
            delete element._midiHideTooltip
        }
        
        delete element.dataset.midiMapping
        element.classList.remove('midi-mapped')
    }
    
    showLearningIndicator(element, type) {
        const indicator = document.createElement('div')
        indicator.className = 'midi-learning-indicator'
        indicator.innerHTML = `
            <div>${type === 'cc' ? 'Move a MIDI knob/fader...' : 'Press a MIDI key...'}</div>
            <div style="font-size: 11px; margin-top: 5px; opacity: 0.7;">Alt/Option+Click to assign MIDI</div>
        `
        indicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg-interactive);
            border: 2px solid var(--primary);
            padding: 20px;
            border-radius: 8px;
            z-index: 10000;
            font-family: monospace;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `
        
        const cancelBtn = document.createElement('button')
        cancelBtn.textContent = 'Cancel'
        cancelBtn.style.cssText = `
            display: block;
            margin-top: 10px;
            padding: 5px 10px;
            background: var(--bg-hover);
            border: 1px solid var(--primary-muted);
            border-radius: 4px;
            cursor: pointer;
        `
        cancelBtn.onclick = () => this.cancelLearning()
        
        indicator.appendChild(cancelBtn)
        document.body.appendChild(indicator)
        
        this.learningIndicator = indicator
    }
    
    hideLearningIndicator() {
        if (this.learningIndicator) {
            this.learningIndicator.remove()
            this.learningIndicator = null
        }
    }
    
    addMappingHoverListener(element, mappingInfo) {
        // Store the mapping info as a data attribute for CSS to access
        element.dataset.midiMapping = mappingInfo
        
        // Simple hover handlers for the whole element
        const showTooltip = () => {
            this.showMappingTooltip(element, mappingInfo)
        }
        
        const hideTooltip = () => {
            this.hideMappingTooltip()
        }
        
        // Store handlers so we can remove them later
        element._midiShowTooltip = showTooltip
        element._midiHideTooltip = hideTooltip
        
        element.addEventListener('mouseenter', showTooltip)
        element.addEventListener('mouseleave', hideTooltip)
    }
    
    showMappingTooltip(element, info) {
        // Remove any existing tooltip
        this.hideMappingTooltip()
        
        const tooltip = document.createElement('div')
        tooltip.className = 'midi-mapping-info'
        tooltip.textContent = info
        tooltip.id = 'midi-mapping-tooltip'
        
        const rect = element.getBoundingClientRect()
        // Position above the element
        tooltip.style.left = `${rect.left + rect.width / 2}px`
        tooltip.style.top = `${rect.top - 5}px`
        tooltip.style.transform = 'translate(-50%, -100%)'
        
        document.body.appendChild(tooltip)
    }
    
    hideMappingTooltip() {
        const existing = document.getElementById('midi-mapping-tooltip')
        if (existing) {
            existing.remove()
        }
    }
    
    hideFirefoxModal() {
        const warning = document.querySelector('.midi-browser-warning')
        if (warning) {
            warning.remove()
        }
    }

    showFirefoxModal() {
        // Don't show multiple modals
        if (document.querySelector('.midi-browser-warning')) return

        const warning = document.createElement('div')
        warning.className = 'midi-browser-warning'

        // Close on escape
        const escapeHandler = () => {
            this.hideFirefoxModal()
            document.removeEventListener('escape-pressed', escapeHandler)
        }
        document.addEventListener('escape-pressed', escapeHandler)

        warning.innerHTML = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: var(--bg-interactive);
                border: 2px solid var(--primary);
                padding: 20px;
                border-radius: 8px;
                z-index: 10000;
                font-family: monospace;
                max-width: 450px;
                text-align: center;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            ">
                <h3 style="margin: 0 0 10px 0; color: var(--primary);">🎹 MIDI Support for Firefox</h3>
                <p style="margin: 15px 0;">Firefox requires the Jazz-MIDI add-on for WebMIDI support.</p>
                <a href="https://addons.mozilla.org/en-US/firefox/addon/jazz-midi/" 
                   target="_blank"
                   style="
                    display: inline-block;
                    margin: 15px 0;
                    padding: 10px 20px;
                    background: var(--primary);
                    color: var(--bg-primary);
                    text-decoration: none;
                    border-radius: 4px;
                    font-weight: bold;
                ">Install Jazz-MIDI Add-on</a>
                <p style="margin: 15px 0; font-size: 12px; opacity: 0.8;">After installing, refresh this page to enable MIDI.</p>
                <hr style="margin: 15px 0; border: none; border-top: 1px solid var(--primary-muted); opacity: 0.3;">
                <p style="margin: 10px 0; font-size: 11px;">Alternative browsers with native MIDI support:</p>
                <ul style="list-style: none; padding: 0; margin: 10px 0; font-size: 11px;">
                    <li style="display: inline; margin: 0 8px;">Chrome</li>
                    <li style="display: inline; margin: 0 8px;">Edge</li>
                    <li style="display: inline; margin: 0 8px;">Brave</li>
                </ul>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    margin-top: 15px;
                    padding: 8px 16px;
                    background: var(--bg-hover);
                    border: 1px solid var(--primary-muted);
                    border-radius: 4px;
                    cursor: pointer;
                    color: var(--text-primary);
                ">Close</button>
            </div>
        `
        
        document.body.appendChild(warning)
    }
    
    noteToName(note) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        const octave = Math.floor(note / 12) - 1
        const noteName = noteNames[note % 12]
        return `${noteName}${octave}`
    }
    
    clearAllMappings() {
        // Hide any visible tooltip first
        this.hideMappingTooltip()
        
        // Clear all CC mappings
        for (const elements of this.ccMappings.values()) {
            for (const el of elements) {
                el.classList.remove('midi-mapped')
                delete el.dataset.midiCc
                delete el.dataset.midiMapping
                // Remove hover listeners
                if (el._midiShowTooltip) {
                    el.removeEventListener('mouseenter', el._midiShowTooltip)
                    delete el._midiShowTooltip
                }
                if (el._midiHideTooltip) {
                    el.removeEventListener('mouseleave', el._midiHideTooltip)
                    delete el._midiHideTooltip
                }
            }
        }
        this.ccMappings.clear()
        
        // Clear all note mappings
        for (const buttons of this.noteMappings.values()) {
            for (const btn of buttons) {
                btn.classList.remove('midi-mapped')
                delete btn.dataset.midiNote
                delete btn.dataset.midiMapping
                // Remove hover listeners
                if (btn._midiShowTooltip) {
                    btn.removeEventListener('mouseenter', btn._midiShowTooltip)
                    delete btn._midiShowTooltip
                }
                if (btn._midiHideTooltip) {
                    btn.removeEventListener('mouseleave', btn._midiHideTooltip)
                    delete btn._midiHideTooltip
                }
            }
        }
        this.noteMappings.clear()
    }
}

// Create singleton instance
export const midiManager = new MidiManager()