import {SNode} from './snode.js'
import {Connection} from './connections.js'
import {settings} from './settings.js'

const editor = document.getElementById('editor')

// Horizontal scroll on wheel
editor.addEventListener('wheel', (e) => {
    if(e.target.closest('#node-menu')){return}

    // Only skip if textarea is focused
    if(document.activeElement.tagName === 'TEXTAREA'){return}

    // Only skip if s-number is focused
    const sNumber = e.target.closest('s-number')
    if(sNumber && document.activeElement === sNumber.querySelector('.s-number-input')){return}

    // Only skip if canvas is focused
    if(e.target.tagName === 'CANVAS' && document.activeElement === e.target){return}

    e.preventDefault()
    const scrollDirection = settings.reverseScrolling ? -1 : 1
    editor.scrollLeft += e.deltaY * scrollDirection
}, {passive: false})

// Toggle visibility with 'h' key and fullscreen with 'f' key
document.addEventListener('keydown', (e) => {
    if(document.activeElement.tagName === 'INPUT'){return}
    if(document.activeElement.tagName === 'TEXTAREA'){return}
    if(e.key.toLowerCase() === 'h'){
        editor.style.display = editor.style.display === 'none' ? 'block' : 'none'
    }
    if(e.key.toLowerCase() === 'f'){
        if(!document.fullscreenElement){
            document.documentElement.requestFullscreen()
        } else {
            document.exitFullscreen()
        }
    }
})

// --- Workspace Resizing Logic ---
const nodeRoot = document.getElementById('node-root')
const extendBtn = document.getElementById('workspace-extend-btn')
const cropBtn = document.getElementById('workspace-crop-btn')
const EXTEND_AMOUNT = 500 // px

function getRightmostNodeEdge(){
    const currentWorkspaceNodes = SNode.getNodesInCurrentWorkspace()
    if(currentWorkspaceNodes.length === 0){return 0}
    let maxRight = 0
    for(const node of currentWorkspaceNodes){
        const rightEdge = node.nodeEl.offsetLeft + node.nodeEl.offsetWidth
        if(rightEdge > maxRight){
            maxRight = rightEdge
        }
    }
    return maxRight
}

function getMinWorkspaceWidth(){
    const rightmostNodeEdge = getRightmostNodeEdge()
    // Minimum width is space needed for nodes plus padding
    return rightmostNodeEdge + 20
}

export function setWorkspaceWidth(newWidth){
    nodeRoot.style.width = `${newWidth}px`
    // Global resize handler calls Connection.redrawAllConnections() and scaleSVG()
}

function extendWorkspace(){
    const currentWidth = nodeRoot.offsetWidth
    setWorkspaceWidth(currentWidth + EXTEND_AMOUNT)
    Connection.redrawAllConnections() // <-- ADD THIS LINE
    updateCropButtonState()
}

function cropWorkspace(){
    const currentWidth = nodeRoot.offsetWidth
    const minWidth = getMinWorkspaceWidth()
    // Cropping is now only limited by the rightmost node.
    const editorWidth = editor.getBoundingClientRect().width
    const newWidth = Math.max(minWidth, editorWidth, currentWidth - EXTEND_AMOUNT)
    setWorkspaceWidth(newWidth)
    Connection.redrawAllConnections() // <-- ADD THIS LINE
    updateCropButtonState()
}

export function updateCropButtonState(){
    // This function can be called externally, so ensure elements are ready
    if(!nodeRoot || !cropBtn){return}
    const currentWidth = nodeRoot.offsetWidth
    // Disable crop button when workspace is at minimum size (editor or nodes)
    const editorWidth = editor.getBoundingClientRect().width
    const disableAtWidth = Math.max(getMinWorkspaceWidth(), editorWidth)
    cropBtn.disabled = currentWidth <= disableAtWidth
}

/**
 * Adjusts the workspace width when the window resizes.
 * Ensures the workspace is at least as wide as the viewport by expanding it if needed.
 * It will NOT shrink the workspace.
 */
export function expandWorkspaceToViewport(){
    if(!nodeRoot){return}
    const currentWidth = nodeRoot.offsetWidth
    const editorWidth = editor.getBoundingClientRect().width

    // If the editor has become wider than the workspace, expand the workspace to match.
    if(editorWidth > currentWidth){
        setWorkspaceWidth(editorWidth)
    }
}

export function clearWorkspace(){
    // Reset workspace width to editor width and scroll to left FIRST
    const editorWidth = editor.getBoundingClientRect().width
    setWorkspaceWidth(editorWidth)
    editor.scrollLeft = 0

    // Only clear nodes in current workspace
    const currentWorkspaceOutputs = SNode.getOutputsInCurrentWorkspace()
    currentWorkspaceOutputs.forEach((outNode) => outNode.isDestroyed = true)

    const currentWorkspaceNodes = SNode.getNodesInCurrentWorkspace()
    currentWorkspaceNodes.forEach((node) => node.destroy())

    // Clear connections involving destroyed nodes (handled by destroy method)
    Connection.redrawAllConnections()

    updateCropButtonState()

    // Mark workspace as dirty since clearing is a significant change
    if (window.markDirty) {
        window.markDirty()
    }
}

// Initialize everything on DOM load
document.addEventListener('DOMContentLoaded', () => {
    // Set the initial workspace width. The resize listener in main.js will handle future changes.
    const editorWidth = editor.getBoundingClientRect().width
    nodeRoot.style.width = `${editorWidth}px`
    updateCropButtonState()

    extendBtn.addEventListener('click', (e) => {
        extendWorkspace()
        e.target.blur() // Remove focus after click to allow scrolling
    })
    cropBtn.addEventListener('click', (e) => {
        cropWorkspace()
        e.target.blur() // Remove focus after click to allow scrolling
    })

    const clearBtn = document.getElementById('clear-workspace-btn')
    clearBtn.addEventListener('click', (e) => {
        clearWorkspace()
        e.target.blur() // Remove focus after click to allow scrolling
    })
})