import {getPatchesFromLocalStorage} from './load.js'
import {addVersionToPatch} from './version.js'

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
let patchJsonOutputEl
let downloadLinkContainerEl
let subfolderSelectEl

function createSaveModal(){
    const html = `
	<div class="modal-overlay" style="display: none;" data-el="saveModal">
		<div class="modal-content">
			<h2>Save Patch - Current Workspace</h2>
            <p style="margin-bottom: 1rem; color: var(--text-secondary); font-size: 0.9rem;">This will save the nodes and connections in your current workspace only.</p>
            <div style="display: flex; gap: 2rem;">
                <div style="display: flex; flex-direction: column;">
                    <div class="form-group">
                        <div class="thumbnail-header">
                            <label>Thumbnail</label>
                            <div class="thumbnail-controls">
                                <button class="thumb-arrow-btn" data-el="thumbPrevBtn">⬅</button>
                                <button class="thumb-arrow-btn" data-el="thumbNextBtn">⮕</button>
                            </div>
                        </div>
                        <img src="" alt="Patch thumbnail preview" style="display:none;" data-el="patchThumbnailPreviewEl">
                        <p class="help-text" data-el="thumbnailHelpEl"></p>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; flex-grow: 1; gap: 5px;">
                    <div class="form-group">
                        <label for="patch-name">Name</label>
                        <input type="text" id="patch-name" required data-el="patchNameEl">
                    </div>
                    <div class="form-group">
                        <label for="patch-author">Author</label>
                        <input type="text" id="patch-author" data-el="patchAuthorEl">
                    </div>
                    <div class="form-group" style="flex-grow:1">
                        <label for="patch-description">Description</label>
                        <textarea id="patch-description" rows="3" data-el="patchDescriptionEl"></textarea>
                    </div>
                    <div class="form-group electron-only-field" style="display: none;">
                        <label for="subfolder-select">Save to Folder</label>
                        <select class="slct" id="subfolder-select" data-el="subfolderSelectEl">
                            <option value="">Root</option>
                        </select>
                    </div>
                </div>
            </div>
			<div class="modal-actions">
				<button data-el="saveConfirmBtn">Save</button>
				<button class="cancel-btn" data-el="saveCancelBtn">Cancel</button>
			</div>
			<div style="display: none;" data-el="saveFeedbackEl">
					<p data-el="saveMessageEl"></p>
                    <div class="form-group" data-el="downloadLinkContainerEl" style="margin-top: 10px;">
						<!-- Download link will be inserted here -->
					</div>
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
        subfolderSelectEl
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
    
    // Close on escape
    document.addEventListener('escape-pressed', () => {
        if(saveModal.style.display === 'flex'){
            saveModal.style.display = 'none'
        }
    })
}

function cycleThumbnail(direction){
    if(outputNodesForThumb.length === 0){return}
    const newIndex = thumbnailOutputIndex + direction
    const len = outputNodesForThumb.length
    // Wrap around logic
    thumbnailOutputIndex = ((newIndex % len) + len) % len
    updateThumbnailPreview()
}

async function openSaveModal(){
    // Reset form
    patchNameEl.value = ''
    patchAuthorEl.value = ''
    patchDescriptionEl.value = ''
    saveFeedbackEl.style.display = 'none'
    patchThumbnailPreviewEl.style.display = 'none'

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
    outputNodesForThumb = SNode.getOutputsInCurrentWorkspace()
    thumbnailOutputIndex = 0

    updateThumbnailPreview()

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

    const patch = serializeWorkspace()
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
        downloadLink.classList.add('floating-btn') // Reuse style
        downloadLinkContainerEl.appendChild(downloadLink)
    }
}

export function serializeWorkspace(){
    const nodes = Array.from(SNode.getNodesInCurrentWorkspace()).map((node) => {
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
            controls
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

    const currentWorkspaceNodes = new Set(SNode.getNodesInCurrentWorkspace().map(node => node.id))
    const connections = Array.from(Connection.connections)
        .filter(conn =>
            currentWorkspaceNodes.has(conn.source.parent.id) &&
            currentWorkspaceNodes.has(conn.destination.parent.id)
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
