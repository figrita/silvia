// NOTE: "patch" in this file refers to .svs file data being loaded.
// User-facing UI says "Open" and "workspace". CSS classes like .patch-card
// are the file browser card styles. IPC methods use "patch" for file I/O.

import {autowire, StringToFragment} from './utils.js'
import {SNode} from './snode.js'
import {Connection} from './connections.js'
import {clearWorkspace, setWorkspaceWidth} from './editor.js'
import {PatchValidator} from './patchValidator.js'
import {nodeList} from './registry.js'
import {WorkspaceManager} from './workspaceManager.js'
import {iconHtml} from './icons.js'

/**
 * Build a source info object from a patch and its file metadata.
 * Returns null for compound patches or default patches (no file ownership).
 */
function buildSourceInfo(patch, patchFile, isDefaultPatch) {
    if (isDefaultPatch) return null
    const isCompound = (patch.workspaceTree?.workspaces?.length || 0) > 1
    if (isCompound) return null

    if (patchFile) {
        return {
            type: 'electron',
            filename: patchFile.filename.replace(/\.svs$/, ''),
            folder: patchFile._sourceFolder || null,
            author: patch.meta?.author || '',
            description: patch.meta?.description || ''
        }
    }
    return {
        type: 'localStorage',
        author: patch.meta?.author || '',
        description: patch.meta?.description || ''
    }
}

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
let defaultPatchesCache = null

// --- DOM Elements (will be populated by autowire) ---
let loadModal
let localPatchListEl
let defaultsPatchListEl
let patchFileUploadEl
let copyUploadToPatchesCheckbox
let uploadSvsBtn
let loadCancelBtnFooter
let folderListEl

// --- Tab state ---
let activeTab = 'default'
let selectedFolder = null

function createLoadModal(){
    const html = `
	<div class="modal-overlay" style="display: none;" data-el="loadModal">
		<div class="load-modal-window">
			<!-- Header -->
			<div class="load-modal-header">
				<h2>Open</h2>
				<div class="load-modal-header-controls">
					<label class="load-upload-checkbox">
						<input type="checkbox" data-el="copyUploadToPatchesCheckbox" checked>
						Save uploaded files
					</label>
					<button class="load-upload-btn" data-el="uploadSvsBtn">+ Upload .svs</button>
				</div>
			</div>

			<!-- Hidden file input for uploads -->
			<input type="file" id="patch-file-upload" accept=".svs,.json" style="display:none;" data-el="patchFileUploadEl">

			<!-- Tab Bar -->
			<div class="load-modal-tab-bar">
				<button class="load-tab load-tab-active" data-tab="default">Examples</button>
				<button class="load-tab" data-tab="filesystem" data-el="filesystemTab">Your Files</button>
			</div>

			<!-- Content Area -->
			<div class="load-modal-main-container">
				<div class="load-modal-content-area">
					<!-- Tab content will be populated here -->
					<div class="load-tab-content" id="default-tab-content">
						<div class="patch-grid" data-el="defaultsPatchListEl">
							<p>Loading examples...</p>
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
				<div class="load-modal-actions">
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
 * Initializes the Open modal, hooks up event listeners.
 */
export function initLoad(){
    // Initialize the patch validator with allowed node types
    PatchValidator.initialize(nodeList)

    const loadElements = createLoadModal()

    // Assign autowired elements to our module-level variables
    ; ({
        loadModal,
        localPatchListEl,
        defaultsPatchListEl,
        patchFileUploadEl,
        copyUploadToPatchesCheckbox,
        uploadSvsBtn,
        loadCancelBtnFooter,
        folderListEl
    } = loadElements)


    const loadBtn = document.getElementById('open-btn')
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

    // In Electron mode, default to Filesystem tab (user's saved files)
    if (window.electronAPI) {
        switchToTab('filesystem')
    }

    // Close modals on overlay click
    loadModal.addEventListener('click', (e) => {
        if(e.target === loadModal){loadModal.style.display = 'none'}
    })

    patchFileUploadEl.addEventListener('change', handleFileUpload)
    
    // Close on escape
    document.addEventListener('escape-pressed', () => {
        if(loadModal.style.display === 'flex'){
            loadModal.style.display = 'none'
        }
    })
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

    if (window.electronAPI) {
        // Electron mode: Use filesystem layout with sidebar
        filesystemTab.innerHTML = 'Filesystem'

        filesystemContentContainer.innerHTML = `
            <div class="filesystem-layout">
                <div class="filesystem-sidebar">
                    <div class="filesystem-sidebar-header">
                        <h4>Folders <span class="folders-help-icon">${iconHtml('circle-help', 12)}<span class="folders-tooltip">One sublevel of folders is supported</span></span></h4>
                    </div>
                    <div class="folder-list-container">
                        <div class="folder-list" data-el="folderListEl">
                            <p>Loading folders...</p>
                        </div>
                    </div>
                </div>
                <div class="filesystem-content">
                    <div class="patch-grid" data-el="localPatchListEl">
                        <p>Loading your files...</p>
                    </div>
                </div>
            </div>
        `
    } else {
        // Web mode: Simple grid layout without sidebar
        filesystemTab.innerHTML = 'Local Storage'

        filesystemContentContainer.innerHTML = `
            <div class="patch-grid" data-el="localPatchListEl">
                <p>Loading your workspaces...</p>
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

}


function openLoadModal(){
    populateLoadModal()
    loadModal.style.display = 'flex'
}

function handleFileUpload(event){
    const [file, ..._] = event.target.files
    if(!file){return}

    const reader = new FileReader()
    reader.onload = async (e) => {
        try {
            const patchData = JSON.parse(e.target.result)

            // Copy to saves first so we can set sourceInfo on the new workspace
            let sourceInfo = null
            if(copyUploadToPatchesCheckbox.checked){
                sourceInfo = await copyPatchToStorage(patchData)
                if(sourceInfo && activeTab === 'filesystem') {
                    populateLoadModal()
                }
            }

            const name = patchData?.meta?.name || file.name.replace(/\.svs$|\.json$/i, '') || 'Untitled'
            openPatch(patchData, sourceInfo, name)
            loadModal.style.display = 'none'
        } catch(error){
            alert('Failed to parse file. Is it a valid .svs file?')
            console.error('File parsing error:', error)
        }
    }
    reader.readAsText(file)
    event.target.value = '' // Reset file input to allow re-uploading the same file
}

async function populateLoadModal(){
    // Clear and set loading states
    if(localPatchListEl) {
        localPatchListEl.innerHTML = ''
    }
    if(defaultsPatchListEl) {
        defaultsPatchListEl.innerHTML = '<p>Loading examples...</p>'
    }

    // Check if running in Electron mode
    if (window.electronAPI) {
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
            localPatchListEl.innerHTML = '<p>Failed to load files.</p>'
        }
    } else {
        // Web mode: Load all patches from localStorage in simple grid
        try {
            const allPatches = getRegularPatchesFromLocalStorage()

            if(allPatches.length === 0){
                localPatchListEl.innerHTML = '<p>No saved workspaces in local storage.</p>'
            } else {
                localPatchListEl.innerHTML = ''
                // Add all patches (workspace restores and regular patches)
                allPatches.forEach(patch => {
                    const item = createPatchListItem(patch)
                    localPatchListEl.appendChild(item)
                })
            }
        } catch (error) {
            console.error('Failed to load patches from local storage:', error)
            localPatchListEl.innerHTML = '<p>Failed to load workspaces from local storage.</p>'
        }
    }

    // Load default patches (both web and Electron modes)
    await loadDefaultPatches()
}

function createPatchListItem(patch, patchFile = null, isDefaultPatch = false){
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
        img.alt = 'Thumbnail'
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
        <div class="patch-card-name">${patchName}${wsCount > 1 ? `<span class="patch-card-compound-badge" title="${wsCount} workspaces">${wsCount}</span>` : ''}</div>
        <div class="patch-card-author">${patchAuthor}</div>
        <div class="patch-card-description">${patchDescription}</div>
        ${patchFile ? `<div class="patch-card-meta">${modifiedDate} · ${fileSize}</div>` : ''}
        <div class="patch-card-actions">
            <button class="patch-new-ws-btn" title="Open in new tab">Open</button>
            ${wsCount <= 1 ? `<button class="patch-load-btn" title="Add to current workspace">Add In</button>` : ''}
            <button class="patch-download-btn" title="Download .svs file">↓</button>
            ${isDefaultPatch ? '' : `<button class="patch-delete-btn" title="Delete">×</button>`}
        </div>
    `

    item.appendChild(previewDiv)
    item.appendChild(infoDiv)

    // Add In button - merges into current workspace (single-workspace patches only)
    const loadBtn = item.querySelector('.patch-load-btn')
    if (loadBtn) {
        loadBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            deserializeWorkspace(patch, false, null, false)
            loadModal.style.display = 'none'
        })
    }

    // Open button - opens in a fresh new tab with source tracking
    const newWsBtn = item.querySelector('.patch-new-ws-btn')
    newWsBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const sourceInfo = buildSourceInfo(patch, patchFile, isDefaultPatch)
        openPatch(patch, sourceInfo, patchName)
        loadModal.style.display = 'none'
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
                if (window.electronAPI && patchFile) {
                    try {
                        const success = await window.electronAPI.deletePatchFile(patchFile.filename)
                        if (success) {
                            clearSourceForDeletedPatch(patchFile)
                            populateLoadModal() // Refresh the list
                        } else {
                            alert('Failed to delete file.')
                        }
                    } catch (error) {
                        console.error('Failed to delete patch file:', error)
                        alert('Failed to delete file.')
                    }
                } else {
                    // Web mode: delete from localStorage
                    deletePatchFromLocalStorage(patch)
                    clearSourceForDeletedPatch(null, patch)
                    populateLoadModal() // Refresh the list
                }
            }
        })
    }

    return item
}

/**
 * Open a patch in a new workspace tab.
 * Handles the full lifecycle: create workspace, activate, deserialize, rename.
 * For loading into an existing workspace (startup, Add In), use deserializeWorkspace directly.
 */
export function openPatch(patchData, sourceInfo = null, name = 'Untitled') {
    const newWs = WorkspaceManager.create()
    WorkspaceManager.setActive(newWs.id)
    deserializeWorkspace(patchData, true, sourceInfo)
    WorkspaceManager.rename(newWs.id, name)
}

/**
 * Unified patch loading function.
 * @param {Object} patchData - The .svs patch data
 * @param {boolean} shouldClearWorkspace - true: clear current workspace(s) and reuse active tab.
 *   false: create new workspace tab(s) for the loaded patch.
 * @param {Object|null} sourceInfo - Source tracking for quick-save (Ctrl+S). Null skips.
 * @param {boolean} activate - Whether to switch to the loaded workspace's tab.
 */
export function deserializeWorkspace(patchData, shouldClearWorkspace = true, sourceInfo = null, activate = true){
    /**** v0 migration: normalize old field names and add workspaceTree ****/
    if (Array.isArray(patchData?.nodes)) {
        patchData.nodes.forEach(n => {
            if (n.layerVisibility && !n.workspaceVisibility) {
                n.workspaceVisibility = n.layerVisibility
                delete n.layerVisibility
            }
        })
    }
    if (!patchData?.workspaceTree) {
        patchData.workspaceTree = {
            activeWorkspaceId: 1,
            workspaces: [{ id: 1, name: patchData?.meta?.name || 'Untitled' }]
        }
    }
    /****/
    try {
        const validation = PatchValidator.validate(patchData)
        if (validation.errors.length > 0) {
            console.warn('Patch validation warnings:', validation.errors)
        }
        patchData = validation.sanitized

        if (!patchData?.nodes) {
            throw new Error('Patch data is invalid or missing "nodes" array.')
        }

        const isCompound = (patchData.workspaceTree?.workspaces?.length || 0) > 1

        if (shouldClearWorkspace) {
            clearWorkspace()
            const activeWs = WorkspaceManager.getActiveWorkspace()
            if (activeWs) WorkspaceManager.setSource(activeWs.id, null)
        }

        const {idMap, targetActiveId} = buildWorkspaceIdMap(patchData, shouldClearWorkspace)

        // Remap workspace visibility on shallow copies to avoid mutating cached patchData
        const nodes = patchData.nodes.map(n => ({...n}))
        const fallbackWsId = targetActiveId || WorkspaceManager.getActiveWorkspace()?.id
        nodes.forEach(nodeData => {
            if (nodeData.workspaceVisibility && Array.isArray(nodeData.workspaceVisibility)) {
                nodeData.workspaceVisibility = nodeData.workspaceVisibility
                    .map(id => idMap.get(id))
                    .filter(id => id !== undefined)
                if (nodeData.workspaceVisibility.length === 0) {
                    nodeData.workspaceVisibility = [fallbackWsId]
                }
            } else {
                // Legacy nodes without workspaceVisibility
                nodeData.workspaceVisibility = [fallbackWsId]
            }
        })

        const {nodeMap, errors} = createNodesAndConnections(nodes, patchData.connections)

        if (nodeMap.size === 0) {
            alert('Load failed: no nodes could be created.')
            return
        }

        if (patchData.editorWidth) {
            const currentWidth = document.getElementById('editor')?.getBoundingClientRect().width || 0
            if (shouldClearWorkspace || patchData.editorWidth > currentWidth) {
                setWorkspaceWidth(patchData.editorWidth)
            }
        }

        if (activate && targetActiveId) {
            WorkspaceManager.setActive(targetActiveId)
        }

        // Set source on the active workspace (single-workspace loads only)
        if (sourceInfo && !isCompound) {
            const activeWs = WorkspaceManager.getActiveWorkspace()
            if (activeWs) {
                WorkspaceManager.setSource(activeWs.id, sourceInfo)
            }
        }

        SNode.updateVisibility()
        SNode.nodes.forEach(node => node.updatePortPoints())
        Connection.redrawAllConnections()
        window.workspaceTabBar?.render()

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
 * When shouldClearWorkspace is true, reuses the active workspace for the first saved workspace
 * and creates new workspaces for the rest.
 * When false, maps all saved workspaces to the active workspace (Add In behavior).
 * @returns {{idMap: Map, targetActiveId: *}} - ID map and the workspace to activate
 */
function buildWorkspaceIdMap(patchData, shouldClearWorkspace) {
    const idMap = new Map()
    const activeWs = WorkspaceManager.getActiveWorkspace()
    let targetActiveId = null

    const savedWorkspaces = patchData.workspaceTree?.workspaces
        || patchData.workspaces
        || []

    if (savedWorkspaces.length > 0) {
        if (shouldClearWorkspace) {
            // Load into active workspace: reuse it for the first, create new for the rest
            const first = savedWorkspaces[0]
            if (activeWs && first) {
                idMap.set(first.id, activeWs.id)
            }
            savedWorkspaces.forEach(ws => {
                if (idMap.has(ws.id)) return
                const newWs = WorkspaceManager.create(ws.name)
                idMap.set(ws.id, newWs.id)
            })
            const activeId = patchData.workspaceTree?.activeWorkspaceId ?? patchData.activeWorkspaceId
            targetActiveId = (activeId && idMap.get(activeId)) || idMap.values().next().value || null
        } else {
            // Add In: map all saved workspaces to the active workspace
            savedWorkspaces.forEach(ws => idMap.set(ws.id, activeWs.id))
            targetActiveId = activeWs?.id || null
        }
    }

    return {idMap, targetActiveId}
}

export function getRegularPatchesFromLocalStorage(){
    try {
        const patches = localStorage.getItem('silvia_patches')
        return patches ? JSON.parse(patches) : []
    } catch(e){
        console.error('Could not load regular patches from local storage:', e)
        return []
    }
}


async function copyPatchToStorage(patchData){
    const meta = patchData.meta || {}
    try {
        // Check if running in Electron mode
        if (window.electronAPI) {
            // Electron mode: save to saves/ folder (Root)
            const patchName = meta.name || 'Untitled'
            const safeFilename = patchName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'patch'
            const filename = `${safeFilename}_${Date.now()}`

            const success = await window.electronAPI.savePatchFile(patchData, filename, null)
            if (success) {
                return { type: 'electron', filename, folder: null, author: meta.author || '', description: meta.description || '' }
            } else {
                console.error('Failed to copy patch to workspace')
                return null
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
            return { type: 'localStorage', author: meta.author || '', description: meta.description || '' }
        }
    } catch(e) {
        console.error('Could not copy patch to storage:', e)
        return null
    }
}

/**
 * Clear the source from any open workspace that was loaded from a deleted patch.
 * This removes quicksave ability and has-source styling for affected tabs.
 */
function clearSourceForDeletedPatch(patchFile, localStoragePatch) {
    const deletedFilename = patchFile?.filename?.replace(/\.svs$/, '') || null
    const deletedName = localStoragePatch?.meta?.name || null

    for (const ws of WorkspaceManager.getAll()) {
        if (!ws.source?.type) continue

        if (ws.source.type === 'electron' && deletedFilename && ws.source.filename === deletedFilename) {
            WorkspaceManager.setSource(ws.id, null)
        } else if (ws.source.type === 'localStorage' && deletedName && ws.name === deletedName) {
            WorkspaceManager.setSource(ws.id, null)
        }
    }
    window.workspaceTabBar?.render()
}

function deletePatchFromLocalStorage(patchToDelete){
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
        defaultsPatchListEl.innerHTML = '<p>Could not load examples.</p>'
    }
}

function populateDefaultPatches(patches){
    if(!defaultsPatchListEl) {
        return
    }

    if(!patches || patches.length === 0){
        defaultsPatchListEl.innerHTML = '<p>No examples available.</p>'
        return
    }

    defaultsPatchListEl.innerHTML = ''

    patches.forEach(patch => {
        const item = createPatchListItem(patch, null, true)
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
            folderListEl.innerHTML = '<p style="padding: 8px; color: var(--text-muted); font-size: 11px;">No folders found.</p>'
            return
        }

        // Validate selectedFolder still exists, otherwise pick the first
        const folderStillExists = allFolders.some(f => f.name === selectedFolder)
        if (!folderStillExists && allFolders.length > 0) {
            selectedFolder = allFolders[0].name
        }

        allFolders.forEach(folder => {
            const folderItem = document.createElement('div')
            folderItem.className = 'folder-item'
            if (folder.name === selectedFolder) {
                folderItem.classList.add('selected')
            }

            const folderIcon = folder.name === null ? '/' : '▸'
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
            localPatchListEl.innerHTML = `<p>No files found in ${folderDisplayName}.</p>`
            return
        }

        // The API already returns filtered patches for the specific folder, no need to filter again
        patchFiles.forEach(patchFile => {
            const item = createPatchListItem(patchFile.data, patchFile)
            localPatchListEl.appendChild(item)
        })
    } catch (error) {
        console.error('Failed to load patches for folder:', error)
        localPatchListEl.innerHTML = '<p>Failed to load files.</p>'
    }
}