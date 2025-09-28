import {registerNode} from '../registry.js'

registerNode({
    slug: 'note',
    icon: '📝',
    label: 'Note',
    tooltip: 'Just a way to add comments to a patch :^)',
    input: {},
    output: {},
    
    elements: {},
    values: {
        noteText: '',
        width: '200px',
        height: '100px'
    },
    
    onCreate(){
        if(!this.customArea){return}
        
        // Create textarea element
        const textarea = document.createElement('textarea')
        textarea.className = 'note-textarea'
        textarea.placeholder = 'Enter notes here...'
        textarea.value = this.values.noteText || ''
        
        // Style the textarea with persisted dimensions
        textarea.style.width = this.values.width || '200px'
        textarea.style.height = this.values.height || '100px'
        textarea.style.resize = 'both'
        textarea.style.padding = '8px'
        textarea.style.border = '1px solid var(--main-color-dim)'
        textarea.style.borderRadius = '4px'
        textarea.style.backgroundColor = 'var(--bg-color)'
        textarea.style.color = 'var(--text-color)'
        textarea.style.fontFamily = 'monospace'
        textarea.style.fontSize = '12px'
        textarea.style.outline = 'none'
        
        // Add focus styles
        textarea.addEventListener('focus', () => {
            textarea.style.borderColor = 'var(--main-color)'
        })
        
        textarea.addEventListener('blur', () => {
            textarea.style.borderColor = 'var(--main-color-dim)'
        })
        
        // Save text on input
        textarea.addEventListener('input', () => {
            this.values.noteText = textarea.value
        })
        
        // Save dimensions on resize
        const resizeObserver = new ResizeObserver(() => {
            this.values.width = textarea.style.width
            this.values.height = textarea.style.height
        })
        resizeObserver.observe(textarea)
        
        // Store observer reference for cleanup
        this.elements.resizeObserver = resizeObserver
        
        // Prevent node dragging when interacting with textarea
        textarea.addEventListener('pointerdown', (e) => {
            e.stopPropagation()
        })
        
        // Store reference
        this.elements.textarea = textarea
        
        // Add to custom area
        this.customArea.appendChild(textarea)
    },
    
    onDestroy(){
        if(this.elements.resizeObserver){
            this.elements.resizeObserver.disconnect()
        }
        if(this.elements.textarea){
            this.elements.textarea.remove()
        }
    }
})