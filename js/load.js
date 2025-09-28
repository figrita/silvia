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
let patchJsonInputEl
let loadFromJsonBtn
let clearWorkspaceCheckbox
let copyFileToPatchesCheckbox
let copyJsonToPatchesCheckbox

function createLoadModal(){
    const html = `
	<div class="modal-overlay" style="display: none;" data-el="loadModal">
		<div class="modal-content load-modal-content">
			<h2>Load Patch - Into Current Workspace</h2>
            <p style="margin-bottom: 1rem; color: var(--text-secondary); font-size: 0.9rem;">This will clear your current workspace and load the selected patch into it.</p>
            <div class="load-controls-container">
                <div class="form-group load-file-group">
                    <label>Load a file saved to your PC</label>
                    <div class="load-file-button-container">
                    <label for="patch-file-upload" class="floating-btn">Upload .svs File</label>
                    <input type="file" id="patch-file-upload" accept=".svs,.json" style="display:none;" data-el="patchFileUploadEl">
                    </div>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">
                        <input type="checkbox" id="copy-file-to-patches-checkbox" data-el="copyFileToPatchesCheckbox">
                        Copy to my patches
                    </label>
                </div>

                <div class="form-group load-json-group">
                    <label for="patch-json-input">Paste Patch JSON</label>
                    <textarea id="patch-json-input" rows="4" data-el="patchJsonInputEl"></textarea>
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-secondary); margin: 0.5rem 0;">
                        <input type="checkbox" id="copy-json-to-patches-checkbox" data-el="copyJsonToPatchesCheckbox">
                        Copy to my patches
                    </label>
                    <button data-el="loadFromJsonBtn" class="load-json-btn">Load from Text</button>
                </div>

            </div>
            <div class="load-patches-container">
                <div class="patch-lists-container">
                    <h3>Default Patches</h3>
                    <div class="patch-list" data-el="defaultsPatchListEl">
                        <p>No default patches available.</p>
                    </div>
                </div>
                <div class="patch-lists-container">
                    <h3 id="local-patches-title">Your Local Storage Patches</h3>
                    <div class="patch-list" data-el="localPatchListEl">
                        <!-- Patches populated by JS -->
                    </div>
                </div>
            </div>
			<div class="modal-actions">
				<label style="margin-right: 1rem; display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-secondary);">
					<input type="checkbox" id="clear-workspace-checkbox" checked data-el="clearWorkspaceCheckbox">
					Clear this workspace on load
				</label>
				<button disabled data-el="loadConfirmBtn">Load</button>
				<button class="cancel-btn" data-el="loadCancelBtn">Cancel</button>
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
        patchJsonInputEl,
        loadFromJsonBtn,
        clearWorkspaceCheckbox,
        copyFileToPatchesCheckbox,
        copyJsonToPatchesCheckbox
    } = loadElements)

    const loadBtn = document.getElementById('load-patch-btn')
    loadBtn.addEventListener('click', openLoadModal)
    loadCancelBtn.addEventListener('click', () => (loadModal.style.display = 'none'))

    // Close modals on overlay click
    loadModal.addEventListener('click', (e) => {
        if(e.target === loadModal){loadModal.style.display = 'none'}
    })

    loadConfirmBtn.addEventListener('click', handleLoad)

    patchFileUploadEl.addEventListener('change', handleFileUpload)
    loadFromJsonBtn.addEventListener('click', handleLoadFromJson)

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
    const descriptionP = loadModal.querySelector('p')
    if(clearWorkspaceCheckbox.checked){
        descriptionP.textContent = 'This will clear your current workspace and load the selected patch into it.'
    } else {
        descriptionP.textContent = 'This will add the selected patch nodes to your current workspace without clearing existing content.'
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
            if(copyFileToPatchesCheckbox.checked){
                const success = await copyPatchToStorage(patchData)
                if(success){
                    // Show brief success feedback
                    const originalText = copyFileToPatchesCheckbox.nextSibling.textContent
                    copyFileToPatchesCheckbox.nextSibling.textContent = '✓ Copied!'
                    setTimeout(() => {
                        copyFileToPatchesCheckbox.nextSibling.textContent = originalText
                    }, 2000)
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

async function handleLoadFromJson(){
    const jsonText = patchJsonInputEl.value.trim()
    if(!jsonText){
        alert('Paste JSON data into the text area first.')
        return
    }
    try {
        const patchData = JSON.parse(jsonText)
        deserializeWorkspace(patchData, clearWorkspaceCheckbox.checked)

        // Copy to patches if checkbox is checked
        if(copyJsonToPatchesCheckbox.checked){
            const success = await copyPatchToStorage(patchData)
            if(success){
                // Show brief success feedback
                const originalText = copyJsonToPatchesCheckbox.nextSibling.textContent
                copyJsonToPatchesCheckbox.nextSibling.textContent = '✓ Copied!'
                setTimeout(() => {
                    copyJsonToPatchesCheckbox.nextSibling.textContent = originalText
                }, 2000)
            }
        }

        loadModal.style.display = 'none'
    } catch(error){
        alert('Failed to parse JSON. Please check the format.')
        console.error('JSON parsing error:', error)
    }
}

async function populateLoadModal(){
    // Clear previous state
    localPatchListEl.innerHTML = ''
    defaultsPatchListEl.innerHTML = '<p>Loading default patches...</p>'
    patchJsonInputEl.value = ''
    selectedPatchData = null
    loadConfirmBtn.disabled = true

    // Check if running in Electron mode
    if (typeof window !== 'undefined' && window.electronAPI) {
        // Update title for Electron mode
        const titleEl = document.getElementById('local-patches-title')
        if (titleEl) {
            titleEl.textContent = 'Your Filesystem Patches'
        }
        
        try {
            // Load from workspace patches directory in Electron
            const patchFiles = await window.electronAPI.listPatchFiles()

            if(patchFiles.length === 0){
                localPatchListEl.innerHTML = '<p>No patches saved in portable workspace.</p>'
            } else {
                // Add all patch files
                patchFiles.forEach((patchFile, index) => {
                    const item = createPatchListItem(patchFile.data, index, patchFile, false)
                    item.addEventListener('click', () => {
                        const currentSelection = loadModal.querySelector('.patch-item.selected')
                        if(currentSelection){
                            currentSelection.classList.remove('selected')
                        }
                        item.classList.add('selected')
                        selectedPatchData = patchFile.data
                        loadConfirmBtn.disabled = false
                    })
                    localPatchListEl.appendChild(item)
                })
            }
        } catch (error) {
            console.error('Failed to load patches from workspace:', error)
            localPatchListEl.innerHTML = '<p>Failed to load patches from workspace.</p>'
        }
    } else {
        // Web mode: use localStorage
        const allPatches = getPatchesFromLocalStorage()

        if(allPatches.length === 0){
            localPatchListEl.innerHTML = '<p>No patches saved in local storage.</p>'
        } else {
            // Add all patches (workspace restores and regular patches)
            allPatches.forEach((patch, index) => {
                const item = createPatchListItem(patch, index, null, false)
                item.addEventListener('click', () => {
                    const currentSelection = loadModal.querySelector('.patch-item.selected')
                    if(currentSelection){
                        currentSelection.classList.remove('selected')
                    }
                    item.classList.add('selected')
                    selectedPatchData = patch
                    loadConfirmBtn.disabled = false
                })
                localPatchListEl.appendChild(item)
            })
        }
    }

    // Load default patches (both web and Electron modes)
    await loadDefaultPatches()
}

function createPatchListItem(patch, patchIndex, patchFile = null, isAutosave = false){
    const item = document.createElement('div')
    item.className = 'patch-item'
    const meta = patch.meta || {}
    const patchName = meta.name || 'Untitled'
    
    // Additional info for Electron mode (file-based patches)
    const modifiedDate = patchFile ? new Date(patchFile.modified).toLocaleDateString() : ''
    const fileSize = patchFile ? (patchFile.size / 1024).toFixed(1) + ' KB' : ''
    
    const thumbnailHtml = meta.thumbnail && meta.thumbnail.trim() !== ''
        ? `<img src="${meta.thumbnail}" class="patch-thumbnail" alt="thumbnail">`
        : `<div class="patch-thumbnail no-thumbnail">No thumbnail</div>`

    item.innerHTML = `
		${thumbnailHtml}
		<div class="patch-info">
			<div class="patch-info-top">
				<span class="patch-name">${patchName}</span>
				<span class="patch-author">${meta.author || 'Unknown Author'}</span>
			</div>
			<p class="patch-description">${meta.description || 'No description.'}</p>
			${patchFile ? `<p class="patch-file-info" style="font-size: 0.8em; color: var(--text-secondary); margin: 4px 0;">
				Saved: ${modifiedDate} • ${fileSize}
			</p>` : ''}
            <div class="patch-actions">
                <button class="patch-download-btn" title="Download .svs file">Download .svs</button>
                <button class="patch-delete-btn" title="Delete patch">Delete</button>
            </div>
		</div>
	`

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
    if(!patches || patches.length === 0){
        defaultsPatchListEl.innerHTML = '<p>No default patches available.</p>'
        return
    }

    defaultsPatchListEl.innerHTML = ''

    patches.forEach((patch, index) => {
        const item = createPatchListItem(patch, index, null, false)
        item.addEventListener('click', () => {
            const currentSelection = loadModal.querySelector('.patch-item.selected')
            if(currentSelection){
                currentSelection.classList.remove('selected')
            }
            item.classList.add('selected')
            selectedPatchData = patch
            loadConfirmBtn.disabled = false
        })
        defaultsPatchListEl.appendChild(item)
    })
}