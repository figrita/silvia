// NOTE: Internal variables use "patch" to mean "serialized .svs file data".
// User-facing strings say "Save" / "workspace". The IPC layer also uses
// "patch" (e.g., electronAPI.savePatchFile) to mean file operations.

import {addVersionToPatch, PATCH_VERSION} from './version.js'
import {iconHtml} from './icons.js'
import {autowire, StringToFragment, showAlertModal} from './utils.js'
import {SNode} from './snode.js'
import {Connection} from './connections.js'
import {WorkspaceManager} from './workspaceManager.js'
import {getRegularPatchesFromLocalStorage} from './load.js'

// --- Module-level state ---
let thumbnailOutputIndex = 0
let outputNodesForThumb = []

// --- DOM Elements (will be populated by autowire) ---
let saveModal
let saveConfirmBtn
let saveCancelBtn
let patchNameEl
let patchAuthorEl
let patchDescriptionEl
let patchThumbnailPreviewEl
let thumbnailHelpEl
let thumbPrevBtn
let thumbNextBtn
let saveFeedbackEl
let saveMessageEl
let downloadLinkContainerEl
let subfolderSelectEl
let allWorkspacesCheckbox
let saveSubtitleEl

function createSaveModal(){
    const html = `
	<div class="modal-overlay" style="display: none;" data-el="saveModal">
		<div class="save-modal-window">
			<div class="save-modal-header">
				<h2>Save</h2>
			</div>
			<div class="save-modal-body">
				<div class="save-thumbnail-column">
					<div class="form-group">
						<div class="thumbnail-header">
							<label>Thumbnail</label>
							<div class="thumbnail-controls">
								<button class="thumb-arrow-btn" data-el="thumbPrevBtn">${iconHtml('arrow-left', 12)}</button>
								<button class="thumb-arrow-btn" data-el="thumbNextBtn">${iconHtml('arrow-right', 12)}</button>
							</div>
						</div>
						<img src="" alt="Thumbnail preview" style="display:none;" data-el="patchThumbnailPreviewEl">
						<p class="help-text" data-el="thumbnailHelpEl"></p>
					</div>
				</div>
				<div class="save-fields-column">
					<p data-el="saveSubtitleEl" class="save-subtitle">Saves the current workspace.</p>
					<div class="form-group">
						<label>Name</label>
						<input type="text" required data-el="patchNameEl">
					</div>
					<div class="form-group">
						<label>Author</label>
						<input type="text" data-el="patchAuthorEl">
					</div>
					<div class="form-group save-field-grow">
						<label>Description</label>
						<textarea rows="3" data-el="patchDescriptionEl"></textarea>
					</div>
					<div class="form-group electron-only-field" style="display: none;">
						<label>Save to Folder</label>
						<select class="slct" data-el="subfolderSelectEl">
							<option value="">Root</option>
						</select>
					</div>
				</div>
			</div>
			<div class="save-feedback" style="display: none;" data-el="saveFeedbackEl">
				<p data-el="saveMessageEl"></p>
				<div data-el="downloadLinkContainerEl"></div>
			</div>
			<div class="save-modal-footer">
				<label class="save-modal-checkbox">
					<input type="checkbox" data-el="allWorkspacesCheckbox">
					Include all open workspaces
				</label>
				<button data-el="saveConfirmBtn">Save</button>
				<button class="cancel-btn" data-el="saveCancelBtn">Cancel</button>
			</div>
		</div>
	</div>`

    const fragment = StringToFragment(html)
    const elements = autowire(fragment)
    document.getElementById('modal-container').appendChild(fragment)
    return elements
}

/**
 * Initializes the saving system, hooks up event listeners.
 */
export function initSave(){
    const saveElements = createSaveModal()

    // Assign autowired elements to our module-level variables
    ; ({
        saveModal,
        saveConfirmBtn,
        saveCancelBtn,
        patchNameEl,
        patchAuthorEl,
        patchDescriptionEl,
        patchThumbnailPreviewEl,
        thumbnailHelpEl,
        thumbPrevBtn,
        thumbNextBtn,
        saveFeedbackEl,
        saveMessageEl,
        downloadLinkContainerEl,
        subfolderSelectEl,
        allWorkspacesCheckbox,
        saveSubtitleEl
    } = saveElements)

    // Get the static trigger buttons from the main document
    const saveBtn = document.getElementById('save-btn')
    const quickSaveBtn = document.getElementById('quick-save-btn')

    // --- Attach Event Listeners ---
    saveBtn.addEventListener('click', openSaveModal)
    quickSaveBtn?.addEventListener('click', quickSave)

    saveCancelBtn.addEventListener('click', () => (saveModal.style.display = 'none'))

    // Close modals on overlay click
    saveModal.addEventListener('click', (e) => {
        if(e.target === saveModal){saveModal.style.display = 'none'}
    })

    saveConfirmBtn.addEventListener('click', handleSaveNew)

    thumbPrevBtn.addEventListener('click', () => cycleThumbnail(-1))
    thumbNextBtn.addEventListener('click', () => cycleThumbnail(1))

    allWorkspacesCheckbox.addEventListener('change', () => {
        updateSaveSubtitle()
        refreshThumbnailSources()
    })

    // Close on escape
    document.addEventListener('escape-pressed', () => {
        if(saveModal.style.display === 'flex'){
            saveModal.style.display = 'none'
        }
    })

    // Hide quick-save button until a source exists
    document.addEventListener('source-changed', updateQuickSaveVisibility)
    updateQuickSaveVisibility()
}

function updateQuickSaveVisibility() {
    const hasSource = !!WorkspaceManager.getActiveWorkspace()?.source?.type
    const btn = document.getElementById('quick-save-btn')
    if (btn) btn.style.display = hasSource ? '' : 'none'
    if (window.electronAPI?.setSaveVisible) {
        window.electronAPI.setSaveVisible(hasSource)
    }
}

function cycleThumbnail(direction){
    if(outputNodesForThumb.length === 0){return}
    const newIndex = thumbnailOutputIndex + direction
    const len = outputNodesForThumb.length
    // Wrap around logic
    thumbnailOutputIndex = ((newIndex % len) + len) % len
    updateThumbnailPreview()
}

function updateSaveSubtitle() {
    const count = WorkspaceManager.getAll().length
    if (allWorkspacesCheckbox.checked && count > 1) {
        saveSubtitleEl.textContent = `Saves all ${count} open workspaces with their connections.`
    } else {
        saveSubtitleEl.textContent = 'Saves the current workspace.'
    }
}

function refreshThumbnailSources() {
    outputNodesForThumb = allWorkspacesCheckbox.checked
        ? [...SNode.outputs]
        : SNode.getVisibleOutputs()
    thumbnailOutputIndex = 0
    updateThumbnailPreview()
}

export async function openSaveModal(){
    // Reset to form state (undo success state if previous save completed)
    saveModal.querySelector('.save-modal-body').style.display = ''
    saveFeedbackEl.style.display = 'none'
    saveConfirmBtn.style.display = ''
    saveCancelBtn.textContent = 'Cancel'

    // Default name to current workspace name
    const activeWs = WorkspaceManager.getActiveWorkspace()
    patchNameEl.value = activeWs?.name || ''
    patchAuthorEl.value = activeWs?.source?.author || ''
    patchDescriptionEl.value = activeWs?.source?.description || ''
    patchThumbnailPreviewEl.style.display = 'none'

    // Hide "all workspaces" checkbox if only one workspace open
    const wsCount = WorkspaceManager.getAll().length
    allWorkspacesCheckbox.checked = false
    allWorkspacesCheckbox.parentElement.style.display = wsCount > 1 ? '' : 'none'
    updateSaveSubtitle()

    // Handle subfolder dropdown for Electron mode
    const electronOnlyField = saveModal.querySelector('.electron-only-field')
    if (window.electronAPI) {
        // Show subfolder dropdown in Electron mode
        electronOnlyField.style.display = 'block'
        await populateSubfolderDropdown()
    } else {
        // Hide subfolder dropdown in web mode
        electronOnlyField.style.display = 'none'
    }

    // Thumbnail Logic
    refreshThumbnailSources()

    saveModal.style.display = 'flex'
}

async function populateSubfolderDropdown(){
    if (!subfolderSelectEl || !window.electronAPI) return

    try {
        // Get existing folders from the saves directory
        const folders = await window.electronAPI.listPatchFolders()

        // Clear existing options except Root
        subfolderSelectEl.innerHTML = '<option value="">Root</option>'

        // Add existing subfolders as options
        folders.forEach(folder => {
            if (folder.name !== null) { // Skip the Root folder since it's already added
                const option = document.createElement('option')
                option.value = folder.name
                option.textContent = folder.displayName
                subfolderSelectEl.appendChild(option)
            }
        })

        // Set default selection to Root
        subfolderSelectEl.value = ''
    } catch (error) {
        console.error('Failed to populate subfolder dropdown:', error)
        // Keep just the Root option if there's an error
        subfolderSelectEl.innerHTML = '<option value="">Root</option>'
    }
}

function updateThumbnailPreview(){
    if(outputNodesForThumb.length === 0){
        patchThumbnailPreviewEl.style.display = 'none'
        patchThumbnailPreviewEl.dataset.thumbnailData = ''
        thumbnailHelpEl.textContent = 'No active Output node found to generate a thumbnail.'
        thumbPrevBtn.disabled = true
        thumbNextBtn.disabled = true
        return
    }

    thumbPrevBtn.disabled = outputNodesForThumb.length <= 1
    thumbNextBtn.disabled = outputNodesForThumb.length <= 1

    const outputNode = outputNodesForThumb[thumbnailOutputIndex]
    const thumbnailData = generateThumbnail(outputNode)

    if(thumbnailData){
        patchThumbnailPreviewEl.src = thumbnailData
        patchThumbnailPreviewEl.dataset.thumbnailData = thumbnailData
        patchThumbnailPreviewEl.style.display = 'block'

        const helpText = `Thumbnail from Output Node (ID: ${outputNode.id}). [${thumbnailOutputIndex + 1}/${outputNodesForThumb.length}]`
        thumbnailHelpEl.textContent = helpText
    } else {
        patchThumbnailPreviewEl.style.display = 'none'
        patchThumbnailPreviewEl.dataset.thumbnailData = ''
        thumbnailHelpEl.textContent = 'Failed to generate thumbnail for this output.'
    }
}

function generateThumbnail(outputNode){
    const canvas = outputNode?.elements?.canvas
    if(canvas && canvas.width > 0 && canvas.height > 0){
        const tempCanvas = document.createElement('canvas')
        const tempCtx = tempCanvas.getContext('2d')
        const thumbWidth = 256
        const thumbHeight = 144
        tempCanvas.width = thumbWidth
        tempCanvas.height = thumbHeight

        const sourceAspect = canvas.width / canvas.height
        const thumbAspect = thumbWidth / thumbHeight
        let drawWidth
        let drawHeight

        if(sourceAspect > thumbAspect){
            drawWidth = thumbWidth
            drawHeight = thumbWidth / sourceAspect
        } else {
            drawHeight = thumbHeight
            drawWidth = thumbHeight * sourceAspect
        }

        const offsetX = (thumbWidth - drawWidth) / 2
        const offsetY = (thumbHeight - drawHeight) / 2

        tempCtx.fillStyle = '#111'
        tempCtx.fillRect(0, 0, thumbWidth, thumbHeight)
        tempCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, offsetX, offsetY, drawWidth, drawHeight)

        return tempCanvas.toDataURL('image/jpeg', 0.85)
    }
    return ''
}

async function checkPatchNameExists(patchName){
    // Check if running in Electron mode
    if (window.electronAPI) {
        try {
            // Check if patch file with this name exists in workspace
            const patchFiles = await window.electronAPI.listPatchFiles()
            return patchFiles.some(patchFile => {
                const meta = patchFile.data?.meta || {}
                return meta.name === patchName
            })
        } catch (error) {
            console.error('Failed to check existing patches in workspace:', error)
            return false // If we can't check, allow the save attempt
        }
    } else {
        // Web mode: check localStorage patches
        const patches = getRegularPatchesFromLocalStorage()
        return patches.some(patch => {
            const meta = patch.meta || {}
            return meta.name === patchName
        })
    }
}


async function handleSaveNew(){
    if(!patchNameEl.value){
        showAlertModal('Name is required.', 'Save')
        return
    }

    const patchName = patchNameEl.value

    // Check if patch name already exists
    const nameExists = await checkPatchNameExists(patchName)
    if(nameExists){
        showAlertModal('A file with that name already exists. Please choose a different name.', 'Save')
        return
    }

    const patch = serializeWorkspace(allWorkspacesCheckbox.checked)
    patch.meta = {
        name: patchNameEl.value,
        author: patchAuthorEl.value,
        description: patchDescriptionEl.value,
        thumbnail: patchThumbnailPreviewEl.dataset.thumbnailData || ''
    }
    addVersionToPatch(patch) // Add version number

    const safeFilename = patchNameEl.value.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'workspace'

    if (window.electronAPI) {
        try {
            // Get selected subfolder (empty string means Root)
            const selectedFolder = subfolderSelectEl.value || null

            // Save to saves/ directory in Electron
            const savedPath = await window.electronAPI.savePatchFile(patch, safeFilename, selectedFolder)

            try {
                const workspacePath = await window.electronAPI.getWorkspacePath()
                const relativePath = savedPath.replace(workspacePath, '.')
                saveMessageEl.textContent = `Saved to ${relativePath}`
            } catch {
                saveMessageEl.textContent = `Saved to ${savedPath}`
            }
            downloadLinkContainerEl.innerHTML = ''

        } catch (error) {
            console.error('Failed to save file:', error)
            showAlertModal('Failed to save file. Please try again.', 'Save')
            return
        }
    } else {
        // Web mode: use localStorage and provide download
        const saved = savePatchToLocalStorage(patch)
        if (!saved) return

        saveMessageEl.textContent = "Saved to local storage."

        // Provide download link
        downloadLinkContainerEl.innerHTML = ''
        const patchJsonString = JSON.stringify(patch, null, 2)
        const blob = new Blob([patchJsonString], {type: 'application/json'})
        const url = URL.createObjectURL(blob)
        const downloadLink = document.createElement('a')
        downloadLink.href = url
        downloadLink.download = `${safeFilename}.svs`
        downloadLink.textContent = `Download ${downloadLink.download}`
        downloadLink.classList.add('patch-download-link')
        downloadLinkContainerEl.appendChild(downloadLink)
    }

    // Switch to success state: hide form, show feedback
    saveModal.querySelector('.save-modal-body').style.display = 'none'
    saveFeedbackEl.style.display = 'block'
    saveConfirmBtn.style.display = 'none'
    allWorkspacesCheckbox.parentElement.style.display = 'none'
    saveCancelBtn.textContent = 'Done'

    // Rename the active tab and set source (single-workspace saves only)
    if (!allWorkspacesCheckbox.checked) {
        const activeWs = WorkspaceManager.getActiveWorkspace()
        if (activeWs) {
            WorkspaceManager.rename(activeWs.id, patchNameEl.value)
            const source = (window.electronAPI)
                ? { type: 'electron', filename: safeFilename, folder: subfolderSelectEl.value || null, author: patchAuthorEl.value, description: patchDescriptionEl.value }
                : { type: 'localStorage', author: patchAuthorEl.value, description: patchDescriptionEl.value }
            WorkspaceManager.setSource(activeWs.id, source)
            window.workspaceTabBar?.render()
        }
    }
}

function overwritePatchInLocalStorage(originalPatch, newPatch){
    const patches = getRegularPatchesFromLocalStorage()
    const originalMeta = originalPatch.meta || {}

    const idx = patches.findIndex(p => {
        const meta = p.meta || {}
        return meta.name === originalMeta.name &&
               meta.author === originalMeta.author &&
               meta.description === originalMeta.description
    })

    if(idx >= 0){
        patches[idx] = newPatch
    } else {
        console.warn('Original file not found for overwrite, appending instead.')
        patches.push(newPatch)
    }

    try {
        localStorage.setItem('silvia_patches', JSON.stringify(patches))
        return true
    } catch(e){
        console.error('Could not overwrite patch in local storage:', e)
        showAlertModal('Error saving. Local storage might be full.', 'Save')
        return false
    }
}

export function serializeWorkspace(allWorkspaces = false){
    // Get nodes to serialize - either all nodes or just active workspace
    const activeWs = WorkspaceManager.getActiveWorkspace()
    const workspaceNodes = allWorkspaces
        ? [...SNode.nodes]  // All nodes across all workspaces (convert Set to Array)
        : (activeWs ? SNode.getNodesOnWorkspace(activeWs.id) : SNode.getVisibleNodes())

    const nodes = workspaceNodes.map((node) => {
        const controls = {}
        const controlRanges = {} // Store edited min/max/step values
        Object.entries(node.input).forEach(([key, input]) => {
            if(input.control !== null){
                const controlEl = node.nodeEl.querySelector(`[data-input-el="${key}"]`)
                if(controlEl){
                    controls[key] = controlEl.value

                    // Check if this is an s-number with edited min/max/step
                    if(controlEl.tagName === 'S-NUMBER'){
                        const currentMin = parseFloat(controlEl.getAttribute('min'))
                        const currentMax = parseFloat(controlEl.getAttribute('max'))
                        const currentStep = parseFloat(controlEl.getAttribute('step'))

                        const defaultMin = input.control.min ?? -Infinity
                        const defaultMax = input.control.max ?? Infinity
                        const defaultStep = input.control.step ?? 1

                        // Only store if different from defaults
                        if(currentMin !== defaultMin || currentMax !== defaultMax || currentStep !== defaultStep){
                            controlRanges[key] = {
                                min: currentMin,
                                max: currentMax,
                                step: currentStep
                            }
                        }
                    }
                }
            }
        })

        // Handle custom s-numbers in the custom area (e.g., Counter node)
        const customControlRanges = {}
        const customSNumbers = node.nodeEl.querySelectorAll('.node-custom s-number[data-el]')
        customSNumbers.forEach(el => {
            const id = el.dataset.el
            // Save min/max/step AND current value to ensure precision is restored correctly
            customControlRanges[id] = {
                min: parseFloat(el.getAttribute('min')),
                max: parseFloat(el.getAttribute('max')),
                step: parseFloat(el.getAttribute('step')),
                value: parseFloat(el.getAttribute('value'))
            }
        })

        const nodeData = {
            id: node.id,
            slug: node.slug,
            x: Number.parseInt(node.nodeEl.style.left, 10),
            y: Number.parseInt(node.nodeEl.style.top, 10),
            controls,
            // Save workspace visibility as array (Set not JSON-serializable)
            workspaceVisibility: [...node.workspaceVisibility]
        }

        // Add collapsed state if collapsed
        if(node.collapsed){
            nodeData.collapsed = true
        }

        // Add optionValues if they exist and are not empty
        if(node.optionValues && Object.keys(node.optionValues).length > 0){
            nodeData.optionValues = node.optionValues
        }

        // Add custom values if they exist and are not empty
        if(node.values && Object.keys(node.values).length > 0){
            nodeData.values = node.values
        }

        // Add edited control ranges if they exist
        if(Object.keys(controlRanges).length > 0){
            nodeData.controlRanges = controlRanges
        }

        // Add custom control ranges if they exist
        if(Object.keys(customControlRanges).length > 0){
            nodeData.customControlRanges = customControlRanges
        }

        // Add MIDI mappings for this node
        const midiMappings = {}
        // Check all controls for MIDI mappings (both input ports and custom controls)
        const allControls = [
            ...node.nodeEl.querySelectorAll('[data-input-el]'),
            ...node.nodeEl.querySelectorAll('.node-custom [data-el]')
        ]

        allControls.forEach(controlEl => {
            const key = controlEl.dataset.inputEl || controlEl.dataset.el
            if(key){
                if(controlEl.dataset.midiCc){
                    midiMappings[key] = {type: 'cc', value: parseInt(controlEl.dataset.midiCc)}
                } else if(controlEl.dataset.midiNote){
                    midiMappings[key] = {type: 'note', value: parseInt(controlEl.dataset.midiNote)}
                }
            }
        })
        if(Object.keys(midiMappings).length > 0){
            nodeData.midiMappings = midiMappings
        }

        return nodeData
    })

    // Build set of node IDs in this workspace for connection filtering
    const workspaceNodeIds = new Set(workspaceNodes.map(node => node.id))
    const connections = Array.from(Connection.connections)
        .filter(conn =>
            workspaceNodeIds.has(conn.source.parent.id) &&
            workspaceNodeIds.has(conn.destination.parent.id)
        )
        .map((conn) => ({
            fromNode: conn.source.parent.id,
            fromPort: conn.source.key,
            toNode: conn.destination.parent.id,
            toPort: conn.destination.key
        }))

    // Save editor width
    const nodeRoot = document.getElementById('node-root')
    const editorWidth = nodeRoot ? nodeRoot.offsetWidth : window.innerWidth

    // Collect asset references for workspace management
    const assetReferences = new Set()
    nodes.forEach(nodeData => {
        if (nodeData.values && nodeData.values.assetPath && nodeData.values.assetPath.startsWith('asset://')) {
            assetReferences.add(nodeData.values.assetPath)
        }
    })

    const result = {nodes, connections, editorWidth}

    // Add workspace info
    if (activeWs) {
        const workspaceList = allWorkspaces
            ? WorkspaceManager.getAll().map(ws => ({ id: ws.id, name: ws.name }))
            : [{ id: activeWs.id, name: activeWs.name }]

        result.workspaceTree = {
            version: PATCH_VERSION,
            activeWorkspaceId: activeWs.id,
            workspaces: workspaceList
        }
    }

    // Add asset references if any exist (Electron mode)
    if (assetReferences.size > 0) {
        result.assetReferences = Array.from(assetReferences)
    }

    return result
}

function savePatchToLocalStorage(patch){
    const patches = getRegularPatchesFromLocalStorage()
    patches.push(patch)
    try {
        localStorage.setItem('silvia_patches', JSON.stringify(patches))
        return true
    } catch(e){
        console.error('Could not save patch to local storage:', e)
        showAlertModal('Error saving. Local storage might be full.', 'Save')
        return false
    }
}

/**
 * Quick-save the active workspace back to its source.
 * If no source exists, opens the save modal instead.
 */
export async function quickSave() {
    const activeWs = WorkspaceManager.getActiveWorkspace()
    if (!activeWs?.source?.type) {
        openSaveModal()
        return
    }

    const source = activeWs.source

    // Serialize active workspace only
    const patch = serializeWorkspace(false)
    patch.meta = {
        name: activeWs.name,
        author: source.author || '',
        description: source.description || '',
        thumbnail: generateQuickThumbnail()
    }
    addVersionToPatch(patch)

    if (source.type === 'electron' && window.electronAPI) {
        try {
            await window.electronAPI.savePatchFile(patch, source.filename, source.folder)
            flashTab(activeWs.id)
        } catch (error) {
            console.error('Quick save failed:', error)
            showAlertModal('Failed to save file. Please try again.', 'Save')
        }
    } else if (source.type === 'localStorage') {
        // Build a stub with .meta for overwritePatchInLocalStorage matching
        const originalMeta = {
            meta: { name: activeWs.name, author: source.author || '', description: source.description || '' }
        }
        const saved = overwritePatchInLocalStorage(originalMeta, patch)
        if (saved) flashTab(activeWs.id)
    }
}

/** Grab a thumbnail from the first visible output node, or return empty string. */
function generateQuickThumbnail() {
    const outputs = SNode.getVisibleOutputs()
    if (outputs.length === 0) return ''
    return generateThumbnail(outputs[0])
}

/** Briefly flash the workspace tab to confirm save. */
function flashTab(workspaceId) {
    const tab = document.querySelector(`.workspace-tab[data-workspace-id="${workspaceId}"]`)
    if (!tab) return
    tab.classList.add('just-saved')
    setTimeout(() => tab.classList.remove('just-saved'), 1200)
}
