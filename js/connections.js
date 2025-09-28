// connections.js - Complete rewrite for dual wire coloring system

import {getGoldenRatioColor, mapJoin} from './utils.js'
import {settings} from './settings.js'
import {SNode, getDescendants} from './snode.js'
import {canConvert, createConversionMenu, removeConversionMenu} from './typeConversions.js'

export class CursorWire{
    port
    color

    constructor(port, event){
        this.port = port
        // ALWAYS use phi-spaced color for stroke attribute
        this.color = getGoldenRatioColor()

        // Prevent text selection during wire drag
        event.preventDefault()

        // Hide illegal ports on drag start
        managePortVisibility(this.port, true)
        document.body.style.cursor = 'grabbing'

        const editor = document.getElementById('editor') // Get reference
        
        // Store initial scroll position for scroll-aware dragging
        let lastScrollLeft = editor.scrollLeft
        let lastScrollTop = editor.scrollTop
        
        // Store the relative mouse position when drag started
        const editorRect = editor.getBoundingClientRect()
        const startMouseX = event.clientX - editorRect.left
        const startMouseY = event.clientY - editorRect.top

        if(port.portType == 'input'){
            this.onmove = (e) => {
                const editorRect = editor.getBoundingClientRect()
                
                // Calculate scroll delta since last frame
                const currentScrollLeft = editor.scrollLeft
                const currentScrollTop = editor.scrollTop
                const scrollDeltaX = currentScrollLeft - lastScrollLeft
                const scrollDeltaY = currentScrollTop - lastScrollTop
                
                // Calculate cursor position compensating for scroll
                const mouseX = e.clientX - editorRect.left
                const mouseY = e.clientY - editorRect.top
                const cursor = {
                    x: mouseX + currentScrollLeft,
                    y: mouseY + currentScrollTop
                }
                
                // Update scroll tracking
                lastScrollLeft = currentScrollLeft
                lastScrollTop = currentScrollTop
                
                this.drawCursorConnection(cursor, this.port)
            }
        } else {
            this.onmove = (e) => {
                const editorRect = editor.getBoundingClientRect()
                
                // Calculate scroll delta since last frame
                const currentScrollLeft = editor.scrollLeft
                const currentScrollTop = editor.scrollTop
                const scrollDeltaX = currentScrollLeft - lastScrollLeft
                const scrollDeltaY = currentScrollTop - lastScrollTop
                
                // Calculate cursor position compensating for scroll
                const mouseX = e.clientX - editorRect.left
                const mouseY = e.clientY - editorRect.top
                const cursor = {
                    x: mouseX + currentScrollLeft,
                    y: mouseY + currentScrollTop
                }
                
                // Update scroll tracking
                lastScrollLeft = currentScrollLeft
                lastScrollTop = currentScrollTop
                
                this.drawCursorConnection(this.port, cursor)
            }
        }

        this.onmove(event)

        // Listen for escape key to cancel wire dragging
        this.escapeHandler = () => this.cancel()
        document.addEventListener('escape-pressed', this.escapeHandler)
        
        document.addEventListener('pointermove', this.onmove)
        document.addEventListener('pointerup', this.destroy)
    }

    cancel = () => {
        // Clean up wire dragging without attempting to make a connection
        managePortVisibility(this.port, false)
        document.body.style.cursor = ''

        const current = Connection.svgRoot.getElementById('cursor-connection')
        if(current){current.remove()}
        
        document.removeEventListener('pointermove', this.onmove)
        document.removeEventListener('pointerup', this.destroy)
        document.removeEventListener('escape-pressed', this.escapeHandler)
    }

    destroy = (e) => {
        // Restore all ports on drag end
        managePortVisibility(this.port, false)
        document.body.style.cursor = ''

        const current = Connection.svgRoot.getElementById('cursor-connection')
        if(current){current.remove()}
        document.removeEventListener('pointermove', this.onmove)
        document.removeEventListener('pointerup', this.destroy)
        document.removeEventListener('escape-pressed', this.escapeHandler)

        const targetEl = e.target
        // Connect only if the target is a port and is not hidden
        if(targetEl.portObj && !targetEl.classList.contains('hidden')){
            const newPort = targetEl.portObj
            if(newPort === this.port){return}
            if(newPort.parent === this.port.parent){return}
            if(newPort.portType === this.port.portType){return}
            
            // Check for same type - direct connection
            if(newPort.type === this.port.type){
                if(this.port.portType === 'input'){
                    new Connection(newPort, this.port, this.color)
                } else {
                    new Connection(this.port, newPort, this.color)
                }
                window.markDirty()
                Connection.redrawAllConnections()
            }
            // Check for convertible types - show menu immediately on release
            else if(targetEl.classList.contains('convertible')){
                // Prevent default to stop menu from closing immediately
                e.preventDefault()
                e.stopPropagation()
                
                // Get port position for menu
                const rect = targetEl.getBoundingClientRect()
                const editor = document.getElementById('editor')
                const editorRect = editor.getBoundingClientRect()
                const x = rect.right - editorRect.left + editor.scrollLeft + 10
                const y = rect.top - editorRect.top + editor.scrollTop
                
                // Determine source and target based on drag direction
                let sourcePort, targetPort
                if(this.port.portType === 'input'){
                    sourcePort = newPort
                    targetPort = this.port
                } else {
                    sourcePort = this.port
                    targetPort = newPort
                }
                
                // Create conversion menu
                createConversionMenu(sourcePort, targetPort, x, y)
                
                // Add click handler to close menu when clicking outside
                setTimeout(() => {
                    const closeHandler = (evt) => {
                        const menu = document.getElementById('conversion-menu')
                        if(menu && !menu.contains(evt.target)){
                            removeConversionMenu()
                            // Clean up convertible classes
                            document.querySelectorAll('.port.convertible').forEach(port => {
                                port.classList.remove('convertible')
                            })
                            document.removeEventListener('pointerdown', closeHandler)
                        }
                    }
                    document.addEventListener('pointerdown', closeHandler)
                }, 10)
            }
        }
    }

    drawCursorConnection = (left, right) => {
        let pathData

        if(this.port.type === 'action'){
            // Straight line for action connections
            pathData = `M ${left.x} ${left.y} L ${right.x} ${right.y}`
        } else {
            // Curved connections for data types
            let leftControl, rightControl

            if(settings.droopyCables){
                const dx = Math.abs(left.x - right.x)
                const sag = Math.min(80, 15 + dx * 0.15)
                const handle = Math.min(120, dx * 0.4)
                leftControl = {x: left.x + handle, y: left.y + sag}
                rightControl = {x: right.x - handle, y: right.y + sag}
            } else {
                // Original straight S-curve
                leftControl = {x: left.x + 80, y: left.y}
                rightControl = {x: right.x - 80, y: right.y}
            }

            pathData = `M ${left.x} ${left.y} C ${leftControl.x} ${leftControl.y}, ${rightControl.x} ${rightControl.y}, ${right.x} ${right.y}`
        }

        // Create solid colored wire + optional black dashed shadow layer
        const strokeColor = settings.phiSpacedWires ? this.color : null
        const strokeAttr = strokeColor ? `stroke="${strokeColor}"` : ''
        let html = `<g id="cursor-connection"><path d="${pathData}" class="connection-path ${this.port.type}" ${strokeAttr}></path>`

        if(settings.stripedWires && this.port.type !== 'action') {
            html += `<path d="${pathData}" class="connection-path connection-shadow" stroke="#000"></path>`
        }
        html += `</g>`

        const current = Connection.svgRoot.getElementById('cursor-connection')
        if(current){current.remove()}
        Connection.svgRoot.insertAdjacentHTML('afterbegin', html)
    }
}

export class Connection{
    static connections = new Set()
    static svgRoot
    static nodeRootEl // Direct reference to the node container

    /**
     * Initializes static properties that depend on the DOM.
     * Must be called after the DOM is loaded.
     */
    static init(){
        this.svgRoot = document.getElementById('connection-root')
        this.nodeRootEl = document.getElementById('node-root')
        this.scaleSVG()
        this.updateThemeClass()
    }

    /**
     * Resizes the SVG overlay to perfectly match the node-root container.
     */
    static scaleSVG(){
        // Ensure initialization is complete
        if(!this.svgRoot || !this.nodeRootEl){return}

        const {offsetWidth, offsetHeight} = this.nodeRootEl
        this.svgRoot.setAttribute('width', offsetWidth - 1)
        this.svgRoot.setAttribute('height', offsetHeight)
    }

    /**
     * Updates the theme class on the SVG root based on current settings
     */
    static updateThemeClass() {
        if (!this.svgRoot) return
        if (settings.phiSpacedWires) {
            this.svgRoot.classList.remove('theme-wires')
        } else {
            this.svgRoot.classList.add('theme-wires')  
        }
    }

    /**
     * Updates port border visibility based on current settings
     */
    static updatePortBorderVisibility() {
        if (settings.showPortBorders) {
            document.body.classList.remove('hide-port-borders')
        } else {
            document.body.classList.add('hide-port-borders')
        }
    }

    static updateConnectionVisibility() {
        // Filter connections to only show those in current workspace
        const currentWorkspace = SNode.currentWorkspace
        this.connections.forEach(connection => {
            // Since nodes can only connect within the same workspace, just check source
            connection.visible = connection.source.parent.workspace === currentWorkspace
        })
    }

    static redrawAllConnections(){
        this.scaleSVG() // Resize SVG to match container
        this.updateThemeClass() // Apply theme settings
        // Only draw visible connections
        const html = mapJoin([...this.connections].filter(conn => conn.visible !== false), connection => connection.drawConnection())
        this.svgRoot.innerHTML = html

        // Update all port colors to match their connections (only visible ones)
        this.connections.forEach(connection => {
            if(connection.visible !== false) {
                connection.updatePortColors()
            } else {
                // Clear port colors for invisible connections
                Connection.clearPortColor(connection.source.portEl)
                Connection.clearPortColor(connection.destination.portEl)
            }
        })
    }

    source
    destination
    type
    color

    constructor(source, destination, color = null){
        this.source = source
        this.destination = destination
        this.type = source.type // 'float', 'color', or 'action'

        // ALWAYS use phi-spaced color for stroke attribute
        this.color = color || getGoldenRatioColor()

        if(this.type === 'action'){
            // No need to remove existing connections, actions are many-to-many
        } else {
            // Data connection logic: one-to-one on input
            const connectionsToRemove = [...Connection.connections].filter(conn =>
                conn.destination === destination
            )
            connectionsToRemove.forEach(conn => {
                // Re-enable the control for the connection being replaced
                conn.destination.parent.setControlDisabled(conn.destination.key, false)

                // Clear port border colors
                Connection.clearPortColor(conn.source.portEl)
                Connection.clearPortColor(conn.destination.portEl)

                conn.destination.connection = null
                Connection.connections.delete(conn)
                window.markDirty()
            })

            this.destination.connection = this.source

            // Disable control when connected
            this.destination.parent.setControlDisabled(this.destination.key, true)
        }

        Connection.connections.add(this)

        // Update port border colors to match connection
        this.updatePortColors()

        // Mark workspace as dirty for new connections
        window.markDirty()

        // Only trigger shader recompiles for data connections
        if(this.type !== 'action'){
            SNode.refreshDownstreamOutputs(destination.parent)
        }
    }

    updatePortColors() {
        // Set border colors on connected ports to match wire color
        if(this.source.portEl) {
            this.source.portEl.style.border = `3px solid ${this.color}`
        }
        if(this.destination.portEl) {
            this.destination.portEl.style.border = `3px solid ${this.color}`
        }
    }

    static clearPortColor(portEl) {
        if(portEl) {
            portEl.style.border = ''
        }
    }

    drawConnection = () => {
        let pathData

        if(this.type === 'action'){
            // Straight line for action connections
            pathData = `M ${this.source.x} ${this.source.y} L ${this.destination.x} ${this.destination.y}`
        } else {
            // Curved connections for data types
            let sourceControl, destControl

            if(settings.droopyCables){
                const dx = Math.abs(this.source.x - this.destination.x)
                const sag = Math.min(80, 15 + dx * 0.15)
                const handle = Math.min(120, dx * 0.4)
                sourceControl = {x: this.source.x + handle, y: this.source.y + sag}
                destControl = {x: this.destination.x - handle, y: this.destination.y + sag}
            } else {
                // Original straight S-curve
                sourceControl = {x: this.source.x + 80, y: this.source.y}
                destControl = {x: this.destination.x - 80, y: this.destination.y}
            }

            pathData = `M ${this.source.x} ${this.source.y} C ${sourceControl.x} ${sourceControl.y}, ${destControl.x} ${destControl.y}, ${this.destination.x} ${this.destination.y}`
        }

        // Create solid colored wire + optional black dashed shadow layer
        const strokeColor = settings.phiSpacedWires ? this.color : null
        const strokeAttr = strokeColor ? `stroke="${strokeColor}"` : ''
        let result = `<path d="${pathData}" class="connection-path ${this.type}" ${strokeAttr}></path>`

        if(settings.stripedWires && this.type !== 'action') {
            result += `<path d="${pathData}" class="connection-path connection-shadow" stroke="#000"></path>`
        }

        return result

    }

}

/**
 * Hides or shows ports based on what would create a graph cycle.
 * This version is much more accurate than the last.
 * @param {object} startPort The port the user is dragging from.
 * @param {boolean} shouldHide True to hide illegal ports, false to show all.
 */
function managePortVisibility(startPort, shouldHide){
    if(!shouldHide){
        // Un-hide all ports and exit
        document.querySelectorAll('#node-root .port.hidden').forEach(p => p.classList.remove('hidden'))
        SNode.rootDIV.classList.remove('is-connecting')
        return
    }

    SNode.rootDIV.classList.add('is-connecting')

    const startNode = startPort.parent
    const isDraggingFromOutput = startPort.portType === 'output'

    // Pre-calculate the "tainted" sets based on the start node.
    const ancestors = getAncestors(startNode)
    ancestors.add(startNode) // Add self to prevent self-connection

    const descendants = getDescendants(startNode)
    descendants.add(startNode) // Add self

    // Iterate over every node and every port to determine its validity
    for(const targetNode of SNode.nodes){
        // Check targetNode's INPUT ports
        for(const key in targetNode.input){
            const targetPort = targetNode.input[key]
            const portEl = targetPort.portEl
            if(!portEl){continue}

            let isIllegal = true // Assume illegal by default, prove legality
            let isConvertible = false // Can be connected with type conversion
            
            if(isDraggingFromOutput){
                // DRAGGING FROM AN OUTPUT
                if(startPort.type === 'action'){
                    // Action ports can connect to any other action input port on another node.
                    isIllegal = !(targetPort.type === 'action' && targetNode !== startNode)
                } else {
                    // Data ports - check for direct match first
                    if(targetPort.type === startPort.type && !ancestors.has(targetNode)){
                        isIllegal = false
                    }
                    // Check for convertible types
                    else if(canConvert(startPort.type, targetPort.type) && !ancestors.has(targetNode)){
                        isIllegal = false
                        isConvertible = true
                    }
                }
                if(startNode.slug === 'output' && targetNode !== startNode){isIllegal = false}
            } else {
                // Dragging FROM AN INPUT, this port must be a valid output target.
                // Action inputs can't start a connection drag (only outputs can trigger).
                isIllegal = true
            }
            
            portEl.classList.toggle('hidden', isIllegal)
            portEl.classList.toggle('convertible', isConvertible)
        }

        // Check targetNode's OUTPUT ports
        for(const key in targetNode.output){
            const targetPort = targetNode.output[key]
            const portEl = targetPort.portEl
            if(!portEl){continue}

            let isIllegal = true // Assume illegal by default, prove legality
            let isConvertible = false // Can be connected with type conversion
            
            if(!isDraggingFromOutput){
                // DRAGGING FROM AN INPUT
                if(startPort.type === 'action'){
                    // An action input is looking for an action output on another node.
                    isIllegal = !(targetPort.type === 'action' && targetNode !== startNode)
                } else {
                    // Data ports - check for direct match first
                    if(targetPort.type === startPort.type && !descendants.has(targetNode)){
                        isIllegal = false
                    }
                    // Check for convertible types
                    else if(canConvert(targetPort.type, startPort.type) && !descendants.has(targetNode)){
                        isIllegal = false
                        isConvertible = true
                    }
                }
                if(targetNode.slug === 'output'){isIllegal = false}
            } else {
                isIllegal = true
            }
            
            portEl.classList.toggle('hidden', isIllegal)
            portEl.classList.toggle('convertible', isConvertible)
        }
    }
}

/**
 * Finds all ancestor nodes (upstream) for a given start node.
 * @param {SNode} startNode The node to start traversal from.
 * @returns {Set<SNode>} A set of all ancestor nodes.
 */
function getAncestors(startNode){
    const ancestors = new Set()
    const queue = [startNode]
    const visited = new Set([startNode])

    while(queue.length > 0){
        const currentNode = queue.shift()
        Object.values(currentNode.input).forEach(inputPort => {
            if(inputPort.connection){
                const parentNode = inputPort.connection.parent
                if(parentNode.slug === 'output'){return}
                if(!visited.has(parentNode)){
                    visited.add(parentNode)
                    ancestors.add(parentNode)
                    queue.push(parentNode)
                }
            }
        })
    }
    return ancestors
}