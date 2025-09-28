// settings.js - Complete rewrite for multi-color theme and wire color toggle

import {autowire, StringToFragment, mapJoin} from './utils.js'
import {Connection} from './connections.js'
import {themeManager} from './themeManager.js'
import {midiManager} from './midiManager.js'

// --- The settings object, exported for other modules to use ---
export const settings = {
    droopyCables: true,
    phiSpacedWires: true,  // Default to phi-spaced mode
    showPortBorders: true,  // Default to show port border colors
    stripedWires: true,    // Default to show striped wire effect
    reverseScrolling: false // Default to normal scrolling
}

// --- Module-level state ---
let settingsModal
let mainColorPicker, numberColorPicker, colorColorPicker, eventColorPicker

// Theme presets
const themePresets = {
    vanilla: {main: '#f52fbcff', number: '#10b981ff', color: '#f59e0bff', event: '#8b5cf6ff', icon: '🍦'},
    mountain: { main: "#6f82bcff", number: "#106c48ff", color: "#9b1919ff", event: "#78350fff", icon: '🏔️' },
    honey: {main: '#f59e0bff', number: '#eab308ff', color: '#ea580cff', event: '#a16207ff', icon: '🍯'},
    vapor: { main: "#3adfedff", number: "#a43aedff", color: "#ec4899ff", event: "#f5c02cff", icon: '💜' },
    gothic: { main: "#6b7280ff", number: "#4b5563ff", color: "#8d0000ff", event: "#1f2937ff", icon: '🦇' },
    av: { main: "#767676ff", number: "#ffffffff", color: "#facc15ff", event: "#fb3232ff", icon: '👨‍🔧' },
    graphite: { main: "#6a7d9aff", number: "#f9fafbff", color: "#06b6d4ff", event: "#ef4444ff", icon: '✏️' },
    paprika: { main: "#f45e2cff", number: "#fde047ff", color: "#10b981ff", event: "#f4723fff", icon: '🌶️' },
    rogue: { main: "#d63838ff", number: "#f43f5eff", color: "#fde047ff", event: "#0f766eff", icon: '🗡️' },
    blueprint: { main: "#1266cbff", number: "#fde047ff", color: "#93c5fdff", event: "#7e95c7ff", icon: '📐' },
    hazard: { main: "#808080ff", number: "#facc15ff", color: "#ef4444ff", event: "#22c55eff", icon: '⚠️' },
    aubergine: { main: "#901aebff", number: "#f43f5eff", color: "#34d399ff", event: "#7e95c7ff", icon: '🍆' },
    coralreef: { main: "#fb7185ff", number: "#0ea5e9ff", color: "#065f46ff", event: "#7e95c7ff", icon: '🪸' },
    polar: { main: "#f0f9ffff", number: "#0ea5e9ff", color: "#7e95c7ff", event: "#22c55eff", icon: '📄' },
    forest: { main: "#24a253ff", number: "#a3e635ff", color: "#f97316ff", event: "#10b981ff", icon: '🌲' },
    peachy: { main: "#fb923cff", number: "#b45309ff", color: "#f43f5eff", event: "#10b981ff", icon: '🍑' }
}

// --- DOM Element creators ---
function createSettingsModal(){
    const html = `
    <div class="modal-overlay" style="display: none;" data-el="settingsModal">
        <div class="modal-content">
            <h2>Settings</h2>
            
            <div class="form-group">
                <label>Theme Colors</label>
                <div style="display: flex; justify-content: space-around;">
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: center;">
                        <label style="font-size: 0.9rem; color: var(--text-secondary);">Main UI</label>
                        <s-color value="${themeManager.getColor('main')}" noalpha data-el="mainColorPicker"></s-color>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: center;">
                        <label style="font-size: 0.9rem; color: var(--text-secondary);">Number Ports</label>
                        <s-color value="${themeManager.getColor('number')}" noalpha data-el="numberColorPicker"></s-color>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: center;">
                        <label style="font-size: 0.9rem; color: var(--text-secondary);">Color Ports</label>
                        <s-color value="${themeManager.getColor('color')}" noalpha data-el="colorColorPicker"></s-color>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: center;">
                        <label style="font-size: 0.9rem; color: var(--text-secondary);">Event Ports</label>
                        <s-color value="${themeManager.getColor('event')}" noalpha data-el="eventColorPicker"></s-color>
                    </div>
                </div>
                <p class="help-text">Customize the color scheme for different interface elements and port types.</p>
                <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px solid var(--border-color);">
                    <label style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.5rem; display: block;">Theme Presets</label>
                    <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; max-width: 50rem; margin: 0 auto;">
                        ${mapJoin(themePresets, (preset, name) => 
                            `<button class="theme-preset" data-preset="${name}" style="padding: 4px 8px; border: 1px solid var(--border-color); background: var(--bg-secondary); border-radius: 4px; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">${preset.icon} ${name.charAt(0).toUpperCase() + name.slice(1)}</button>`
                        )}
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label for="setting-phi-spaced-wires" style="cursor:pointer; display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="setting-phi-spaced-wires" data-setting="phiSpacedWires">
                    <span>Use Phi-Spaced Wire Colors</span>
                </label>
                <p class="help-text" style="margin-top: 5px;">When checked, connection wires use golden ratio spaced colors. When unchecked, wires use theme colors matching their port types.</p>
            </div>

            <div class="form-group">
                <label for="setting-striped-wires" style="cursor:pointer; display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="setting-striped-wires" data-setting="stripedWires">
                    <span>Show Striped Wire Effect</span>
                </label>
                <p class="help-text" style="margin-top: 5px;">When checked, connection wires have a striped coil-cable appearance with dark shadows. When unchecked, wires are solid colors.</p>
            </div>

            <div class="form-group">
                <label for="setting-droopy-cables" style="cursor:pointer; display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="setting-droopy-cables" data-setting="droopyCables">
                    <span>Use Droopy Connection Cables</span>
                </label>
                <p class="help-text" style="margin-top: 5px;">Makes connection wires sag naturally instead of straight curves.</p>
            </div>

            <div class="form-group">
                <label for="setting-show-port-borders" style="cursor:pointer; display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="setting-show-port-borders" data-setting="showPortBorders">
                    <span>Show Port Border Colors</span>
                </label>
                <p class="help-text" style="margin-top: 5px;">Show colored borders around ports to match their connection wire colors.</p>
            </div>
            
            <div class="form-group">
                <label for="setting-reverse-scrolling" style="cursor:pointer; display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" id="setting-reverse-scrolling" data-setting="reverseScrolling">
                    <span>Reverse Horizontal Scrolling</span>
                </label>
                <p class="help-text" style="margin-top: 5px;">Reverses the direction of horizontal scrolling in the editor workspace.</p>
            </div>
            
            <div class="form-group">
                <label>MIDI Devices</label>
                <div id="midi-devices-list" style="margin-top: 0.5rem;">
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">Loading MIDI devices...</div>
                </div>
                <button id="refresh-midi-btn" style="width: 16rem; margin-top: 0.5rem; padding: 6px 12px; background: var(--bg-hover); border: 1px solid var(--primary-muted); border-radius: 4px; cursor: pointer;">
                    Refresh MIDI Devices
                </button>
                <button id="clear-midi-mappings-btn" style="width: 16rem; margin-top: 0.5rem; padding: 6px 12px; background: var(--bg-hover); border: 1px solid var(--primary-muted); border-radius: 4px; cursor: pointer;">
                    Clear All MIDI Mappings
                </button>
                <p class="help-text" style="margin-top: 5px;">Alt/Option+Click on any control to assign MIDI. Connected devices will appear here.</p>
            </div>
            
            <div class="modal-actions">
                <button class="cancel-btn" data-el="closeBtn">Close</button>
            </div>
        </div>
    </div>`

    const fragment = StringToFragment(html)
    const elements = autowire(fragment)
    document.getElementById('modal-container').appendChild(fragment)
    return elements
}

/**
 * Loads settings from localStorage into the settings object.
 */
function loadSettings(){
    try {
        const storedSettings = localStorage.getItem('silvia_settings')
        if(storedSettings){
            const parsed = JSON.parse(storedSettings)
            // Merge stored settings with defaults, ensuring new defaults are added
            Object.assign(settings, parsed)
        }
    } catch(e){
        console.error('Could not load settings from local storage:', e)
    }
}

/**
 * Saves the current settings object to localStorage.
 */
function saveSettings(){
    try {
        localStorage.setItem('silvia_settings', JSON.stringify(settings))
    } catch(e){
        console.error('Could not save settings to local storage:', e)
    }
}

/**
 * Updates the modal UI controls to reflect the current state of the settings object.
 */
function updateModalUI(){
    // Update checkboxes
    settingsModal.querySelectorAll('[data-setting]').forEach(control => {
        const key = control.dataset.setting
        if(Object.hasOwn(settings, key)){
            if(control.type === 'checkbox'){
                control.checked = settings[key]
            } else {
                control.value = settings[key]
            }
        }
    })
    
    // Update color pickers
    if(mainColorPicker) mainColorPicker.value = themeManager.getColor('main')
    if(numberColorPicker) numberColorPicker.value = themeManager.getColor('number')
    if(colorColorPicker) colorColorPicker.value = themeManager.getColor('color')
    if(eventColorPicker) eventColorPicker.value = themeManager.getColor('event')
}

/**
 * Initializes the settings system.
 */
export function initSettings(){
    loadSettings()
    
    // Apply loaded settings
    Connection.updatePortBorderVisibility()

    let closeBtn;
    ({closeBtn, settingsModal, mainColorPicker, numberColorPicker, colorColorPicker, eventColorPicker} = createSettingsModal())

    const openBtn = document.getElementById('settings-btn')
    if(!openBtn){
        console.error('Could not find #settings-btn to attach listener.')
        return
    }

    // --- Event Listeners ---
    openBtn.addEventListener('click', () => {
        updateModalUI()
        updateMIDIDevicesList()
        settingsModal.style.display = 'flex'
    })

    closeBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none'
    })

    settingsModal.addEventListener('click', (e) => {
        if(e.target === settingsModal){
            settingsModal.style.display = 'none'
        }
    })
    
    // Close on escape
    document.addEventListener('escape-pressed', () => {
        if(settingsModal.style.display === 'flex'){
            settingsModal.style.display = 'none'
        }
    })

    // Listen for theme color changes
    const handleColorChange = (colorType, picker) => {
        picker.addEventListener('change', (e) => {
            // Validate that the event came from the picker itself, not a child element
            if(e.target === picker) {
                themeManager.setColor(colorType, e.target.value)
            }
        })
    }

    handleColorChange('main', mainColorPicker)
    handleColorChange('number', numberColorPicker)
    handleColorChange('color', colorColorPicker)
    handleColorChange('event', eventColorPicker)

    // Listen for settings changes inside the modal
    settingsModal.addEventListener('change', (e) => {
        const {target} = e
        const settingKey = target.dataset.setting

        if(settingKey && Object.hasOwn(settings, settingKey)){
            if(target.type === 'checkbox'){
                settings[settingKey] = target.checked
            } else if(target.type === 'number'){
                settings[settingKey] = Number(target.value)
            } else {
                settings[settingKey] = target.value
            }

            saveSettings()

            // Apply side-effects of setting changes
            if(settingKey === 'droopyCables'){
                Connection.redrawAllConnections()
            } else if(settingKey === 'phiSpacedWires'){
                Connection.redrawAllConnections()
            } else if(settingKey === 'stripedWires'){
                Connection.redrawAllConnections()
            } else if(settingKey === 'showPortBorders'){
                Connection.updatePortBorderVisibility()
            }
        }
    })

    // Set initial wire color mode
    Connection.updateThemeClass?.()
    
    // MIDI device buttons
    const refreshMidiBtn = document.getElementById('refresh-midi-btn')
    const clearMidiBtn = document.getElementById('clear-midi-mappings-btn')
    
    if(refreshMidiBtn){
        refreshMidiBtn.addEventListener('click', () => {
            updateMIDIDevicesList()
        })
    }
    
    if(clearMidiBtn){
        clearMidiBtn.addEventListener('click', () => {
            if(confirm('Clear all MIDI mappings from current patch? This cannot be undone.')){
                midiManager.clearAllMappings()
                alert('All MIDI mappings have been cleared from the current patch.')
            }
        })
    }
    
    // Theme preset buttons
    settingsModal.addEventListener('click', (e) => {
        if(e.target.classList.contains('theme-preset')){
            const preset = e.target.dataset.preset
            if(themePresets[preset]){
                applyThemePreset(preset)
                updateModalUI()
            }
        }
    })
}

/**
 * Applies a theme preset to the theme manager
 */
function applyThemePreset(presetName){
    const preset = themePresets[presetName]
    if(!preset) return
    
    themeManager.setColor('main', preset.main)
    themeManager.setColor('number', preset.number)  
    themeManager.setColor('color', preset.color)
    themeManager.setColor('event', preset.event)
}

/**
 * Updates the MIDI devices list in the settings modal
 */
function updateMIDIDevicesList(){
    const devicesContainer = document.getElementById('midi-devices-list')
    if(!devicesContainer) return
    
    // Check if MIDI is available
    if(midiManager.midiDisabled){
        devicesContainer.innerHTML = `
            <div style="color: var(--text-secondary); font-size: 0.9rem;">
                MIDI not available in this browser.
                ${midiManager.isFirefox ? '<br>Install the Jazz-MIDI add-on for Firefox.' : ''}
            </div>
        `
        return
    }
    
    // Get connected MIDI devices
    const devices = Array.from(midiManager.inputs.values())
    
    if(devices.length === 0){
        devicesContainer.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.9rem;">No MIDI devices connected</div>'
    } else {
        devicesContainer.innerHTML = devices.map(device => `
            <div style="padding: 4px 0; color: var(--text-primary); font-size: 0.9rem;">
                ✓ ${device.name} ${device.manufacturer ? `(${device.manufacturer})` : ''}
            </div>
        `).join('')
    }
}