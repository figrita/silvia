import {autowire, StringToFragment} from './utils.js'
import {SNode} from './snode.js'
import {Connection} from './connections.js'
import {clearWorkspace, setWorkspaceWidth} from './editor.js'
import {PatchValidator} from './patchValidator.js'
import {nodeList} from './registry.js'

// --- Module-level state ---
let selectedPatchData = null
let defaultPatchesCache = null

// --- DOM Elements (will be populated by autowire) ---
let loadModal
let loadConfirmBtn
let loadCancelBtn
let localPatchListEl
let defaultsPatchListEl
let patchFileUploadEl
let clearWorkspaceCheckbox
let copyUploadToPatchesCheckbox
let uploadSvsBtn
let filesystemTab
let loadCancelBtnFooter
let folderListEl

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
					<button class="load-close-btn" data-el="loadCancelBtn">✕ Close</button>
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
					Clear this workspace on load
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
        loadCancelBtn,
        localPatchListEl,
        defaultsPatchListEl,
        patchFileUploadEl,
        clearWorkspaceCheckbox,
        copyUploadToPatchesCheckbox,
        uploadSvsBtn,
        filesystemTab,
        loadCancelBtnFooter,
        folderListEl
    } = loadElements)


    const loadBtn = document.getElementById('load-patch-btn')
    loadBtn.addEventListener('click', openLoadModal)
    loadCancelBtn.addEventListener('click', () => (loadModal.style.display = 'none'))
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
    // The new modal doesn't have the description paragraph in the same location
    // We can add status text later if needed
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
                                    transition: opacity 0.2s, visibility 0.2s;
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
        <div class="patch-card-name">${patchName}</div>
        <div class="patch-card-author">${patchAuthor}</div>
        <div class="patch-card-description">${patchDescription}</div>
        ${patchFile ? `<div class="patch-card-meta" style="font-size: 10px; color: var(--text-muted); margin-top: auto;">
            ${modifiedDate} • ${fileSize}
        </div>` : ''}
        <div class="patch-card-actions" style="margin-top: auto; display: flex; gap: 4px;">
            <button class="patch-load-btn" title="Load this patch" style="
                flex: 1;
                padding: 4px 8px;
                background: var(--primary-color);
                border: none;
                border-radius: 4px;
                color: white;
                font-size: 10px;
                cursor: pointer;
                transition: background 0.2s;
            ">Load</button>
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
                transition: background 0.2s;
            ">🗑️</button>`}
        </div>
    `

    item.appendChild(previewDiv)
    item.appendChild(infoDiv)

    // Add Load button functionality (new primary action)
    const loadBtn = item.querySelector('.patch-load-btn')
    loadBtn.addEventListener('click', (e) => {
        e.stopPropagation() // Prevent card selection
        // Directly load the patch
        selectedPatchData = patch
        deserializeWorkspace(patch, clearWorkspaceCheckbox.checked)
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
                    // Check if this is a workspace restore entry
                    if(patch.isWorkspaceRestore) {
                        // Delete the workspace save data directly
                        const workspaceKey = patch.targetWorkspace === 1 ? 'silvia_workspace_1' : 'silvia_workspace_2'
                        localStorage.removeItem(workspaceKey)
                    } else {
                        deletePatchFromLocalStorage(patchIndex, patch)
                    }
                    populateLoadModal() // Refresh the list
                }
            }
        })
    }

    return item
}

export function deserializeWorkspace(patchData, shouldClearWorkspace = true){
    const loadErrors = []

    try {
        // SECURITY: Validate and sanitize patch data before loading
        const validation = PatchValidator.validate(patchData)

        if (!validation.valid) {
            const errorMessage = `Security validation failed:\n${validation.errors.join('\n')}`
            console.error('Patch validation errors:', validation.errors)
            alert(`Cannot load patch - security validation failed.\n\n${validation.errors.slice(0, 5).join('\n')}${validation.errors.length > 5 ? '\n...' : ''}`)
            return
        }

        // Use sanitized patch data
        patchData = validation.sanitized

        if(!patchData || !patchData.nodes){
            throw new Error('Patch data is invalid or missing "nodes" array.')
        }

        if(patchData.version){
            console.log(`Loading patch version: ${patchData.version}`)
        } else {
            console.warn('Loading legacy patch file with no version number.')
        }

        if(shouldClearWorkspace){
            clearWorkspace() // Start with a clean slate only if requested
        }

        const oldIdToNodeInstanceMap = new Map() // Maps patch file IDs to node instances
        const failedNodeIds = new Set() // Track nodes that failed to load

        // Phase 1: Create nodes with unique IDs and populate remapping tables
        patchData.nodes.forEach(nodeDataFromPatch => {
            const oldId = nodeDataFromPatch.id

            try {
                // SNode constructor assigns ID from SNode.nextID++
                // nodeDataFromPatch hydrates controls and options
                const newNode = new SNode(nodeDataFromPatch.slug, nodeDataFromPatch.x, nodeDataFromPatch.y, nodeDataFromPatch)

                // Store mapping from patch ID to node instance
                oldIdToNodeInstanceMap.set(oldId, newNode)
            } catch(nodeError) {
                const errorMsg = `Failed to create node "${nodeDataFromPatch.slug}" (ID: ${oldId}): ${nodeError.message}`
                console.error(errorMsg, nodeError)
                loadErrors.push(errorMsg)
                failedNodeIds.add(oldId)
            }
        })

        // Phase 2: Re-establish connections, but defer Output node connections to avoid redundant recompilations
        const outputConnections = []
        const regularConnections = []

        if(patchData.connections){
            // Separate Output connections from regular connections
            patchData.connections.forEach(connData => {
                // Skip connections involving failed nodes
                if(failedNodeIds.has(connData.fromNode) || failedNodeIds.has(connData.toNode)) {
                    const errorMsg = `Skipping connection from ${connData.fromNode}.${connData.fromPort} to ${connData.toNode}.${connData.toPort} (involves failed node)`
                    console.warn(errorMsg)
                    loadErrors.push(errorMsg)
                    return
                }

                const destNode = oldIdToNodeInstanceMap.get(connData.toNode)
                if(destNode && destNode.slug === 'output') {
                    outputConnections.push(connData)
                } else {
                    regularConnections.push(connData)
                }
            })

            // Create regular connections first
            regularConnections.forEach(connData => {
                const sourceNode = oldIdToNodeInstanceMap.get(connData.fromNode)
                const destNode = oldIdToNodeInstanceMap.get(connData.toNode)

                if(sourceNode && destNode){
                    const sourcePort = sourceNode.output[connData.fromPort]
                    const destPort = destNode.input[connData.toPort]
                    if(sourcePort && destPort){
                        try {
                            new Connection(sourcePort, destPort)
                        } catch(connError) {
                            const errorMsg = `Failed to create connection from ${connData.fromNode}.${connData.fromPort} to ${connData.toNode}.${connData.toPort}: ${connError.message}`
                            console.error(errorMsg, connError)
                            loadErrors.push(errorMsg)
                        }
                    } else {
                        const errorMsg = `Could not find ports for connection: ${JSON.stringify(connData)}`
                        console.warn(errorMsg)
                        loadErrors.push(errorMsg)
                    }
                } else {
                    const errorMsg = `Could not find nodes for connection: ${JSON.stringify(connData)}`
                    console.warn(errorMsg)
                    loadErrors.push(errorMsg)
                }
            })

            // Create Output connections last to minimize recompilations
            outputConnections.forEach(connData => {
                const sourceNode = oldIdToNodeInstanceMap.get(connData.fromNode)
                const destNode = oldIdToNodeInstanceMap.get(connData.toNode)

                if(sourceNode && destNode){
                    const sourcePort = sourceNode.output[connData.fromPort]
                    const destPort = destNode.input[connData.toPort]
                    if(sourcePort && destPort){
                        try {
                            new Connection(sourcePort, destPort)
                        } catch(connError) {
                            const errorMsg = `Failed to create connection from ${connData.fromNode}.${connData.fromPort} to ${connData.toNode}.${connData.toPort}: ${connError.message}`
                            console.error(errorMsg, connError)
                            loadErrors.push(errorMsg)
                        }
                    } else {
                        const errorMsg = `Could not find ports for connection: ${JSON.stringify(connData)}`
                        console.warn(errorMsg)
                        loadErrors.push(errorMsg)
                    }
                } else {
                    const errorMsg = `Could not find nodes for connection: ${JSON.stringify(connData)}`
                    console.warn(errorMsg)
                    loadErrors.push(errorMsg)
                }
            })
        }

        // Phase 3: Restore editor width if saved (only if clearing or if patch width is greater)
        if(patchData.editorWidth){
            if(shouldClearWorkspace){
                setWorkspaceWidth(patchData.editorWidth)
            } else {
                // Only set width if patch width is greater than current width
                const currentEditor = document.getElementById('editor')
                const currentWidth = currentEditor.getBoundingClientRect().width
                if(patchData.editorWidth > currentWidth){
                    setWorkspaceWidth(patchData.editorWidth)
                }
            }
        }

        // Phase 4: Update visuals (Output nodes already compiled when connections were made)
        SNode.nodes.forEach(node => node.updatePortPoints())
        Connection.redrawAllConnections()

        // Report asset loading info for Electron mode
        if(patchData.assetReferences && patchData.assetReferences.length > 0) {
            console.log(`Patch contains ${patchData.assetReferences.length} asset references:`, patchData.assetReferences)
        }

        // Report results
        if(loadErrors.length > 0) {
            const successfulNodes = patchData.nodes.length - failedNodeIds.size
            const message = `Patch loaded with errors:\n${successfulNodes}/${patchData.nodes.length} nodes loaded successfully\n${loadErrors.length} errors encountered\n\nCheck console for details.`
            console.warn('Load errors:', loadErrors)
            alert(message)
        } else if(patchData.assetReferences && patchData.assetReferences.length > 0) {
            console.log(`Patch loaded successfully with ${patchData.assetReferences.length} assets`)
        }

    } catch(error){
        console.error('Failed to load patch:', error)
        alert(`Patch loading failed with errors. Some nodes may have loaded successfully. Check console for details.`)
    }
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

        // Add workspace restores
        const workspaceRestores = []

        // Check for workspace 1 restore
        const workspace1Data = localStorage.getItem('silvia_workspace_1')
        if (workspace1Data) {
            try {
                const parsed = JSON.parse(workspace1Data)
                workspaceRestores.push({
                    ...parsed,
                    meta: {
                        ...parsed.meta,
                        name: 'Last Workspace 1',
                        description: 'Restore your last saved Workspace 1'
                    },
                    isWorkspaceRestore: true
                })
            } catch(e) {
                console.warn('Could not parse workspace 1 restore:', e)
            }
        }

        // Check for workspace 2 restore
        const workspace2Data = localStorage.getItem('silvia_workspace_2')
        if (workspace2Data) {
            try {
                const parsed = JSON.parse(workspace2Data)
                workspaceRestores.push({
                    ...parsed,
                    meta: {
                        ...parsed.meta,
                        name: 'Last Workspace 2',
                        description: 'Restore your last saved Workspace 2'
                    },
                    isWorkspaceRestore: true
                })
            } catch(e) {
                console.warn('Could not parse workspace 2 restore:', e)
            }
        }

        // Return workspace restores first, then regular patches
        return [...workspaceRestores, ...regularPatches]
    } catch(e){
        console.error('Could not load patches from local storage:', e)
        return []
    }
}

async function copyPatchToStorage(patchData){
    try {
        // Check if running in Electron mode
        if (typeof window !== 'undefined' && window.electronAPI) {
            // Electron mode: save to patches/ folder
            const meta = patchData.meta || {}
            const patchName = meta.name || 'Untitled'
            const safeFilename = patchName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'patch'
            const filename = `${safeFilename}_${Date.now()}.svs`

            const success = await window.electronAPI.savePatchFile(filename, patchData)
            if (success) {
                console.log(`Patch copied to workspace: ${filename}`)
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