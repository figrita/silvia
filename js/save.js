import {getPatchesFromLocalStorage} from './load.js'
import {addVersionToPatch, PATCH_VERSION} from './version.js'
import {iconHtml} from './icons.js'

// Import the regular patches function for saving (to avoid duplication)
function getRegularPatchesFromLocalStorage(){
    try {
        const patches = localStorage.getItem('silvia_patches')
        return patches ? JSON.parse(patches) : []
    } catch(e){
        console.error('Could not load regular patches from local storage:', e)
        return []
    }
}
import {autowire, StringToFragment} from './utils.js'
import {SNode} from './snode.js'
import {Connection} from './connections.js'
import {WorkspaceManager} from './workspaceManager.js'

// --- Module-level state ---
let thumbnailOutputIndex = 0
let outputNodesForThumb = []
let activeSaveTab = 'save'
let existingPatches = []
let selectedExistingPatch = null
let selectedExistingPatchFile = null

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
let patchJsonOutputEl
let downloadLinkContainerEl
let subfolderSelectEl
let allWorkspacesCheckbox
let saveSubtitleEl
// Save As DOM elements
let saveTabSaveEl
let saveTabSaveAsEl
let saveTabContentSave
let saveTabContentSaveAs
let existingPatchSelectEl
let keepNameCheckbox
let keepAuthorCheckbox
let keepDescriptionCheckbox
let keepThumbnailCheckbox
let patchNameSaveAsEl
let patchAuthorSaveAsEl
let patchDescriptionSaveAsEl

function createSaveModal(){
    const html = `
	<div class="modal-overlay" style="display: none;" data-el="saveModal">
		<div class="save-modal-window">
			<div class="save-modal-header">
				<h2>Save Patch</h2>
			</div>
			<div class="save-modal-tab-bar">
				<button class="save-tab save-tab-active" data-el="saveTabSaveEl">Save</button>
				<button class="save-tab" data-el="saveTabSaveAsEl">Save As</button>
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
						<img src="" alt="Patch thumbnail preview" style="display:none;" data-el="patchThumbnailPreviewEl">
						<p class="help-text" data-el="thumbnailHelpEl"></p>
                        <label class="keep-original-toggle save-as-only" style="display:none;" data-el="keepThumbnailCheckbox">
						    <input type="checkbox" checked>
							Keep original
						</label>
					</div>
				</div>
				<div class="save-fields-column">
					<p data-el="saveSubtitleEl" class="save-subtitle">Saves the current workspace.</p>
					<div class="save-tab-content" data-el="saveTabContentSave">
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
					<div class="save-tab-content save-tab-content-hidden" data-el="saveTabContentSaveAs">
						<div class="form-group">
							<label>Overwrite Existing Patch</label>
							<select class="slct" data-el="existingPatchSelectEl">
								<option value="">-- Select a patch --</option>
							</select>
						</div>
						<div class="form-group">
							<div class="save-as-field-header">
								<label>Name</label>
								<label class="keep-original-toggle">
									<input type="checkbox" checked data-el="keepNameCheckbox">
									Keep original
								</label>
							</div>
							<input type="text" disabled data-el="patchNameSaveAsEl">
						</div>
						<div class="form-group">
							<div class="save-as-field-header">
								<label>Author</label>
								<label class="keep-original-toggle">
									<input type="checkbox" checked data-el="keepAuthorCheckbox">
									Keep original
								</label>
							</div>
							<input type="text" disabled data-el="patchAuthorSaveAsEl">
						</div>
						<div class="form-group save-field-grow">
							<div class="save-as-field-header">
								<label>Description</label>
								<label class="keep-original-toggle">
									<input type="checkbox" checked data-el="keepDescriptionCheckbox">
									Keep original
								</label>
							</div>
							<textarea rows="3" disabled data-el="patchDescriptionSaveAsEl"></textarea>
						</div>
					</div>
				</div>
			</div>
			<div class="save-modal-footer">
				<label class="save-modal-checkbox">
					<input type="checkbox" data-el="allWorkspacesCheckbox">
					Include all open workspaces
				</label>
				<button data-el="saveConfirmBtn">Save</button>
				<button class="cancel-btn" data-el="saveCancelBtn">Cancel</button>
			</div>
			<div class="save-feedback" style="display: none;" data-el="saveFeedbackEl">
				<p data-el="saveMessageEl"></p>
				<div class="form-group" data-el="downloadLinkContainerEl"></div>
				<div class="form-group">
					<label>Patch JSON</label>
					<textarea rows="5" readonly data-el="patchJsonOutputEl"></textarea>
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
        patchJsonOutputEl,
        downloadLinkContainerEl,
        subfolderSelectEl,
        allWorkspacesCheckbox,
        saveSubtitleEl,
        saveTabSaveEl,
        saveTabSaveAsEl,
        saveTabContentSave,
        saveTabContentSaveAs,
        existingPatchSelectEl,
        keepNameCheckbox,
        keepAuthorCheckbox,
        keepDescriptionCheckbox,
        keepThumbnailCheckbox,
        patchNameSaveAsEl,
        patchAuthorSaveAsEl,
        patchDescriptionSaveAsEl
    } = saveElements)

    // Get the static trigger buttons from the main document
    const saveBtn = document.getElementById('save-patch-btn')

    // --- Attach Event Listeners ---
    saveBtn.addEventListener('click', openSaveModal)

    saveCancelBtn.addEventListener('click', () => (saveModal.style.display = 'none'))

    // Close modals on overlay click
    saveModal.addEventListener('click', (e) => {
        if(e.target === saveModal){saveModal.style.display = 'none'}
    })

    saveConfirmBtn.addEventListener('click', handleSave)

    thumbPrevBtn.addEventListener('click', () => cycleThumbnail(-1))
    thumbNextBtn.addEventListener('click', () => cycleThumbnail(1))

    allWorkspacesCheckbox.addEventListener('change', () => {
        updateSaveSubtitle()
        refreshThumbnailSources()
    })

    // Tab switching
    saveTabSaveEl.addEventListener('click', () => switchSaveTab('save'))
    saveTabSaveAsEl.addEventListener('click', () => switchSaveTab('saveas'))

    // Existing patch dropdown
    existingPatchSelectEl.addEventListener('change', handleExistingPatchSelected)

    // Keep-original checkboxes
    wireKeepOriginalCheckbox(keepNameCheckbox, patchNameSaveAsEl, () => selectedExistingPatch?.meta?.name || '')
    wireKeepOriginalCheckbox(keepAuthorCheckbox, patchAuthorSaveAsEl, () => selectedExistingPatch?.meta?.author || '')
    wireKeepOriginalCheckbox(keepDescriptionCheckbox, patchDescriptionSaveAsEl, () => selectedExistingPatch?.meta?.description || '')

    // Keep-original thumbnail checkbox
    const thumbCheckboxInput = keepThumbnailCheckbox.querySelector('input')
    thumbCheckboxInput.addEventListener('change', () => {
        if(thumbCheckboxInput.checked && selectedExistingPatch?.meta?.thumbnail){
            // Show original thumbnail
            patchThumbnailPreviewEl.src = selectedExistingPatch.meta.thumbnail
            patchThumbnailPreviewEl.dataset.thumbnailData = selectedExistingPatch.meta.thumbnail
            patchThumbnailPreviewEl.style.display = 'block'
            thumbnailHelpEl.textContent = 'Using original patch thumbnail.'
            thumbPrevBtn.disabled = true
            thumbNextBtn.disabled = true
        } else {
            // Revert to live thumbnail
            refreshThumbnailSources()
        }
    })

    // Close on escape
    document.addEventListener('escape-pressed', () => {
        if(saveModal.style.display === 'flex'){
            saveModal.style.display = 'none'
        }
    })
}

function wireKeepOriginalCheckbox(checkbox, field, getOriginalValue){
    checkbox.addEventListener('change', () => {
        field.disabled = checkbox.checked
        if(checkbox.checked){
            field.value = getOriginalValue()
        }
    })
}

function switchSaveTab(tabType){
    activeSaveTab = tabType

    saveTabSaveEl.classList.toggle('save-tab-active', tabType === 'save')
    saveTabSaveAsEl.classList.toggle('save-tab-active', tabType === 'saveas')

    saveTabContentSave.classList.toggle('save-tab-content-hidden', tabType !== 'save')
    saveTabContentSaveAs.classList.toggle('save-tab-content-hidden', tabType !== 'saveas')

    // Update save button label
    saveConfirmBtn.textContent = tabType === 'save' ? 'Save' : 'Overwrite'

    // Show/hide thumbnail keep-original toggle
    keepThumbnailCheckbox.style.display = tabType === 'saveas' ? '' : 'none'

    // Clear feedback on tab switch
    saveFeedbackEl.style.display = 'none'

    if(tabType === 'saveas'){
        populateExistingPatchesDropdown()
    } else {
        // Restore live thumbnail when switching back to Save
        refreshThumbnailSources()
    }
}

async function populateExistingPatchesDropdown(){
    existingPatchSelectEl.innerHTML = '<option value="">-- Select a patch --</option>'
    existingPatches = []
    selectedExistingPatch = null
    selectedExistingPatchFile = null

    if(typeof window !== 'undefined' && window.electronAPI){
        try {
            // Get root patches
            const rootPatches = await window.electronAPI.listPatchFiles(null)
            rootPatches.forEach(pf => { pf._sourceFolder = null })

            // Get subfolder patches
            const folders = await window.electronAPI.listPatchFolders()
            const allPatchFiles = [...rootPatches]

            for(const folder of folders){
                if(folder.name !== null){
                    const subPatches = await window.electronAPI.listPatchFiles(folder.name)
                    subPatches.forEach(pf => { pf._sourceFolder = folder.name })
                    allPatchFiles.push(...subPatches)
                }
            }

            existingPatches = allPatchFiles
            allPatchFiles.forEach((pf, idx) => {
                const name = pf.data?.meta?.name || pf.filename
                const folderLabel = pf._sourceFolder ? ` [${pf._sourceFolder}]` : ''
                const option = document.createElement('option')
                option.value = idx
                option.textContent = name + folderLabel
                existingPatchSelectEl.appendChild(option)
            })
        } catch(e){
            console.error('Failed to list existing patches:', e)
        }
    } else {
        const patches = getRegularPatchesFromLocalStorage()
        existingPatches = patches
        patches.forEach((patch, idx) => {
            const name = patch.meta?.name || `Patch ${idx + 1}`
            const option = document.createElement('option')
            option.value = idx
            option.textContent = name
            existingPatchSelectEl.appendChild(option)
        })
    }
}

function handleExistingPatchSelected(){
    const idx = existingPatchSelectEl.value
    if(idx === ''){
        selectedExistingPatch = null
        selectedExistingPatchFile = null
        patchNameSaveAsEl.value = ''
        patchAuthorSaveAsEl.value = ''
        patchDescriptionSaveAsEl.value = ''
        keepThumbnailCheckbox.querySelector('input').checked = false
        refreshThumbnailSources()
        return
    }

    const index = parseInt(idx, 10)

    if(window.electronAPI){
        const patchFile = existingPatches[index]
        selectedExistingPatch = patchFile.data
        selectedExistingPatchFile = patchFile
    } else {
        selectedExistingPatch = existingPatches[index]
        selectedExistingPatchFile = null
    }

    const meta = selectedExistingPatch.meta || {}

    // Populate fields with existing metadata
    patchNameSaveAsEl.value = meta.name || ''
    patchAuthorSaveAsEl.value = meta.author || ''
    patchDescriptionSaveAsEl.value = meta.description || ''

    // Reset keep-original checkboxes to checked (locked)
    keepNameCheckbox.checked = true
    keepAuthorCheckbox.checked = true
    keepDescriptionCheckbox.checked = true
    patchNameSaveAsEl.disabled = true
    patchAuthorSaveAsEl.disabled = true
    patchDescriptionSaveAsEl.disabled = true

    // Reset thumbnail to original if available
    const thumbCheckboxInput = keepThumbnailCheckbox.querySelector('input')
    if(meta.thumbnail && meta.thumbnail.trim() !== ''){
        thumbCheckboxInput.checked = true
        patchThumbnailPreviewEl.src = meta.thumbnail
        patchThumbnailPreviewEl.dataset.thumbnailData = meta.thumbnail
        patchThumbnailPreviewEl.style.display = 'block'
        thumbnailHelpEl.textContent = 'Using original patch thumbnail.'
        thumbPrevBtn.disabled = true
        thumbNextBtn.disabled = true
    } else {
        thumbCheckboxInput.checked = false
        refreshThumbnailSources()
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

async function openSaveModal(){
    // Reset to Save tab
    switchSaveTab('save')

    // Default name to current workspace name
    const activeWs = WorkspaceManager.getActiveWorkspace()
    patchNameEl.value = activeWs?.name || ''
    patchAuthorEl.value = ''
    patchDescriptionEl.value = ''
    saveFeedbackEl.style.display = 'none'
    patchThumbnailPreviewEl.style.display = 'none'

    // Reset Save As state
    selectedExistingPatch = null
    selectedExistingPatchFile = null
    existingPatchSelectEl.value = ''
    patchNameSaveAsEl.value = ''
    patchAuthorSaveAsEl.value = ''
    patchDescriptionSaveAsEl.value = ''

    // Hide "all workspaces" checkbox if only one workspace open
    const wsCount = WorkspaceManager.getAll().length
    allWorkspacesCheckbox.checked = false
    allWorkspacesCheckbox.parentElement.style.display = wsCount > 1 ? '' : 'none'
    updateSaveSubtitle()

    // Handle subfolder dropdown for Electron mode
    const electronOnlyField = saveModal.querySelector('.electron-only-field')
    if (typeof window !== 'undefined' && window.electronAPI) {
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
        // Get existing folders from the patches directory
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
        thumbnailHelpEl.textContent = 'Failed to generate thumbnail for this output.'
    }
}

function generateThumbnail(outputNode){
    if(outputNode?.runtimeState?.renderer?.gl){
        const {canvas} = outputNode.runtimeState.renderer.gl
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
    if (typeof window !== 'undefined' && window.electronAPI) {
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

async function handleSave(){
    if(activeSaveTab === 'save'){
        await handleSaveNew()
    } else {
        await handleSaveAs()
    }
}

async function handleSaveNew(){
    if(!patchNameEl.value){
        alert('Patch name is required.')
        return
    }

    const patchName = patchNameEl.value

    // Check if patch name already exists
    const nameExists = await checkPatchNameExists(patchName)
    if(nameExists){
        alert('A patch with that name already exists. Please choose a different name.')
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

    const safeFilename = patchNameEl.value.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'patch'
    const patchJsonString = JSON.stringify(patch, null, 2)

    // Check if running in Electron mode
    if (typeof window !== 'undefined' && window.electronAPI) {
        try {
            // Get selected subfolder (empty string means Root)
            const selectedFolder = subfolderSelectEl.value || null

            // Save to workspace patches directory in Electron
            const savedPath = await window.electronAPI.savePatchFile(patch, safeFilename, selectedFolder)

            // Show feedback for Electron
            try {
                const workspacePath = await window.electronAPI.getWorkspacePath()
                const relativePath = savedPath.replace(workspacePath, './patches')
                saveMessageEl.textContent = `Your patch has been saved to: ${relativePath}`
            } catch {
                saveMessageEl.textContent = `Your patch has been saved to: ${savedPath}`
            }
            patchJsonOutputEl.value = patchJsonString
            saveFeedbackEl.style.display = 'block'

            // No download link needed in Electron mode
            downloadLinkContainerEl.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">Patch saved to workspace patches directory.</p>'

        } catch (error) {
            console.error('Failed to save patch file:', error)
            alert('Failed to save patch file. Please try again.')
            return
        }
    } else {
        // Web mode: use localStorage and provide download
        savePatchToLocalStorage(patch)

        // Show feedback
        saveMessageEl.textContent = "Your patch has been saved to your browser's local storage."
        patchJsonOutputEl.value = patchJsonString
        saveFeedbackEl.style.display = 'block'

        // Create and add download link
        downloadLinkContainerEl.innerHTML = '' // Clear previous link
        const blob = new Blob([patchJsonString], {type: 'application/json'})
        const url = URL.createObjectURL(blob)
        const downloadLink = document.createElement('a')
        downloadLink.href = url
        downloadLink.download = `${safeFilename}.svs`
        downloadLink.textContent = `Download ${downloadLink.download}`
        downloadLink.classList.add('patch-download-link')
        downloadLinkContainerEl.appendChild(downloadLink)
    }
}

async function handleSaveAs(){
    if(!selectedExistingPatch){
        alert('Please select an existing patch to overwrite.')
        return
    }

    const patch = serializeWorkspace(allWorkspacesCheckbox.checked)

    // Build metadata: use original or edited value per field
    const originalMeta = selectedExistingPatch.meta || {}
    const thumbCheckboxInput = keepThumbnailCheckbox.querySelector('input')
    const thumbnail = thumbCheckboxInput.checked
        ? (originalMeta.thumbnail || '')
        : (patchThumbnailPreviewEl.dataset.thumbnailData || '')
    patch.meta = {
        name: keepNameCheckbox.checked ? originalMeta.name : patchNameSaveAsEl.value,
        author: keepAuthorCheckbox.checked ? originalMeta.author : patchAuthorSaveAsEl.value,
        description: keepDescriptionCheckbox.checked ? originalMeta.description : patchDescriptionSaveAsEl.value,
        thumbnail
    }
    addVersionToPatch(patch)

    const patchJsonString = JSON.stringify(patch, null, 2)

    if(typeof window !== 'undefined' && window.electronAPI){
        try {
            const filename = selectedExistingPatchFile.filename.replace(/\.svs$/, '')
            const folder = selectedExistingPatchFile._sourceFolder || null
            const savedPath = await window.electronAPI.savePatchFile(patch, filename, folder)

            try {
                const workspacePath = await window.electronAPI.getWorkspacePath()
                const relativePath = savedPath.replace(workspacePath, './patches')
                saveMessageEl.textContent = `Patch overwritten: ${relativePath}`
            } catch {
                saveMessageEl.textContent = `Patch overwritten: ${savedPath}`
            }
            patchJsonOutputEl.value = patchJsonString
            saveFeedbackEl.style.display = 'block'
            downloadLinkContainerEl.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">Patch overwritten in workspace.</p>'
        } catch(error){
            console.error('Failed to overwrite patch file:', error)
            alert('Failed to overwrite patch file. Please try again.')
        }
    } else {
        overwritePatchInLocalStorage(selectedExistingPatch, patch)

        saveMessageEl.textContent = "Patch overwritten in local storage."
        patchJsonOutputEl.value = patchJsonString
        saveFeedbackEl.style.display = 'block'

        downloadLinkContainerEl.innerHTML = ''
        const safeFilename = (patch.meta.name || 'patch').replace(/[^a-z0-9]/gi, '_').toLowerCase()
        const blob = new Blob([patchJsonString], {type: 'application/json'})
        const url = URL.createObjectURL(blob)
        const downloadLink = document.createElement('a')
        downloadLink.href = url
        downloadLink.download = `${safeFilename}.svs`
        downloadLink.textContent = `Download ${downloadLink.download}`
        downloadLink.classList.add('patch-download-link')
        downloadLinkContainerEl.appendChild(downloadLink)
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
        console.warn('Original patch not found for overwrite, appending instead.')
        patches.push(newPatch)
    }

    try {
        localStorage.setItem('silvia_patches', JSON.stringify(patches))
    } catch(e){
        console.error('Could not overwrite patch in local storage:', e)
        alert('Error saving patch. Local storage might be full.')
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
    } catch(e){
        console.error('Could not save patch to local storage:', e)
        alert('Error saving patch. Local storage might be full.')
    }
}
