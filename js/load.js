import {autowire, StringToFragment} from './utils.js'
import {SNode} from './snode.js'
import {Connection} from './connections.js'
import {clearWorkspace, setWorkspaceWidth} from './editor.js'
import {PatchValidator} from './patchValidator.js'
import {nodeList} from './registry.js'
import {WorkspaceManager} from './workspaceManager.js'

/**
 * Create nodes and connections from patch data.
 * Shared helper for all patch loading functions.
 * @param {Array} nodes - Array of node data from patch
 * @param {Array} connections - Array of connection data from patch
 * @returns {{nodeMap: Map, errors: Array, failedIds: Set}}
 */
export function createNodesAndConnections(nodes, connections) {
    const nodeMap = new Map()
    const errors = []
    const failedIds = new Set()

    // Phase 1: Create nodes
    nodes.forEach(nodeData => {
        const oldId = nodeData.id
        try {
            const newNode = new SNode(nodeData.slug, nodeData.x, nodeData.y, nodeData)
            nodeMap.set(oldId, newNode)
        } catch (err) {
            errors.push(`Failed to create node "${nodeData.slug}" (ID: ${oldId}): ${err.message}`)
            console.error(errors[errors.length - 1], err)
            failedIds.add(oldId)
        }
    })

    // Phase 2: Create connections (output connections last to minimize recompiles)
    if (connections) {
        const outputConns = []
        const regularConns = []

        connections.forEach(conn => {
            if (failedIds.has(conn.fromNode) || failedIds.has(conn.toNode)) {
                errors.push(`Skipping connection (involves failed node): ${conn.fromNode}.${conn.fromPort} → ${conn.toNode}.${conn.toPort}`)
                return
            }
            const dest = nodeMap.get(conn.toNode)
            if (dest?.slug === 'output') {
                outputConns.push(conn)
            } else {
                regularConns.push(conn)
            }
        })

        const createConnection = (conn) => {
            const src = nodeMap.get(conn.fromNode)
            const dest = nodeMap.get(conn.toNode)
            if (!src || !dest) {
                errors.push(`Missing node for connection: ${JSON.stringify(conn)}`)
                return
            }
            const srcPort = src.output[conn.fromPort]
            const destPort = dest.input[conn.toPort]
            if (!srcPort || !destPort) {
                errors.push(`Missing port for connection: ${JSON.stringify(conn)}`)
                return
            }
            try {
                new Connection(srcPort, destPort)
            } catch (err) {
                errors.push(`Connection failed: ${err.message}`)
            }
        }

        regularConns.forEach(createConnection)
        outputConns.forEach(createConnection)
    }

    return {nodeMap, errors, failedIds}
}

// --- Module-level state ---
let selectedPatchData = null
let defaultPatchesCache = null

// --- DOM Elements (will be populated by autowire) ---
let loadModal
let loadConfirmBtn
let localPatchListEl
let defaultsPatchListEl
let patchFileUploadEl
let clearWorkspaceCheckbox
let copyUploadToPatchesCheckbox
let uploadSvsBtn
let filesystemTab
let loadCancelBtnFooter
let folderListEl
let clearCheckboxLabelEl

// --- Tab state ---
let activeTab = 'default'
let selectedFolder = null
let patchFolders = []

function createLoadModal(){
    const html = `
	<div class="modal-overlay" style="display: none;" data-el="loadModal">
		<div class="load-modal-window">
			<!-- Header -->
			<div class="load-modal-header">
				<h2>📂 Load Patch</h2>
				<div class="load-modal-header-controls">
					<label class="load-upload-checkbox" style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary);">
						<input type="checkbox" data-el="copyUploadToPatchesCheckbox" checked>
						Save uploaded patches
					</label>
					<button class="load-upload-btn" data-el="uploadSvsBtn">➕ Upload .svs File</button>
				</div>
			</div>

			<!-- Hidden file input for uploads -->
			<input type="file" id="patch-file-upload" accept=".svs,.json" style="display:none;" data-el="patchFileUploadEl">

			<!-- Tab Bar -->
			<div class="load-modal-tab-bar">
				<button class="load-tab load-tab-active" data-tab="default">
					<span class="load-tab-icon">⭐</span>
					Default Patches
				</button>
				<button class="load-tab" data-tab="filesystem" data-el="filesystemTab">
					<span class="load-tab-icon">💾</span>
					Your Patches
				</button>
			</div>

			<!-- Content Area -->
			<div class="load-modal-main-container">
				<div class="load-modal-content-area">
					<!-- Tab content will be populated here -->
					<div class="load-tab-content" id="default-tab-content">
						<div class="patch-grid" data-el="defaultsPatchListEl">
							<p>Loading default patches...</p>
						</div>
					</div>
					<div class="load-tab-content load-tab-content-hidden" id="filesystem-tab-content">
						<div id="filesystem-content-container">
							<!-- Content will be dynamically populated based on web vs electron -->
						</div>
					</div>
				</div>
			</div>

			<!-- Footer Actions -->
			<div class="load-modal-footer">
				<label class="load-modal-checkbox-label">
					<input type="checkbox" id="clear-workspace-checkbox" checked data-el="clearWorkspaceCheckbox">
					<span data-el="clearCheckboxLabelEl">Clear this workspace on load</span>
				</label>
				<div class="load-modal-actions">
					<button disabled data-el="loadConfirmBtn" class="load-btn-primary">Load Patch</button>
					<button class="load-btn-secondary" data-el="loadCancelBtnFooter">Cancel</button>
				</div>
			</div>
		</div>
	</div>`

    const fragment = StringToFragment(html)
    const elements = autowire(fragment)
    document.getElementById('modal-container').appendChild(fragment)
    return elements
}

/**
 * Initializes the entire patcher system, hooks up event listeners.
 */
export function initLoad(){
    // Initialize the patch validator with allowed node types
    PatchValidator.initialize(nodeList)

    const loadElements = createLoadModal()

    // Assign autowired elements to our module-level variables
    ; ({
        loadModal,
        loadConfirmBtn,
        localPatchListEl,
        defaultsPatchListEl,
        patchFileUploadEl,
        clearWorkspaceCheckbox,
        copyUploadToPatchesCheckbox,
        uploadSvsBtn,
        filesystemTab,
        loadCancelBtnFooter,
        folderListEl,
        clearCheckboxLabelEl
    } = loadElements)


    const loadBtn = document.getElementById('load-patch-btn')
    loadBtn.addEventListener('click', openLoadModal)
    loadCancelBtnFooter.addEventListener('click', () => (loadModal.style.display = 'none'))

    // Upload button functionality
    uploadSvsBtn.addEventListener('click', () => {
        patchFileUploadEl.click()
    })

    // Setup filesystem tab content based on environment
    setupFilesystemTab()

    // Tab functionality
    setupTabFunctionality()

    // Close modals on overlay click
    loadModal.addEventListener('click', (e) => {
        if(e.target === loadModal){loadModal.style.display = 'none'}
    })

    loadConfirmBtn.addEventListener('click', handleLoad)

    patchFileUploadEl.addEventListener('change', handleFileUpload)

    // Initialize checkbox from localStorage and add change listener
    const savedClearWorkspace = localStorage.getItem('silvia_clear_workspace_on_load')
    clearWorkspaceCheckbox.checked = savedClearWorkspace !== 'false' // Default to true

    clearWorkspaceCheckbox.addEventListener('change', () => {
        localStorage.setItem('silvia_clear_workspace_on_load', clearWorkspaceCheckbox.checked)
        updateLoadModalText()
    })

    updateLoadModalText()
    
    // Close on escape
    document.addEventListener('escape-pressed', () => {
        if(loadModal.style.display === 'flex'){
            loadModal.style.display = 'none'
        }
    })
}

function updateLoadModalText(){
    // Update the clear checkbox label based on currently selected patch
    if (clearCheckboxLabelEl) {
        const isCompound = (selectedPatchData?.workspaceTree?.workspaces?.length || 0) > 1
        clearCheckboxLabelEl.textContent = isCompound
            ? 'Clear all workspaces on load'
            : 'Clear this workspace on load'
    }
}

function setupTabFunctionality(){
    const tabs = loadModal.querySelectorAll('.load-tab')
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabType = tab.getAttribute('data-tab')
            switchToTab(tabType)
        })
    })
}

function switchToTab(tabType){
    activeTab = tabType

    // Update tab appearances
    const tabs = loadModal.querySelectorAll('.load-tab')
    tabs.forEach(tab => {
        tab.classList.remove('load-tab-active')
    })

    const activeTabEl = loadModal.querySelector(`[data-tab="${tabType}"]`)
    if(activeTabEl) {
        activeTabEl.classList.add('load-tab-active')
    }

    // Show/hide tab content
    const defaultContent = loadModal.querySelector('#default-tab-content')
    const filesystemContent = loadModal.querySelector('#filesystem-tab-content')

    if(tabType === 'default') {
        defaultContent.classList.remove('load-tab-content-hidden')
        filesystemContent.classList.add('load-tab-content-hidden')
    } else {
        defaultContent.classList.add('load-tab-content-hidden')
        filesystemContent.classList.remove('load-tab-content-hidden')
    }
}

function setupFilesystemTab() {
    const filesystemTab = loadModal.querySelector('[data-tab="filesystem"]')
    const filesystemContentContainer = document.getElementById('filesystem-content-container')

    if (typeof window !== 'undefined' && window.electronAPI) {
        // Electron mode: Use filesystem layout with sidebar
        filesystemTab.innerHTML = '<span class="load-tab-icon">💾</span>Filesystem Patches'

        filesystemContentContainer.innerHTML = `
            <div class="filesystem-layout">
                <div class="filesystem-sidebar">
                    <div class="filesystem-sidebar-header">
                        <h4 style="margin: 0; font-size: 12px; color: var(--text-secondary); font-weight: 600; display: flex; align-items: center; gap: 6px; position: relative;">
                            Folders
                            <span class="folders-help-icon" style="
                                width: 12px;
                                height: 12px;
                                border-radius: 50%;
                                border: 1px solid var(--text-muted);
                                color: var(--text-muted);
                                font-size: 8px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                cursor: help;
                                font-weight: bold;
                                position: relative;
                            ">?
                                <span class="folders-tooltip" style="
                                    position: absolute;
                                    bottom: 100%;
                                    left: 70%;
                                    transform: translateX(-30%);
                                    background: var(--bg-interactive);
                                    border: 1px solid var(--border-normal);
                                    border-radius: 4px;
                                    padding: 6px 8px;
                                    font-size: 11px;
                                    white-space: nowrap;
                                    z-index: 1000;
                                    pointer-events: none;
                                    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                                    opacity: 0;
                                    visibility: hidden;
                                    margin-bottom: 4px;
                                    font-weight: normal;
                                ">One sublevel of folders is supported</span>
                            </span>
                        </h4>
                    </div>
                    <div class="folder-list-container">
                        <div class="folder-list" data-el="folderListEl">
                            <p>Loading folders...</p>
                        </div>
                    </div>
                </div>
                <div class="filesystem-content">
                    <div class="patch-grid" data-el="localPatchListEl">
                        <p>Loading your patches...</p>
                    </div>
                </div>
            </div>
        `
    } else {
        // Web mode: Simple grid layout without sidebar
        filesystemTab.innerHTML = '<span class="load-tab-icon">💾</span>Local Storage'

        filesystemContentContainer.innerHTML = `
            <div class="patch-grid" data-el="localPatchListEl">
                <p>Loading your patches...</p>
            </div>
        `
    }

    // Re-autowire the new elements
    const containerEl = document.getElementById('filesystem-content-container')
    const newLocalPatchListEl = containerEl.querySelector('[data-el="localPatchListEl"]')
    const newFolderListEl = containerEl.querySelector('[data-el="folderListEl"]')

    if (newLocalPatchListEl) {
        localPatchListEl = newLocalPatchListEl
    }
    if (newFolderListEl) {
        folderListEl = newFolderListEl
    }

    // Setup tooltip functionality for the folders help icon (Electron mode only)
    if (typeof window !== 'undefined' && window.electronAPI) {
        const helpIcon = containerEl.querySelector('.folders-help-icon')
        const tooltip = containerEl.querySelector('.folders-tooltip')

        if (helpIcon && tooltip) {
            helpIcon.addEventListener('mouseenter', () => {
                tooltip.style.opacity = '1'
                tooltip.style.visibility = 'visible'
            })

            helpIcon.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0'
                tooltip.style.visibility = 'hidden'
            })
        }
    }
}


function openLoadModal(){
    populateLoadModal()
    updateLoadModalText()
    loadModal.style.display = 'flex'
}

function handleLoad(){
    if(selectedPatchData){
        deserializeWorkspace(selectedPatchData, clearWorkspaceCheckbox.checked)
        loadModal.style.display = 'none'
    }
}

function handleFileUpload(event){
    const [file, ..._] = event.target.files
    if(!file){return}

    const reader = new FileReader()
    reader.onload = async (e) => {
        try {
            const patchData = JSON.parse(e.target.result)
            deserializeWorkspace(patchData, clearWorkspaceCheckbox.checked)

            // Copy to patches if checkbox is checked
            if(copyUploadToPatchesCheckbox.checked){
                const success = await copyPatchToStorage(patchData)
                if(success){
                    // Refresh the patches list if we're on the filesystem tab
                    if(activeTab === 'filesystem') {
                        populateLoadModal()
                    }
                }
            }

            loadModal.style.display = 'none'
        } catch(error){
            alert('Failed to parse file. Is it a valid .svs patch file?')
            console.error('File parsing error:', error)
        }
    }
    reader.readAsText(file)
    event.target.value = '' // Reset file input to allow re-uploading the same file
}

async function populateLoadModal(){
    // Clear previous state
    selectedPatchData = null
    loadConfirmBtn.disabled = true

    // Clear and set loading states
    if(localPatchListEl) {
        localPatchListEl.innerHTML = ''
    }
    if(defaultsPatchListEl) {
        defaultsPatchListEl.innerHTML = '<p>Loading default patches...</p>'
    }

    // Check if running in Electron mode
    if (typeof window !== 'undefined' && window.electronAPI) {
        // Electron mode: Load folders and patches with sidebar
        try {
            // Load folders and initial patches
            await loadPatchFolders()
            // Load patches for the selected folder (or first folder if none selected)
            await loadPatchesForFolder(selectedFolder)
        } catch (error) {
            console.error('Failed to load patches from workspace:', error)
            if(folderListEl) {
                folderListEl.innerHTML = '<p>Failed to load folders.</p>'
            }
            localPatchListEl.innerHTML = '<p>Failed to load patches from workspace.</p>'
        }
    } else {
        // Web mode: Load all patches from localStorage in simple grid
        try {
            const allPatches = getPatchesFromLocalStorage()

            if(allPatches.length === 0){
                localPatchListEl.innerHTML = '<p>No patches saved in local storage.</p>'
            } else {
                localPatchListEl.innerHTML = ''
                // Add all patches (workspace restores and regular patches)
                allPatches.forEach((patch, index) => {
                    const item = createPatchListItem(patch, index, null, false)
                    localPatchListEl.appendChild(item)
                })
            }
        } catch (error) {
            console.error('Failed to load patches from local storage:', error)
            localPatchListEl.innerHTML = '<p>Failed to load patches from local storage.</p>'
        }
    }

    // Load default patches (both web and Electron modes)
    await loadDefaultPatches()
}

function createPatchListItem(patch, patchIndex, patchFile = null, isAutosave = false, isDefaultPatch = false){
    const item = document.createElement('div')
    item.className = 'patch-card'
    const meta = patch.meta || {}
    const patchName = meta.name || 'Untitled'
    const patchDescription = meta.description || 'No description.'
    const patchAuthor = meta.author || 'Unknown Author'

    // Additional info for Electron mode (file-based patches)
    const modifiedDate = patchFile ? new Date(patchFile.modified).toLocaleDateString() : ''
    const fileSize = patchFile ? (patchFile.size / 1024).toFixed(1) + ' KB' : ''
    const wsCount = patch.workspaceTree?.workspaces?.length || 0

    // Create thumbnail preview
    const previewDiv = document.createElement('div')
    previewDiv.className = 'patch-card-preview'

    if (meta.thumbnail && meta.thumbnail.trim() !== '') {
        const img = document.createElement('img')
        img.src = meta.thumbnail
        img.alt = 'Patch thumbnail'
        img.onerror = () => {
            previewDiv.innerHTML = '<div class="no-thumbnail">No preview</div>'
        }
        previewDiv.appendChild(img)
    } else {
        previewDiv.innerHTML = '<div class="no-thumbnail">No preview</div>'
    }

    // Create info section
    const infoDiv = document.createElement('div')
    infoDiv.className = 'patch-card-info'

    // Add tooltip for description
    item.title = patchDescription

    infoDiv.innerHTML = `
        <div class="patch-card-name">${patchName}${wsCount > 1 ? `<span class="patch-card-compound-badge" title="${wsCount} workspaces">📦</span>` : ''}</div>
        <div class="patch-card-author">${patchAuthor}</div>
        <div class="patch-card-description">${patchDescription}</div>
        ${patchFile ? `<div class="patch-card-meta" style="font-size: 10px; color: var(--text-muted); margin-top: auto;">
            ${modifiedDate} • ${fileSize}
        </div>` : ''}
        <div class="patch-card-actions" style="margin-top: auto; display: flex; gap: 4px; flex-wrap: wrap;">
            <button class="patch-load-btn" title="Load patch" style="
                flex: 1;
                padding: 4px 8px;
                background: var(--primary-color);
                border: none;
                border-radius: 4px;
                color: white;
                font-size: 10px;
                cursor: pointer;
                min-width: 40px;
            ">Load</button>
            <button class="patch-new-ws-btn" title="Load as new workspace" style="
                padding: 4px 6px;
                background: var(--bg-interactive);
                border: 1px solid var(--border-normal);
                border-radius: 4px;
                color: var(--text-secondary);
                font-size: 10px;
                cursor: pointer;
                transition: background 0.2s;
            ">+New</button>
            <button class="patch-download-btn" title="Download .svs file" style="
                padding: 4px 6px;
                background: var(--bg-interactive);
                border: 1px solid var(--border-normal);
                border-radius: 4px;
                color: var(--text-secondary);
                font-size: 10px;
                cursor: pointer;
                transition: background 0.2s;
            ">💾</button>
            ${isDefaultPatch ? '' : `<button class="patch-delete-btn" title="Delete patch" style="
                padding: 4px 6px;
                background: var(--bg-interactive);
                border: 1px solid var(--border-normal);
                border-radius: 4px;
                color: var(--text-secondary);
                font-size: 10px;
                cursor: pointer;
            ">🗑️</button>`}
        </div>
    `

    item.appendChild(previewDiv)
    item.appendChild(infoDiv)

    // Load button - loads into current workspace
    const loadBtn = item.querySelector('.patch-load-btn')
    loadBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        selectedPatchData = patch
        deserializeWorkspace(patch, clearWorkspaceCheckbox.checked)
        loadModal.style.display = 'none'
    })

    // New workspace button - creates new workspace and loads patch there
    const newWsBtn = item.querySelector('.patch-new-ws-btn')
    newWsBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        loadPatchAsNewWorkspace(patch)
        loadModal.style.display = 'none'
    })

    // Also allow clicking the card itself to select (but not load immediately)
    item.addEventListener('click', () => {
        const currentSelection = loadModal.querySelector('.patch-card.selected')
        if(currentSelection){
            currentSelection.classList.remove('selected')
        }
        item.classList.add('selected')
        selectedPatchData = patch
        loadConfirmBtn.disabled = false
        updateLoadModalText()
    })

    const downloadBtn = item.querySelector('.patch-download-btn')
    downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation() // Prevent selecting the patch for loading
        const patchJsonString = JSON.stringify(patch, null, 2)
        const blob = new Blob([patchJsonString], {type: 'application/json'})
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const safeFilename = patchName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'patch'
        a.download = `${safeFilename}.svs`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    })

    if (!isDefaultPatch) {
        const deleteBtn = item.querySelector('.patch-delete-btn')
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation() // Prevent selecting the patch for loading
            
            const confirmMessage = `Are you sure you want to delete "${patchName}"? This action cannot be undone.`
            if(confirm(confirmMessage)){
                // Check if running in Electron mode
                if (typeof window !== 'undefined' && window.electronAPI && patchFile) {
                    try {
                        const success = await window.electronAPI.deletePatchFile(patchFile.filename)
                        if (success) {
                            populateLoadModal() // Refresh the list
                        } else {
                            alert('Failed to delete patch file.')
                        }
                    } catch (error) {
                        console.error('Failed to delete patch file:', error)
                        alert('Failed to delete patch file.')
                    }
                } else {
                    // Web mode: delete from localStorage
                    deletePatchFromLocalStorage(patchIndex, patch)
                    populateLoadModal() // Refresh the list
                }
            }
        })
    }

    return item
}

/**
 * Load a patch as new workspace(s).
 * For compound patches (multiple workspaces), creates all workspaces and maps visibility.
 * For single-workspace patches, creates one new workspace (legacy behavior).
 */
function loadPatchAsNewWorkspace(patchData) {
    try {
        const validation = PatchValidator.validate(patchData)
        if (validation.errors.length > 0) {
            console.warn('Patch validation warnings:', validation.errors)
        }
        patchData = validation.sanitized

        if (!patchData?.nodes) {
            throw new Error('Patch data is invalid or missing "nodes" array.')
        }

        const savedWorkspaces = patchData.workspaceTree?.workspaces || []
        const isCompound = savedWorkspaces.length > 1

        // Build workspace ID map: old saved IDs → new created IDs
        const idMap = new Map()
        let activeNewId = null
        let nodes

        if (isCompound) {
            // Compound patch: create all workspaces
            savedWorkspaces.forEach(ws => {
                const newWs = WorkspaceManager.create(ws.name)
                idMap.set(ws.id, newWs.id)
            })
            // Determine which to activate
            const savedActiveId = patchData.workspaceTree?.activeWorkspaceId
            activeNewId = idMap.get(savedActiveId) || idMap.values().next().value

            // Remap node workspace visibility on shallow copies to avoid mutating cached patchData
            nodes = patchData.nodes.map(n => ({...n}))
            nodes.forEach(n => {
                if (n.workspaceVisibility && Array.isArray(n.workspaceVisibility)) {
                    n.workspaceVisibility = n.workspaceVisibility
                        .map(id => idMap.get(id))
                        .filter(id => id !== undefined)
                }
                if (!n.workspaceVisibility || n.workspaceVisibility.length === 0) {
                    n.workspaceVisibility = [activeNewId]
                }
            })
        } else {
            // Single-workspace patch: legacy behavior
            const workspaceName = patchData.meta?.name || 'Imported Workspace'
            const newWorkspace = WorkspaceManager.create(workspaceName)
            activeNewId = newWorkspace.id
            nodes = patchData.nodes.map(n => ({...n, workspaceVisibility: [newWorkspace.id]}))
        }

        const {errors} = createNodesAndConnections(nodes, patchData.connections)

        if (patchData.editorWidth) {
            const nodeRoot = document.getElementById('node-root')
            if (patchData.editorWidth > (nodeRoot?.offsetWidth || 0)) {
                setWorkspaceWidth(patchData.editorWidth)
            }
        }

        WorkspaceManager.setActive(activeNewId)
        SNode.updateVisibility()
        SNode.nodes.forEach(node => node.updatePortPoints())
        Connection.redrawAllConnections()

        if (errors.length > 0) {
            console.warn('Import errors:', errors)
            alert(`Imported with ${errors.length} errors. Check console.`)
        }

        window.markDirty?.()
        window.workspaceTabBar?.render()

    } catch (error) {
        console.error('Failed to import patch:', error)
        alert(`Import failed: ${error.message}`)
    }
}

/**
 * Clear all workspaces and all nodes across the entire session.
 * Used when loading a compound patch with "clear all" enabled.
 */
function clearAllWorkspaces() {
    // Destroy all nodes (across all workspaces)
    const allOutputs = [...SNode.nodes].filter(n => n.slug === 'output')
    allOutputs.forEach(n => n.isDestroyed = true)

    const allNodes = [...SNode.nodes]
    allNodes.forEach(n => n.destroy())

    Connection.redrawAllConnections()

    // Reset workspace width and scroll
    const editor = document.getElementById('editor')
    if (editor) {
        setWorkspaceWidth(editor.getBoundingClientRect().width)
        editor.scrollLeft = 0
    }

    // Delete all workspaces (reset creates a fresh default one)
    WorkspaceManager.reset()
}

export function deserializeWorkspace(patchData, shouldClearWorkspace = true){
    try {
        // Validate and sanitize
        const validation = PatchValidator.validate(patchData)
        if (validation.errors.length > 0) {
            console.warn('Patch validation warnings:', validation.errors)
        }
        patchData = validation.sanitized

        if (!patchData?.nodes) {
            throw new Error('Patch data is invalid or missing "nodes" array.')
        }

        if (patchData.version) {
            console.log(`Loading patch version: ${patchData.version}`)
        }

        const isCompound = (patchData.workspaceTree?.workspaces?.length || 0) > 1

        if (shouldClearWorkspace) {
            if (isCompound) {
                // Compound patch: clear ALL workspaces and nodes
                clearAllWorkspaces()
            } else {
                clearWorkspace()
            }
        }

        // Build workspace ID mapping (old IDs → new IDs)
        const workspaceIdMap = buildWorkspaceIdMap(patchData, shouldClearWorkspace)

        // Remap workspace visibility on shallow copies to avoid mutating cached patchData
        const nodes = patchData.nodes.map(n => ({...n}))
        nodes.forEach(nodeData => {
            if (nodeData.workspaceVisibility && Array.isArray(nodeData.workspaceVisibility)) {
                nodeData.workspaceVisibility = nodeData.workspaceVisibility
                    .map(id => workspaceIdMap.get(id))
                    .filter(id => id !== undefined)
                if (nodeData.workspaceVisibility.length === 0) {
                    nodeData.workspaceVisibility = [WorkspaceManager.getActiveWorkspace()?.id]
                }
            }
        })

        // Create nodes and connections
        const {errors, failedIds} = createNodesAndConnections(nodes, patchData.connections)

        // Restore editor width
        if (patchData.editorWidth) {
            const currentWidth = document.getElementById('editor')?.getBoundingClientRect().width || 0
            if (shouldClearWorkspace || patchData.editorWidth > currentWidth) {
                setWorkspaceWidth(patchData.editorWidth)
            }
        }

        // Update visuals
        SNode.updateVisibility()
        SNode.nodes.forEach(node => node.updatePortPoints())
        Connection.redrawAllConnections()

        if (isCompound) {
            window.markDirty?.()
            window.workspaceTabBar?.render()
        }

        // Report results
        if (errors.length > 0) {
            console.warn('Load errors:', errors)
            alert(`Loaded with ${errors.length} errors. Check console.`)
        }

    } catch(error){
        console.error('Failed to load patch:', error)
        alert(`Load failed: ${error.message}`)
    }
}

/**
 * Build workspace ID mapping from patch data.
 * Maps saved workspace IDs to current workspace IDs.
 */
function buildWorkspaceIdMap(patchData, shouldClearWorkspace) {
    const idMap = new Map()
    const activeWs = WorkspaceManager.getActiveWorkspace()

    // Get workspaces from patch (various formats)
    const savedWorkspaces = patchData.workspaceTree?.workspaces
        || patchData.workspaces
        || []

    if (savedWorkspaces.length > 0) {
        const first = savedWorkspaces[0]

        if (shouldClearWorkspace && activeWs && first) {
            // Reuse active workspace for first saved workspace
            WorkspaceManager.rename(activeWs.id, first.name || 'Workspace 1')
            idMap.set(first.id, activeWs.id)
        }

        savedWorkspaces.forEach(ws => {
            if (idMap.has(ws.id)) return
            const newWs = WorkspaceManager.create(ws.name)
            idMap.set(ws.id, newWs.id)
        })

        // Set active workspace
        const activeId = patchData.workspaceTree?.activeWorkspaceId ?? patchData.activeWorkspaceId
        if (shouldClearWorkspace && activeId) {
            const mapped = idMap.get(activeId)
            if (mapped) WorkspaceManager.setActive(mapped)
        }

    } else {
        // Legacy patch with no workspace data - use active workspace
        if (activeWs) {
            idMap.set(1, activeWs.id)
        }
    }

    return idMap
}

function getRegularPatchesFromLocalStorage(){
    try {
        const patches = localStorage.getItem('silvia_patches')
        return patches ? JSON.parse(patches) : []
    } catch(e){
        console.error('Could not load regular patches from local storage:', e)
        return []
    }
}

export function getPatchesFromLocalStorage(){
    try {
        const regularPatches = getRegularPatchesFromLocalStorage()

        // Note: Legacy workspace restores (silvia_workspace_1, silvia_workspace_2) are no longer
        // displayed here. They are automatically migrated to the new session format on startup.
        // The session is now saved/loaded as a single unit through main.js.

        // Return regular patches only
        return regularPatches
    } catch(e){
        console.error('Could not load patches from local storage:', e)
        return []
    }
}

async function copyPatchToStorage(patchData){
    try {
        // Check if running in Electron mode
        if (typeof window !== 'undefined' && window.electronAPI) {
            // Electron mode: save to patches/ folder (Root)
            const meta = patchData.meta || {}
            const patchName = meta.name || 'Untitled'
            const safeFilename = patchName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'patch'
            const filename = `${safeFilename}_${Date.now()}`

            const success = await window.electronAPI.savePatchFile(patchData, filename, null)
            if (success) {
                console.log(`Patch copied to workspace Root: ${filename}`)
                return true
            } else {
                console.error('Failed to copy patch to workspace')
                return false
            }
        } else {
            // Web mode: save to localStorage
            const regularPatches = getRegularPatchesFromLocalStorage()

            // Create a copy of the patch data to avoid modifying the original
            const patchCopy = JSON.parse(JSON.stringify(patchData))

            // Ensure meta exists and add timestamp
            if (!patchCopy.meta) {
                patchCopy.meta = {}
            }
            patchCopy.meta.savedAt = new Date().toISOString()

            regularPatches.push(patchCopy)
            localStorage.setItem('silvia_patches', JSON.stringify(regularPatches))
            console.log('Patch copied to local storage')
            return true
        }
    } catch(e) {
        console.error('Could not copy patch to storage:', e)
        return false
    }
}

function deletePatchFromLocalStorage(indexToDelete, patchToDelete){
    try {
        // Get only the regular patches (not workspace restores)
        const regularPatches = getRegularPatchesFromLocalStorage()

        // Find the patch in regular patches by matching metadata
        const patchToDeleteIndex = regularPatches.findIndex(p => {
            const meta1 = p.meta || {}
            const meta2 = patchToDelete.meta || {}
            return meta1.name === meta2.name &&
                   meta1.author === meta2.author &&
                   meta1.description === meta2.description
        })

        if(patchToDeleteIndex >= 0){
            regularPatches.splice(patchToDeleteIndex, 1)
            localStorage.setItem('silvia_patches', JSON.stringify(regularPatches))
        }
    } catch(e){
        console.error('Could not delete patch from local storage:', e)
    }
}

async function loadDefaultPatches(){
    try {
        // Use cached default patches if available
        if(defaultPatchesCache){
            populateDefaultPatches(defaultPatchesCache)
            return
        }

        // Dynamically import the defaults module
        const defaultsModule = await import('./defaults.js')
        const patches = await defaultsModule.loadDefaultPatches()

        // Cache the patches
        defaultPatchesCache = patches

        // Populate the UI
        populateDefaultPatches(patches)
    } catch(error){
        console.warn('Could not load default patches:', error)
        defaultsPatchListEl.innerHTML = '<p>Could not load default patches.</p>'
    }
}

function populateDefaultPatches(patches){
    if(!defaultsPatchListEl) {
        return
    }

    if(!patches || patches.length === 0){
        defaultsPatchListEl.innerHTML = '<p>No default patches available.</p>'
        return
    }

    defaultsPatchListEl.innerHTML = ''

    patches.forEach((patch, index) => {
        const item = createPatchListItem(patch, index, null, false, true)
        defaultsPatchListEl.appendChild(item)
    })
}

async function loadPatchFolders(){
    if (!folderListEl || !window.electronAPI) return

    try {
        // Get all patches to determine what folders exist
        const allPatches = await window.electronAPI.listPatchFiles()
        const folders = await window.electronAPI.listPatchFolders()

        folderListEl.innerHTML = ''

        // Always check if root patches exist by looking for patches with folder: null
        const rootPatches = allPatches.filter(patch => patch.folder === null)
        const subfolderData = folders.filter(folder => folder.name !== null)

        const allFolders = []

        // Always add Root folder first if there are root patches
        if (rootPatches.length > 0) {
            allFolders.push({
                name: null,
                displayName: 'Root',
                patchCount: rootPatches.length
            })
        }

        // Add subfolders
        allFolders.push(...subfolderData)

        if (allFolders.length === 0) {
            folderListEl.innerHTML = '<p style="padding: 8px; color: var(--text-muted); font-size: 11px;">No patch folders found.</p>'
            return
        }

        // Set default selected folder if none is selected
        if (selectedFolder === null && allFolders.length > 0) {
            selectedFolder = allFolders[0].name
        }

        allFolders.forEach(folder => {
            const folderItem = document.createElement('div')
            folderItem.className = 'folder-item'
            if (folder.name === selectedFolder) {
                folderItem.classList.add('selected')
            }

            const folderIcon = folder.name === null ? '🏠' : '📁'
            folderItem.innerHTML = `
                <span class="folder-item-icon">${folderIcon}</span>
                <span class="folder-item-name">${folder.displayName}</span>
                <span class="folder-item-count">${folder.patchCount}</span>
            `

            folderItem.addEventListener('click', async () => {
                // Update selection
                const currentSelected = folderListEl.querySelector('.folder-item.selected')
                if (currentSelected) {
                    currentSelected.classList.remove('selected')
                }
                folderItem.classList.add('selected')
                selectedFolder = folder.name

                // Load patches for this folder
                await loadPatchesForFolder(folder.name)
            })

            folderListEl.appendChild(folderItem)
        })

        patchFolders = allFolders
    } catch (error) {
        console.error('Failed to load patch folders:', error)
        folderListEl.innerHTML = '<p style="padding: 8px; color: var(--text-muted); font-size: 11px;">Failed to load folders.</p>'
    }
}

async function loadPatchesForFolder(folderName) {
    if (!localPatchListEl || !window.electronAPI) return

    try {
        const patchFiles = await window.electronAPI.listPatchFiles(folderName)
        localPatchListEl.innerHTML = ''

        if (patchFiles.length === 0) {
            const folderDisplayName = folderName === null ? 'Root' : folderName
            localPatchListEl.innerHTML = `<p>No patches found in ${folderDisplayName}.</p>`
            return
        }

        // The API already returns filtered patches for the specific folder, no need to filter again
        patchFiles.forEach((patchFile, index) => {
            const item = createPatchListItem(patchFile.data, index, patchFile, false)
            localPatchListEl.appendChild(item)
        })
    } catch (error) {
        console.error('Failed to load patches for folder:', error)
        localPatchListEl.innerHTML = '<p>Failed to load patches.</p>'
    }
}