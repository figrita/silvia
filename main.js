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
import { WorkspaceManager } from './js/workspaceManager.js'
import { workspaceTabBar } from './js/workspaceTabBar.js'

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

// --- Session Save/Load Functions ---
const SESSION_STORAGE_KEY = 'silvia_session'
const SESSION_FILENAME = 'session'


/**
 * Serialize the entire session (all workspaces with their nodes and connections).
 */
function serializeSession() {
    // Get workspace structure
    const workspaceData = WorkspaceManager.serializeSession()

    // Get all nodes and connections across all workspaces
    const patch = serializeWorkspace(true)

    const session = {
        ...workspaceData,
        nodes: patch.nodes,
        connections: patch.connections,
        editorWidth: patch.editorWidth
    }

    // Add save metadata
    const now = new Date()
    session.savedAt = now.toISOString()

    return session
}

/**
 * Save the entire session to storage.
 */
async function saveSession() {
    try {
        const session = serializeSession()
        const sessionJson = JSON.stringify(session)

        // Check if running in Electron mode
        if (typeof window !== 'undefined' && window.electronAPI) {
            try {
                await window.electronAPI.savePatchFile(session, SESSION_FILENAME)
                console.log('Session saved to file')
            } catch (error) {
                console.warn('Could not save session to file, falling back to localStorage:', error)
                localStorage.setItem(SESSION_STORAGE_KEY, sessionJson)
            }
        } else {
            // Web mode: use localStorage
            localStorage.setItem(SESSION_STORAGE_KEY, sessionJson)
        }

        window.markClean()
        return true
    } catch (e) {
        console.error('Could not save session:', e)
        return false
    }
}

/**
 * Load the session from storage.
 */
async function loadSession() {
    try {
        let sessionData = null

        // Check if running in Electron mode
        if (typeof window !== 'undefined' && window.electronAPI) {
            try {
                sessionData = await window.electronAPI.loadPatchFile(`${SESSION_FILENAME}.svs`)
                console.log('Session loaded from file')
            } catch (error) {
                console.log('No saved session file found, checking localStorage')
            }
        }

        // Fall back to localStorage
        if (!sessionData) {
            const saveData = localStorage.getItem(SESSION_STORAGE_KEY)
            if (saveData) {
                sessionData = JSON.parse(saveData)
                console.log('Session loaded from localStorage')
            }
        }

        if (sessionData && sessionData.workspaces) {
            // Restore workspace structure
            WorkspaceManager.restoreSession(sessionData)

            // Load nodes and connections
            if (sessionData.nodes && sessionData.nodes.length > 0) {
                // Import required functions
                const { setWorkspaceWidth } = await import('./js/editor.js')

                // Create nodes and build mapping from saved ID to new node
                const nodeById = new Map()
                for (const nodeData of sessionData.nodes) {
                    try {
                        const savedId = nodeData.id
                        const newNode = new SNode(nodeData.slug, nodeData.x, nodeData.y, nodeData)
                        nodeById.set(savedId, newNode)
                    } catch (err) {
                        console.error(`Failed to create node "${nodeData.slug}":`, err)
                    }
                }

                for (const conn of (sessionData.connections || [])) {
                    const src = nodeById.get(conn.fromNode)
                    const dest = nodeById.get(conn.toNode)
                    if (src && dest) {
                        const srcPort = src.output[conn.fromPort]
                        const destPort = dest.input[conn.toPort]
                        if (srcPort && destPort) {
                            try {
                                new Connection(srcPort, destPort)
                            } catch (err) {
                                console.error('Connection failed:', err)
                            }
                        }
                    }
                }

                // Restore editor width
                if (sessionData.editorWidth) {
                    setWorkspaceWidth(sessionData.editorWidth)
                }

                // Update visuals
                SNode.nodes.forEach(node => node.updatePortPoints())
                Connection.redrawAllConnections()
            }

            SNode.updateVisibility()
            window.markClean()
            return true
        }
    } catch (e) {
        console.warn('Could not load session:', e)
    }
    return false
}


/**
 * Load all workspaces from session storage.
 */
async function loadAllWorkspaces() {
    return await loadSession()
}

/**
 * Save all workspaces using the new session format.
 */
async function saveAllWorkspaces() {
    console.log('Saving session...')
    return await saveSession()
}


// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Initialize WorkspaceManager FIRST (before any nodes can be created)
    WorkspaceManager.init()

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

    // 5. Initialize workspace tab bar
    workspaceTabBar.init()
    window.workspaceTabBar = workspaceTabBar // Expose for load.js

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

    // Ensure initial workspace/layer visibility is correct
    SNode.updateVisibility()

    // Re-render the tab bar after session load (in case workspaces were loaded)
    workspaceTabBar.render()

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
        const activeEl = document.activeElement
        const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.contentEditable === 'true')

        if (e.key === 'Escape') {
            // Blur any focused input/textarea elements
            if (isTyping) {
                activeEl.blur()
            }

            // Dispatch a custom event that components can listen to
            document.dispatchEvent(new CustomEvent('escape-pressed'))
        }

        if ((e.key === 'p' || e.key === 'P') && !isTyping) {
            // Dispatch custom event for putting down dragging nodes
            document.dispatchEvent(new CustomEvent('p-key-pressed'))
        }

        // Workspace keyboard shortcuts (only when not typing)
        if (!isTyping) {
            // Ctrl+T: New workspace
            if ((e.ctrlKey || e.metaKey) && e.key === 't') {
                e.preventDefault()
                workspaceTabBar.createNewWorkspace()
            }

            // Ctrl+W: Close workspace (with confirmation)
            if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
                e.preventDefault()
                const activeWs = WorkspaceManager.getActiveWorkspace()
                if (activeWs) {
                    workspaceTabBar.deleteWorkspace(activeWs)
                }
            }

            // Ctrl+1-9: Switch to workspace 1-9
            if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
                e.preventDefault()
                const wsIndex = parseInt(e.key) - 1
                const allWorkspaces = WorkspaceManager.getAll()
                if (wsIndex < allWorkspaces.length) {
                    WorkspaceManager.setActive(allWorkspaces[wsIndex].id)
                    SNode.updateVisibility()
                    workspaceTabBar.render()
                }
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
        const ws = WorkspaceManager.getActiveWorkspace()
        workspaceEl.textContent = ws?.name || 'Workspace'

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