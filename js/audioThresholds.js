// audioThresholds.js - Shared functionality for audio threshold UI and detection

import {autowire, StringToFragment} from './utils.js'
import {Connection} from './connections.js'

/**
 * Creates threshold slider UI for audio meters
 * @param {Object} node - The node instance
 * @param {string} label - Display label (e.g., "Bass", "Bass+")  
 * @param {Object} meterContainer - Container to append meter to
 */
export function createAudioMeter(node, label, meterContainer) {
    const meterWrapper = document.createElement('div')
    meterWrapper.className = 'meter-wrapper'
    meterWrapper.style.position = 'relative'

    const meterLabel = document.createElement('div')
    meterLabel.className = 'meter-label'
    meterLabel.textContent = label

    const meterBg = document.createElement('div')
    meterBg.className = 'meter-bar-bg'
    meterBg.style.position = 'relative'
    
    const meterBar = document.createElement('div')
    meterBar.className = 'meter-bar'
    
    // Create threshold slider that looks like an action port
    const thresholdSlider = document.createElement('div')
    const bandKey = label.toLowerCase().replace('+', 'Exciter')
    const thresholdValue = node.values.thresholds[bandKey] || 0.5
    
    thresholdSlider.className = 'threshold-slider action'
    thresholdSlider.style.cssText = `
        position: absolute;
        top: 50%;
        left: ${thresholdValue * 100}%;
        width: 12px;
        height: 12px;
        background: var(--port-action-bg);
        border-radius: 2px;
        cursor: ew-resize;
        transform: translate(-50%, -50%);
        box-shadow: 0 1px 2px rgba(0,0,0,0.3);
        z-index: 10;
    `

    // Make threshold slider draggable
    let isDragging = false
    
    const startDrag = (e) => {
        isDragging = true
        e.preventDefault()
        document.addEventListener('pointermove', drag)
        document.addEventListener('pointerup', stopDrag)
    }
    
    const drag = (e) => {
        if(!isDragging) return
        const rect = meterBg.getBoundingClientRect()
        const x = e.clientX - rect.left
        const percent = Math.max(0, Math.min(1, x / rect.width))
        
        thresholdSlider.style.left = `${percent * 100}%`
        node.values.thresholds[bandKey] = percent
    }
    
    const stopDrag = () => {
        isDragging = false
        document.removeEventListener('pointermove', drag)
        document.removeEventListener('pointerup', stopDrag)
    }
    
    thresholdSlider.addEventListener('pointerdown', startDrag)

    meterBg.appendChild(meterBar)
    meterBg.appendChild(thresholdSlider)
    
    meterWrapper.appendChild(meterLabel)
    meterWrapper.appendChild(meterBg)

    const displayKey = label.toLowerCase()
    node.elements.meters[displayKey] = meterBar
    node.elements.thresholdSliders[bandKey] = thresholdSlider
    
    meterContainer.appendChild(meterWrapper)
    return meterWrapper
}

/**
 * Creates the complete audio meter UI for a node
 * @param {Object} node - The node instance
 * @param {boolean} includeVolume - Whether to include volume meter (for mic node)
 * @param {Object} defaultVisibility - Default visibility {numbers: boolean, events: boolean}
 */
export function createAudioMetersUI(node, includeVolume = false, defaultVisibility = {numbers: true, events: true}) {
    let meterContainer = node.elements.meterContainer
    
    // If no container exists, create one
    if(!meterContainer) {
        meterContainer = document.createElement('div')
        meterContainer.className = 'meter-container'
        meterContainer.style.cssText = `
            margin-top: 0.5rem;
            padding: 0.5rem;
            border-top: 1px solid #444;
        `
        node.elements.meterContainer = meterContainer
        node.customArea.appendChild(meterContainer)
    }
    
    // Clear existing content if any
    meterContainer.innerHTML = ''

    createAudioMeter(node, 'Bass', meterContainer)
    createAudioMeter(node, 'Bass+', meterContainer)
    createAudioMeter(node, 'Mid', meterContainer)
    createAudioMeter(node, 'High', meterContainer)
    
    if(includeVolume) {
        createAudioMeter(node, 'Volume', meterContainer)
    }
    
    createAudioVisibilityToggles(node, defaultVisibility)
    
    overrideUpdatePortPoints(node)
    const currentVisibility = node.values.audioVisibility || defaultVisibility
    if(!currentVisibility.numbers) {
        toggleAudioOutputs(node, 'number', false)
    }
    if(!currentVisibility.events) {
        toggleAudioOutputs(node, 'trigger', false)
    }
}

/**
 * Creates checkboxes to show/hide audio number and trigger outputs
 * @param {Object} node - The node instance
 * @param {Object} defaultVisibility - Default visibility {numbers: boolean, events: boolean}
 */
export function createAudioVisibilityToggles(node, defaultVisibility = {numbers: true, events: true}) {
    // Initialize visibility settings in values if not already present
    if(!node.values.audioVisibility) {
        node.values.audioVisibility = {
            numbers: defaultVisibility.numbers,
            events: defaultVisibility.events
        }
    }
    
    // Use saved values instead of defaults
    const currentVisibility = node.values.audioVisibility
    const toggleContainer = document.createElement('div')
    toggleContainer.className = 'audio-visibility-toggles'
    toggleContainer.style.cssText = `
        display: flex;
        gap: 1rem;
        padding: 0.5rem;
        font-size: 11px;
        border-top: 1px solid #333;
        background: rgba(0,0,0,0.2);
        justify-content: space-around;
    `
    
    // Number outputs toggle
    const numberToggle = document.createElement('label')
    numberToggle.style.cssText = `
        display: flex;
        align-items: center;
        gap: 0.3rem;
        color: #aaa;
        cursor: pointer;
    `
    numberToggle.innerHTML = `
        <input type="checkbox" ${currentVisibility.numbers ? 'checked' : ''} class="audio-number-toggle" style="margin: 0;">
        <span>Numbers</span>
    `
    
    // Trigger outputs toggle  
    const triggerToggle = document.createElement('label')
    triggerToggle.style.cssText = `
        display: flex;
        align-items: center;
        gap: 0.3rem;
        color: #aaa;
        cursor: pointer;
    `
    triggerToggle.innerHTML = `
        <input type="checkbox" ${currentVisibility.events ? 'checked' : ''} class="audio-trigger-toggle" style="margin: 0;">
        <span>Events</span>
    `
    
    toggleContainer.appendChild(numberToggle)
    toggleContainer.appendChild(triggerToggle)
    
    // Add event listeners
    const numberCheckbox = numberToggle.querySelector('.audio-number-toggle')
    const triggerCheckbox = triggerToggle.querySelector('.audio-trigger-toggle')
    
    numberCheckbox.addEventListener('change', (e) => {
        node.values.audioVisibility.numbers = e.target.checked
        toggleAudioOutputs(node, 'number', e.target.checked)
    })
    
    triggerCheckbox.addEventListener('change', (e) => {
        node.values.audioVisibility.events = e.target.checked
        toggleAudioOutputs(node, 'trigger', e.target.checked)
    })
    
    node.elements.meterContainer.appendChild(toggleContainer)
    
}

/**
 * Toggles visibility of audio outputs and updates port positions
 * @param {Object} node - The node instance  
 * @param {string} type - 'number' or 'trigger'
 * @param {boolean} visible - Whether to show or hide
 */
export function toggleAudioOutputs(node, type, visible) {
    const audioOutputs = ['bass', 'bassExciter', 'mid', 'high']
    if(node.output.volume) audioOutputs.push('volume') // For mic node
    
    const triggerOutputs = ['bassThreshold', 'bassExciterThreshold', 'midThreshold', 'highThreshold']
    if(node.output.volumeThreshold) triggerOutputs.push('volumeThreshold') // For mic node
    
    const outputsToToggle = type === 'number' ? audioOutputs : triggerOutputs
    
    // Toggle visibility
    outputsToToggle.forEach(outputKey => {
        const outputEl = node.nodeEl.querySelector(`[data-out-port="${outputKey}"]`)
        if(outputEl) {
            const outputRow = outputEl.closest('.node-output')
            if(outputRow) {
                outputRow.style.display = visible ? '' : 'none'
            }
        }
    })
    
    // Mark these outputs as hidden so updatePortPoints can position them at header
    if(!node._hiddenOutputs) node._hiddenOutputs = new Set()
    
    outputsToToggle.forEach(outputKey => {
        if(visible) {
            node._hiddenOutputs.delete(outputKey)
        } else {
            node._hiddenOutputs.add(outputKey)
        }
    })
    
    // Update port points immediately
    setTimeout(() => {
        node.updatePortPoints()
        // Redraw connections
        Connection.redrawAllConnections()
    }, 0)
}

/**
 * Overrides updatePortPoints for audio nodes to handle hidden outputs
 * @param {Object} node - The node instance
 */
export function overrideUpdatePortPoints(node) {
    const originalUpdatePortPoints = node.updatePortPoints
    
    node.updatePortPoints = () => {
        // Call original logic first
        originalUpdatePortPoints.call(node)
        
        // Handle hidden outputs - position them at header like collapsed nodes
        if(node._hiddenOutputs && node._hiddenOutputs.size > 0) {
            const header = node.nodeEl.querySelector('.node-header')
            if(header) {
                const editorRect = document.getElementById('editor').getBoundingClientRect()
                const headerRect = header.getBoundingClientRect()
                
                if(headerRect && headerRect.width > 0 && headerRect.height > 0) {
                    const headerY = (headerRect.top + headerRect.bottom) / 2 - editorRect.top + document.getElementById('editor').scrollTop
                    const headerRightX = headerRect.right - editorRect.left + document.getElementById('editor').scrollLeft
                    
                    // Position hidden outputs at header right edge
                    node._hiddenOutputs.forEach(outputKey => {
                        if(node.output[outputKey]) {
                            node.output[outputKey].x = headerRightX
                            node.output[outputKey].y = headerY
                        }
                    })
                }
            }
        }
    }
}

/**
 * Updates meter display and checks thresholds
 * @param {Object} node - The node instance
 * @param {string} bandKey - The band key (e.g., 'bass', 'bassExciter')
 * @param {number} currentValue - The current audio value
 * @param {number} now - Current timestamp
 * @param {string} meterKey - Optional override for meter key (e.g., 'bass+')
 */
export function updateMeterAndCheckThreshold(node, bandKey, currentValue, now, meterKey = null) {
    // Update meter display
    const displayKey = meterKey || bandKey.toLowerCase()
    if(node.elements.meters[displayKey]) {
        node.elements.meters[displayKey].style.width = `${currentValue * 100}%`
    }
    
    // Check threshold with the EXACT same value
    const threshold = node.values.thresholds[bandKey]
    const state = node.runtimeState.thresholdState[bandKey]
    const actionKey = bandKey === 'bassExciter' ? 'bassExciterThreshold' : `${bandKey}Threshold`
    
    // Check if we've crossed the threshold upward and enough time has passed
    if(currentValue >= threshold && !state.triggered) {
        if(now - state.lastTriggerTime >= node.values.debounceMs) {
            node.triggerAction(actionKey, 'down')
            state.triggered = true
            state.lastTriggerTime = now
            
            // Visual feedback - briefly brighten the threshold slider
            const slider = node.elements.thresholdSliders[bandKey]
            if(slider) {
                slider.style.background = 'hsl(var(--event-hue), calc(var(--event-sat) * 1.2), calc(var(--event-light) * 1.4))'
                slider.style.boxShadow = '0 0 8px var(--port-action-bg)'
                setTimeout(() => {
                    slider.style.background = 'var(--port-action-bg)'
                    slider.style.boxShadow = '0 1px 2px rgba(0,0,0,0.3)'
                }, 150)
            }
        }
    }
    // Reset trigger state when value drops below threshold
    else if(currentValue < threshold && state.triggered) {
        node.triggerAction(actionKey, 'up')
        state.triggered = false
    }
}

/**
 * Standard threshold values object
 */
export const DEFAULT_THRESHOLDS = {
    bass: 1.0,
    bassExciter: 1.0,
    mid: 1.0,
    high: 1.0
}

/**
 * Threshold values object with volume (for mic node)
 */
export const DEFAULT_THRESHOLDS_WITH_VOLUME = {
    bass: 1.0,
    bassExciter: 1.0,
    mid: 1.0,
    high: 1.0,
    volume: 1.0
}

/**
 * Standard threshold state object
 */
export const DEFAULT_THRESHOLD_STATE = {
    bass: {triggered: false, lastTriggerTime: 0},
    bassExciter: {triggered: false, lastTriggerTime: 0},
    mid: {triggered: false, lastTriggerTime: 0},
    high: {triggered: false, lastTriggerTime: 0}
}

/**
 * Threshold state object with volume (for mic node)
 */
export const DEFAULT_THRESHOLD_STATE_WITH_VOLUME = {
    bass: {triggered: false, lastTriggerTime: 0},
    bassExciter: {triggered: false, lastTriggerTime: 0},
    mid: {triggered: false, lastTriggerTime: 0},
    high: {triggered: false, lastTriggerTime: 0},
    volume: {triggered: false, lastTriggerTime: 0}
}

/**
 * Standard threshold action outputs
 */
export const THRESHOLD_ACTION_OUTPUTS = {
    'bassThreshold': {label: 'Bass Event', type: 'action'},
    'bassExciterThreshold': {label: 'Bass+ Event', type: 'action'},
    'midThreshold': {label: 'Mid Event', type: 'action'},
    'highThreshold': {label: 'High Event', type: 'action'}
}

/**
 * Threshold action outputs with volume (for mic node)
 */
export const THRESHOLD_ACTION_OUTPUTS_WITH_VOLUME = {
    'bassThreshold': {label: 'Bass Event', type: 'action'},
    'bassExciterThreshold': {label: 'Bass+ Event', type: 'action'},
    'midThreshold': {label: 'Mid Event', type: 'action'},
    'highThreshold': {label: 'High Event', type: 'action'},
    'volumeThreshold': {label: 'Volume Event', type: 'action'}
}