/*
 * This file is part of Silvia.
 * Copyright (C) 2025 Silvia Team
 * 
 * Silvia is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import './js/editor.js'
import './js/nodes/index.js'
import './js/snumber.js'
import './js/scolor.js'
import './js/audioAnalyzer.js'
import './js/midiManager.js'
import { SNode } from './js/snode.js'
import { createMenu } from './js/menu.js'
import { BackgroundRenderer } from './js/nodes/_background.js'
import { initSettings, settings } from './js/settings.js'
import { initSave, serializeWorkspace } from './js/save.js'
import { initLoad, deserializeWorkspace } from './js/load.js'
import { addVersionToPatch, getCurrentVersion } from './js/version.js'
import { initHowto } from './js/howto.js'
import { initAbout, showAbout } from './js/about.js'
import { Connection } from './js/connections.js'
import { updateCropButtonState, expandWorkspaceToViewport } from './js/editor.js'
import { themeManager } from './js/themeManager.js'
import { AssetManager } from './js/assetManager.js'
import { masterMixer } from './js/masterMixer.js'
import { masterMixerUI } from './js/masterMixerUI.js'

// Global dirty tracking
window.isDirty = false
window.markDirty = () => { window.isDirty = true }
window.markClean = () => { window.isDirty = false }

// --- Centralized Resize Handler ---
let resizeRequestPending = false

function onWindowResize() {
    if (resizeRequestPending) {
        return // A resize is already scheduled
    }
    resizeRequestPending = true

    requestAnimationFrame(() => {
        // 0. Expand workspace width if the window has grown
        expandWorkspaceToViewport()

        // 1. Update the absolute coordinates of all node ports
        for (const node of SNode.nodes) {
            node.updatePortPoints()
        }

        // 2. Redraw all connection lines based on the new port coordinates
        Connection.redrawAllConnections()

        // 3. Tell all WebGL renderers to resize their canvases and framebuffers
        for (const output of SNode.outputs) {
            output.renderer?.onResize()
        }

        // 4. Update the state of the workspace UI controls
        updateCropButtonState()

        // 5. Allow the next resize event to be scheduled
        resizeRequestPending = false
    })
}

// --- Workspace Save Functions ---
const WORKSPACE_SAVE_KEYS = {
    1: 'silvia_workspace_1',
    2: 'silvia_workspace_2'
}
const WORKSPACE_SAVE_FILENAMES = {
    1: 'workspace_1',
    2: 'workspace_2'
}


function isWorkspaceEmpty(workspaceNumber) {
    const currentWorkspace = SNode.currentWorkspace
    SNode.currentWorkspace = workspaceNumber
    const nodes = SNode.getNodesInCurrentWorkspace()
    SNode.currentWorkspace = currentWorkspace
    return nodes.length === 0
}

async function saveWorkspace(workspaceNumber) {
    try {
        // Delete if workspace is empty
        if (isWorkspaceEmpty(workspaceNumber)) {
            console.log(`Workspace ${workspaceNumber} is empty, deleting saved workspace`)

            const storageKey = WORKSPACE_SAVE_KEYS[workspaceNumber]
            const filename = `${WORKSPACE_SAVE_FILENAMES[workspaceNumber]}.svs`

            if (window.electronAPI) {
                try {
                    await window.electronAPI.deletePatchFile(filename)
                } catch (error) {
                    // File might not exist, that's fine
                }
            }
            localStorage.removeItem(storageKey)

            window.markClean()
            return true
        }

        // Temporarily switch to the workspace we want to save
        const originalWorkspace = SNode.currentWorkspace
        SNode.currentWorkspace = workspaceNumber

        const patch = serializeWorkspace()

        // Restore original workspace
        SNode.currentWorkspace = originalWorkspace

        // Add save metadata with formatted datetime
        const now = new Date()
        const formattedDateTime = now.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })

        patch.meta = {
            name: `Workspace ${workspaceNumber}`,
            description: `Saved workspace ${workspaceNumber} on ${formattedDateTime}`,
            author: 'System',
            timestamp: now.toISOString(),
            workspace: workspaceNumber
        }

        // Add version number to workspace save
        addVersionToPatch(patch)

        const storageKey = WORKSPACE_SAVE_KEYS[workspaceNumber]
        const filename = WORKSPACE_SAVE_FILENAMES[workspaceNumber]

        // Check if running in Electron mode
        if (typeof window !== 'undefined' && window.electronAPI) {
            try {
                await window.electronAPI.savePatchFile(patch, filename)
                console.log(`Saved workspace ${workspaceNumber} to file`)
            } catch (error) {
                console.warn(`Could not save workspace ${workspaceNumber} to file, falling back to localStorage:`, error)
                localStorage.setItem(storageKey, JSON.stringify(patch))
            }
        } else {
            // Web mode: use localStorage
            localStorage.setItem(storageKey, JSON.stringify(patch))
        }
        window.markClean()
        return true
    } catch (e) {
        console.warn(`Could not save workspace ${workspaceNumber}:`, e)
        return false
    }
}

async function loadWorkspaceSave(workspaceNumber) {
    try {
        const storageKey = WORKSPACE_SAVE_KEYS[workspaceNumber]
        const filename = `${WORKSPACE_SAVE_FILENAMES[workspaceNumber]}.svs`

        // Check if running in Electron mode
        if (typeof window !== 'undefined' && window.electronAPI) {
            try {
                const patchData = await window.electronAPI.loadPatchFile(filename)
                // Switch to target workspace and load
                SNode.setCurrentWorkspace(workspaceNumber)
                deserializeWorkspace(patchData)
                window.markClean()
                console.log(`Restored workspace ${workspaceNumber} from file`)
                return true
            } catch (error) {
                console.log(`No saved file found for workspace ${workspaceNumber}, checking localStorage`)
                // Fall back to localStorage if file doesn't exist
            }
        }

        // Web mode or fallback: use localStorage
        const saveData = localStorage.getItem(storageKey)
        if (saveData) {
            const patch = JSON.parse(saveData)
            // Switch to target workspace and load
            SNode.setCurrentWorkspace(workspaceNumber)
            deserializeWorkspace(patch)
            window.markClean()
            console.log(`Restored workspace ${workspaceNumber} from localStorage`)
            return true
        }
    } catch (e) {
        console.warn(`Could not load workspace save for workspace ${workspaceNumber}:`, e)
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(WORKSPACE_SAVE_KEYS[workspaceNumber])
        }
    }
    return false
}

async function saveAllWorkspaces() {
    console.log('Saving all workspaces...')
    const results = await Promise.all([
        saveWorkspace(1),
        saveWorkspace(2)
    ])
    const success = results.every(result => result)
    return success
}

async function loadAllWorkspaces() {
    // Load workspace 1 first
    const loaded1 = await loadWorkspaceSave(1)

    // Load workspace 2
    const loaded2 = await loadWorkspaceSave(2)

    // Switch back to workspace 1 as default
    SNode.setCurrentWorkspace(1)

    return loaded1 || loaded2
}


// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize theme system (required for CSS variables)
    themeManager.applyTheme()

    // 2. Initialize core systems that need DOM elements
    Connection.init()
    BackgroundRenderer.init()
    masterMixer.init()
    masterMixerUI.init()

    // 3. Initialize UI components and managers
    createMenu()
    initSettings()
    initSave()
    initLoad()
    initAbout()
    initHowto()

    // 4. Add listener for the projector button
    const projectorBtn = document.getElementById('projector-btn')
    if (projectorBtn) {
        projectorBtn.addEventListener('click', () => {
            BackgroundRenderer.openProjector()
        })
    }

    // 5. Setup workspace toggle functionality
    const workspaceToggleBtn = document.getElementById('workspace-toggle-btn')
    if (workspaceToggleBtn) {
        workspaceToggleBtn.addEventListener('click', () => {
            const newWorkspace = SNode.currentWorkspace === 1 ? 2 : 1
            SNode.setCurrentWorkspace(newWorkspace)
            workspaceToggleBtn.textContent = `Workspace ${newWorkspace}`
        })
    }

    // Setup save workspaces button
    const saveWorkspacesBtn = document.getElementById('save-workspaces-btn')
    if (saveWorkspacesBtn) {
        const iconEl = saveWorkspacesBtn.querySelector('.btn-icon')
        const originalIcon = iconEl.textContent

        saveWorkspacesBtn.addEventListener('click', async () => {
            // Add saving state with smooth visual feedback
            saveWorkspacesBtn.disabled = true
            saveWorkspacesBtn.classList.add('saving')
            iconEl.textContent = '⏳'

            const success = await saveAllWorkspaces()

            // Remove saving state and show result
            saveWorkspacesBtn.classList.remove('saving')
            if (success) {
                saveWorkspacesBtn.classList.add('saved')
                iconEl.textContent = '✓'
                setTimeout(() => {
                    saveWorkspacesBtn.classList.remove('saved')
                    iconEl.textContent = originalIcon
                    saveWorkspacesBtn.disabled = false
                }, 1500)
            } else {
                saveWorkspacesBtn.classList.add('failed')
                iconEl.textContent = '✗'
                setTimeout(() => {
                    saveWorkspacesBtn.classList.remove('failed')
                    iconEl.textContent = originalIcon
                    saveWorkspacesBtn.disabled = false
                }, 1500)
            }
        })
    }

    // 6. Check if this is the user's first visit and show about
    const hasVisitedBefore = localStorage.getItem('silvia_has_visited')
    if (!hasVisitedBefore) {
        // Mark that the user has visited
        localStorage.setItem('silvia_has_visited', 'true')
        // Show the about dialog
        showAbout()
    }

    // 7. Try to restore saved workspaces, or create default nodes for a new session
    const restoredWorkspaces = await loadAllWorkspaces()
    if (!restoredWorkspaces) {
        // Create the init patch
        const patch = {
            "nodes": [
                {
                    "id": 4,
                    "slug": "kaleidoscope",
                    "x": 658,
                    "y": 92,
                    "controls": {
                        "segments": 16,
                        "offset": 0.24,
                        "twist": 0,
                        "zoom": 1,
                        "sourceSegment": 1
                    },
                    "optionValues": {
                        "style": "classic"
                    },
                    "controlRanges": {
                        "sourceSegment": {
                            "min": 1,
                            "max": 16
                        }
                    }
                },
                {
                    "id": 5,
                    "slug": "fractalnoise",
                    "x": 75,
                    "y": 67,
                    "controls": {
                        "foreground": "#000000ff",
                        "background": "#ffffffff",
                        "scale": 5,
                        "timeSpeed": 0.27,
                        "octaves": 4,
                        "lacunarity": 2,
                        "gain": 0.5,
                        "contrast": 1
                    },
                    "optionValues": {
                        "type": "standard"
                    }
                },
                {
                    "id": 6,
                    "slug": "output",
                    "x": 974,
                    "y": 46,
                    "controls": {
                        "showA": "",
                        "showB": "",
                        "snap": "",
                        "rec": ""
                    },
                    "optionValues": {
                        "resolution": "1280x720",
                        "recordDuration": "manual"
                    },
                    "values": {
                        "frameHistorySize": 10
                    }
                },
                {
                    "id": 12,
                    "slug": "tunnel",
                    "x": 348,
                    "y": 97,
                    "controls": {
                        "distance": 0.45,
                        "speed": 0.1,
                        "rotation": 0
                    }
                }
            ],
            "connections": [
                {
                    "fromNode": 4,
                    "fromPort": "output",
                    "toNode": 6,
                    "toPort": "input"
                },
                {
                    "fromNode": 5,
                    "fromPort": "color",
                    "toNode": 12,
                    "toPort": "texture"
                },
                {
                    "fromNode": 12,
                    "fromPort": "output",
                    "toNode": 4,
                    "toPort": "input"
                }
            ],
            "editorWidth": 1653,
            "meta": {
                "name": "Example Patch",
                "author": "Silvia",
                "description": "A simple patch to get you started!"
            },
            "version": getCurrentVersion()
        }

        deserializeWorkspace(patch)
        window.markClean()
    }

    // Ensure initial workspace visibility is correct
    SNode.updateWorkspaceVisibility()

    // 8. Start the global render loop
    renderLoop(0)

    // 9. Attach comprehensive window state change listeners
    window.addEventListener('resize', onWindowResize)

    // Additional listeners for macOS window state changes
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Window became visible again (un-minimized)
            setTimeout(onWindowResize, 100) // Small delay for OS to finish transition
        }
    })

    window.addEventListener('focus', () => {
        // Window regained focus (could be from minimize/maximize)
        setTimeout(onWindowResize, 50)
    })

    // Handle page show event (browser back/forward, window restoration)
    window.addEventListener('pageshow', (e) => {
        if (e.persisted || performance.navigation.type === 2) {
            setTimeout(onWindowResize, 100)
        }
    })

    // Initial call to set up dimensions
    onWindowResize()

    // 10. Listen for theme changes to update connection colors
    document.addEventListener('themeChanged', () => {
        Connection.redrawAllConnections()
        console.log(`🎨 Theme updated:`, themeManager.getAllColors())
    })

    // 11. Global key handlers for system functions
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Blur any focused input/textarea elements
            const activeEl = document.activeElement
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                activeEl.blur()
            }

            // Dispatch a custom event that components can listen to
            document.dispatchEvent(new CustomEvent('escape-pressed'))
        }

        if (e.key === 'p' || e.key === 'P') {
            // Only dispatch if not typing in an input field
            const activeEl = document.activeElement
            if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA')) {
                // Dispatch custom event for putting down dragging nodes
                document.dispatchEvent(new CustomEvent('p-key-pressed'))
            }
        }

    })

    // 12. Add global dirty tracking for control changes
    document.addEventListener('input', (e) => {
        // Only track changes to node controls, not interface elements
        if (e.target.closest('.node-input') || e.target.closest('.node-options')) {
            window.markDirty()
        }
    })

    document.addEventListener('change', (e) => {
        // Only track changes to node controls, not interface elements
        if (e.target.closest('.node-input') || e.target.closest('.node-options')) {
            window.markDirty()
        }
    })

    // 13. Initialize asset manager (Electron only)
    if (isElectronMode) {

        const assetManagerBtn = document.getElementById('asset-manager-btn')
        if (assetManagerBtn) {
            assetManagerBtn.style.display = 'block' // Show button in Electron mode
            assetManagerBtn.addEventListener('click', () => {
                AssetManager.showGlobalAssetManager()
            })
        }

        // Handle opening .svs files from command line or drag-and-drop
        if (window.electronAPI && window.electronAPI.onOpenPatchFile) {
            window.electronAPI.onOpenPatchFile(async (filePath) => {
                try {
                    console.log(`Opening patch file from: ${filePath}`)
                    const patchData = await window.electronAPI.loadPatchFromPath(filePath)
                    deserializeWorkspace(patchData)
                    console.log(`Successfully loaded patch: ${filePath}`)
                } catch (error) {
                    console.error('Failed to open patch file:', error)
                    alert(`Failed to open patch file: ${error.message}`)
                }
            })
        }
    }


    function createCloseConfirmationModal() {
        const html = `
        <div class="modal-overlay" id="close-confirmation-modal" style="display: none;">
            <div class="modal-content close-confirmation-content">
                <h2>⚠️ Unsaved Changes</h2>
                <div class="close-warning-content">
                    <p>You have unsaved changes that will be lost if you close now.</p>
                    <div class="close-warning-details">
                        <p><strong>Current Workspace:</strong> <span id="close-current-workspace"></span></p>
                    </div>
                    <p class="close-warning-advice">The save button will save both workspaces. You can also use <kbd>Ctrl+Shift+S</kbd></p>
                </div>
                <div class="modal-actions">
                    <button id="close-confirm-save-btn" class="save-and-close-btn">💾 Save & Close</button>
                    <button id="close-confirm-leave-btn" class="leave-anyway-btn">Leave Anyway</button>
                    <button id="close-confirm-stay-btn" class="cancel-btn">Stay & Continue Working</button>
                </div>
            </div>
        </div>`

        document.getElementById('modal-container').insertAdjacentHTML('beforeend', html)

        const modal = document.getElementById('close-confirmation-modal')
        const saveBtn = document.getElementById('close-confirm-save-btn')
        const leaveBtn = document.getElementById('close-confirm-leave-btn')
        const stayBtn = document.getElementById('close-confirm-stay-btn')

        return { modal, saveBtn, leaveBtn, stayBtn }
    }

    // Make this function globally available for Electron
    window.showCloseConfirmation = async function showCloseConfirmation() {
        if (!window.isDirty) {
            return true // No warning needed, allow close
        }

        const { modal, saveBtn, leaveBtn, stayBtn } = createCloseConfirmationModal()

        // Populate modal content
        const workspaceEl = document.getElementById('close-current-workspace')
        workspaceEl.textContent = `Workspace ${SNode.currentWorkspace}`

        modal.style.display = 'flex'

        return new Promise((resolve) => {
            const cleanup = () => {
                modal.remove()
            }

            saveBtn.onclick = async () => {
                cleanup()
                // Save and then close
                const saved = await saveAllWorkspaces()
                if (saved) {
                    resolve(true) // Allow close after successful save
                } else {
                    // If save failed, ask again
                    const retryClose = await showCloseConfirmation()
                    resolve(retryClose)
                }
            }

            leaveBtn.onclick = () => {
                cleanup()
                resolve(true) // Allow close without saving
            }

            stayBtn.onclick = () => {
                cleanup()
                resolve(false) // Stay open
            }

            // Close on escape
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    stayBtn.click()
                    document.removeEventListener('keydown', escapeHandler)
                }
            }
            document.addEventListener('keydown', escapeHandler)
        })
    }

    // For web browsers, still use beforeunload for page navigation
    function handleBeforeUnload(e) {
        if (window.isDirty && !window.electronAPI) {
            // Only show generic browser warning for web
            e.preventDefault()
            e.returnValue = 'You have unsaved changes.'
            return 'You have unsaved changes.'
        }
    }

    if (!window.electronAPI) {
        // Web mode: use standard beforeunload
        window.addEventListener('beforeunload', handleBeforeUnload)
        window.onbeforeunload = handleBeforeUnload
    }

    // Add keyboard shortcut for saving all workspaces (Ctrl/Cmd + Shift + S)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
            e.preventDefault()
            saveWorkspacesBtn?.click() // Trigger the save workspaces button
        }
    })
})

// --- Global Render Loop ---
// This loop continuously calls the `updateOutput` method for all active output nodes.
function renderLoop(time) {
    // Convert time to seconds
    const timeInSeconds = time * 0.001

    for (const outputNode of SNode.outputs) {
        if (outputNode.updateOutput) {
            outputNode.updateOutput(timeInSeconds)
        }
    }

    // Update master mixer
    if (masterMixer.isInitialized) {
        masterMixer.updateMasterOutput()
    }

    requestAnimationFrame(renderLoop)
}