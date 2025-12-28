import {autowire, mapJoin, StringToFragment} from './utils.js'
import {nodeList} from './registry.js'
import {Connection, CursorWire} from './connections.js'
import {updateCropButtonState} from './editor.js'
import {midiManager} from './midiManager.js'
import {settings} from './settings.js'

const editor = document.getElementById('editor')
export class SNode{
    static nextID = 0
    static nextZIndex = 10 // Start z-index from 10 to be safe
    static nodes = new Set()
    static outputs = new Set()
    static rootDIV
    static currentWorkspace = 1

    static {
        this.rootDIV = document.getElementById('node-root')
    }


    static refreshDownstreamOutputs(startNode){
        // Find all nodes that are downstream from the changed node
        const descendants = getDescendants(startNode)

        // Include the start node itself in case an option on an output node is changed
        descendants.add(startNode)

        // Find which of these descendants are actual Output nodes
        const affectedOutputs = new Set()
        for(const node of descendants){
            if(SNode.outputs.has(node)){
                affectedOutputs.add(node)
            }
        }

        // Also check if the start node itself is an output node
        if(SNode.outputs.has(startNode)){
            affectedOutputs.add(startNode)
        }

        // Trigger recompile on each affected output node
        for(const outputNode of affectedOutputs){
            if(typeof outputNode.recompile === 'function'){
                console.log(`Auto-recompiling Output ${outputNode.id} due to upstream change.`)
                outputNode.recompile()
            }
        }
    }

    static setCurrentWorkspace(workspace) {
        this.currentWorkspace = workspace
        this.updateWorkspaceVisibility()
    }

    static updateWorkspaceVisibility() {
        for(const node of this.nodes) {
            if(node.workspace === this.currentWorkspace) {
                node.nodeEl.style.display = 'block'
            } else {
                node.nodeEl.style.display = 'none'
            }
        }

        // Update workspace width to fit current workspace nodes
        // Use requestAnimationFrame to ensure DOM updates are processed
        requestAnimationFrame(() => {
            this.recalculateWorkspaceWidth()

            // Update connection visibility based on current workspace
            Connection.updateConnectionVisibility()
            Connection.redrawAllConnections()
        })
    }

    static getNodesInCurrentWorkspace() {
        return [...this.nodes].filter(node => node.workspace === this.currentWorkspace)
    }

    static getOutputsInCurrentWorkspace() {
        return [...this.outputs].filter(node => node.workspace === this.currentWorkspace)
    }

    static recalculateWorkspaceWidth() {
        // Calculate the rightmost edge of nodes in current workspace
        let rightmostEdge = 0
        const currentWorkspaceNodes = this.getNodesInCurrentWorkspace()

        for(const node of currentWorkspaceNodes) {
            const nodeRight = parseInt(node.nodeEl.style.left) + node.nodeEl.offsetWidth
            if(nodeRight > rightmostEdge) {
                rightmostEdge = nodeRight
            }
        }

        // Set minimum width to editor width or rightmost node + padding
        const editor = document.getElementById('editor')
        const editorWidth = editor.getBoundingClientRect().width
        const minWidth = Math.max(editorWidth, rightmostEdge + 20)

        // Update workspace width
        const nodeRoot = document.getElementById('node-root')
        nodeRoot.style.width = `${minWidth}px`

        // Update crop button state since workspace size changed
        updateCropButtonState()
    }

    id
    nodeEl
    isDestroyed
    workspace

    constructor(slug, X, Y, nodeData = null){
        Object.assign(this, nodeList[slug].create())

        for(const key in this){
            // Bind functions defined directly on node definition
            if(Object.hasOwn(this, key) && typeof this[key] === 'function'){
                // Replace function with bound version
                this[key] = this[key].bind(this)
            }
        }

        this.id = SNode.nextID++
        this.isDestroyed = false
        this.collapsed = false
        this.workspace = SNode.currentWorkspace

        // Bind methods to `this` and set up port metadata
        mapJoin(this.output, (output, key) => {
            output.portType = 'output'
            output.parent = this
            output.key = key
            if(output.type !== 'action'){
                output.funcName = `${this.slug}${this.id}_${key}`
                if(output.genCode){output.genCode = output.genCode.bind(this)}
                if(output.textureUniformUpdate){output.textureUniformUpdate = output.textureUniformUpdate.bind(this)}
                if(output.floatUniformUpdate){
                    output.floatUniformUpdate = output.floatUniformUpdate.bind(this)
                }
                if(output.colorUniformUpdate){
                    output.colorUniformUpdate = output.colorUniformUpdate.bind(this)
                }
            }
        })
        mapJoin(this.input, (input, key) => {
            input.parent = this
            input.portType = 'input'
            input.key = key
            if(input.type === 'action'){
                // Bind both callback types - maintain backwards compatibility
                if(input.callback){input.callback = input.callback.bind(this)}
                if(input.downCallback){input.downCallback = input.downCallback.bind(this)}
                if(input.upCallback){input.upCallback = input.upCallback.bind(this)}
            } else {
                input.get = (cc, uv) => this.getInput(key, cc, uv)
            }
        })

        // Initialize options with defaults
        this.optionValues = {}
        if(this.options){
            const definitions = this.options
            this.options = {...definitions} // Copy definitions
            Object.keys(definitions).forEach(key => {
                this.optionValues[key] = definitions[key].default
            })
        }

        // Preserve original defaults before patch merge
        if(this.values){
            this.defaults = {...this.values}
        }

        // Merge patch data values over defaults (required before createElement/onCreate)
        if(nodeData?.values && this.values){
            Object.assign(this.values, nodeData.values)
        }
        
        // Restore collapsed state from patch data
        if(nodeData?.collapsed){
            this.collapsed = nodeData.collapsed
        }

        // Create the node's DOM elements
        this.createElement(X, Y, nodeData)
        SNode.nodes.add(this)
        window.markDirty()
        
        // Cache port DOM elements for performance
        mapJoin(this.output, (output, key) => {
            output.portEl = this.nodeEl.querySelector(`[data-out-port="${key}"]`)
        })
        mapJoin(this.input, (input, key) => {
            input.portEl = this.nodeEl.querySelector(`[data-in-port="${key}"]`)
        })
        
        // Bring new node to front
        this.nodeEl.style.zIndex = ++SNode.nextZIndex

        // Defer right-edge clamping and UI state updates
        requestAnimationFrame(() => {
            const nodeWidth = this.nodeEl.offsetWidth
            const nodeRootWidth = SNode.rootDIV.offsetWidth
            if(this.nodeEl.offsetLeft + nodeWidth > nodeRootWidth){
                this.nodeEl.style.left = `${nodeRootWidth - nodeWidth}px`
                this.updatePortPoints()
                Connection.redrawAllConnections()
            }
            // After creating a node, the min width might have changed.
            updateCropButtonState()
        })

        // Hydrate the option data if provided, floats done inline in createElement
        if(nodeData){
            // Restore option controls
            if(nodeData.optionValues && this.optionValues){
                Object.entries(nodeData.optionValues).forEach(([key, value]) => {
                    this.optionValues[key] = value
                    const optionEl = this.nodeEl.querySelector(`[data-option-el="${key}"]`)
                    if(optionEl){
                        optionEl.value = value
                    }
                })
            }
        }

        setTimeout(this.updatePortPoints, 1)
        
        // Restore MIDI mappings from patch data if available
        if(nodeData?.midiMappings){
            setTimeout(() => {
                Object.entries(nodeData.midiMappings).forEach(([key, mapping]) => {
                    const controlEl = this.nodeEl.querySelector(`[data-input-el="${key}"]`)
                    if(controlEl){
                        if(mapping.type === 'cc'){
                            midiManager.restoreCCMapping(controlEl, mapping.value)
                        } else if(mapping.type === 'note'){
                            midiManager.restoreNoteMapping(controlEl, mapping.value)
                        }
                    }
                })
            }, 10)
        }

        // Call lifecycle hook if available (will run for both new and patched nodes)
        if(this.onCreate){
            this.onCreate()
        }

        // Restore custom control ranges (min/max/step) AND values for custom nodes.
        // This happens AFTER onCreate so the elements exist.
        // Critical: The element might have rounded the value during creation because
        // the default step wasn't precise enough. Now we fix the step then restore the value.
        if(nodeData?.customControlRanges){
            Object.entries(nodeData.customControlRanges).forEach(([key, ranges]) => {
                const el = this.nodeEl.querySelector(`.node-custom [data-el="${key}"]`)
                if(el && el.tagName === 'S-NUMBER'){
                    // First update the constraints
                    if(ranges.min !== undefined) el.setAttribute('min', ranges.min)
                    if(ranges.max !== undefined) el.setAttribute('max', ranges.max)
                    if(ranges.step !== undefined) el.setAttribute('step', ranges.step)

                    // Then restore the value - this re-validates against correct step
                    if(ranges.value !== undefined){
                        el.value = ranges.value
                    }
                }
            })
        }
    }

    /**
     * Triggers an output action, calling the callbacks of all connected input actions.
     * @param {string} outputKey The key of the output action port to trigger.
     * @param {string} eventType 'down' or 'up' to trigger downCallback or upCallback
     */
    triggerAction(outputKey, eventType = 'down'){
        if(!this.output[outputKey] || this.output[outputKey].type !== 'action'){return}

        for(const connection of Connection.connections){
            if(connection.source.parent === this && connection.source.key === outputKey){
                if(eventType === 'down'){
                    // Try downCallback first, fallback to callback for backwards compatibility
                    const cb = connection.destination.downCallback || connection.destination.callback
                    cb?.()
                } else if(eventType === 'up'){
                    connection.destination.upCallback?.()
                }
            }
        }
    }

    getOption(key){
        return this.optionValues[key]
    }

    getInput(inKey, cc, uv = 'uv'){
        const input = this.input[inKey]

        if(input.connection){
            const sourcePort = input.connection

            if(cc.visited.has(sourcePort.funcName)){
                return `${sourcePort.funcName}(${uv})`
            }

            if(sourcePort.parent.shaderUtils){
                sourcePort.parent.shaderUtils.forEach(util => cc.utils.add(util))
            }

            let generatedCode
            if(sourcePort.textureUniformUpdate){
                const texID = sourcePort.parent.id
                const texSlug = sourcePort.parent.slug
                const texPort = sourcePort.key
                const uniformName = `u_texture_${texSlug}${texID}_${texPort}`
                cc.uniforms.set(uniformName, {
                    type: 'sampler2D',
                    sourcePort
                })
                generatedCode = sourcePort.genCode(cc, sourcePort.funcName, uniformName)
            } else if(sourcePort.floatUniformUpdate){
                const uniformName = `u_float_${sourcePort.parent.slug}${sourcePort.parent.id}_${sourcePort.key}`

                cc.uniforms.set(uniformName, {
                    type: 'float',
                    sourcePort
                })
                generatedCode = sourcePort.genCode(cc, sourcePort.funcName, uniformName)
            } else if(sourcePort.colorUniformUpdate){
                const uniformName = `u_color_${sourcePort.parent.slug}${sourcePort.parent.id}_${sourcePort.key}`

                cc.uniforms.set(uniformName, {
                    type: 'vec4',
                    sourcePort
                })
                generatedCode = sourcePort.genCode(cc, sourcePort.funcName, uniformName)
            } else {
                generatedCode = sourcePort.genCode(cc, sourcePort.funcName)
            }

            cc.visited.add(sourcePort.funcName)
            cc.functions.add(generatedCode)

            return `${sourcePort.funcName}(${uv})`

        }
        // =========================================================
        // LOGIC FOR UNCONNECTED CONTROLS
        // =========================================================
        const controlEl = this.nodeEl.querySelector(`[data-input-el="${inKey}"]`)

        // If there's a control (like s-number or s-color), make it a uniform.
        if(controlEl){
            const uniformName = `u_control_${this.slug}${this.id}_${inKey}`
            if(!cc.uniforms.has(uniformName)){
                const uniformType = input.type === 'float' ? 'float' : 'vec4'
                cc.uniforms.set(uniformName, {
                    type: uniformType,
                    sourceControl: controlEl
                })
            }
            return uniformName
        }

        // If there is NO control, provide a fallback.
        if(input.type === 'color'){
            // For color inputs without controls (like on Rotate, Zoom),
            // default to the generative UV map, passing the current UV coordinate.
            return `defaultUvMap(${uv})`
        }
        // For floats without controls, fallback to a default number.
        return '0.0'

    }

    updatePortPoints = () => {
        if(!this.nodeEl || !this.nodeEl.isConnected || this.isDestroyed) return

        const editorRect = editor.getBoundingClientRect()
        
        // Skip update if getBoundingClientRect returns invalid data (common during window minimize/maximize on macOS)
        if(!editorRect || editorRect.width <= 0 || editorRect.height <= 0) return
        
        if(this.collapsed){
            const header = this.nodeEl.querySelector('.node-header')
            if(header){
                const headerRect = header.getBoundingClientRect()
                if(!headerRect || headerRect.width <= 0 || headerRect.height <= 0) return
                
                const headerY = (headerRect.top + headerRect.bottom) / 2 - editorRect.top + editor.scrollTop
                const xBase = headerRect.left - editorRect.left + editor.scrollLeft

                Object.values(this.input).forEach(input => {
                    input.x = xBase
                    input.y = headerY
                })
                Object.values(this.output).forEach(output => {
                    output.x = xBase + headerRect.width
                    output.y = headerY
                })
            }
        } else {
            mapJoin(this.output, (output, key) => {
                const portEl = output.portEl
                if(portEl){
                    const rect = portEl.getBoundingClientRect()
                    if(rect && rect.width > 0 && rect.height > 0){
                        output.x = (rect.left + rect.right) / 2 - editorRect.left + editor.scrollLeft
                        output.y = (rect.top + rect.bottom) / 2 - editorRect.top + editor.scrollTop
                    }
                }
            })
            mapJoin(this.input, (input, key) => {
                const portEl = input.portEl
                if(portEl){
                    const rect = portEl.getBoundingClientRect()
                    if(rect && rect.width > 0 && rect.height > 0){
                        input.x = (rect.left + rect.right) / 2 - editorRect.left + editor.scrollLeft
                        input.y = (rect.top + rect.bottom) / 2 - editorRect.top + editor.scrollTop
                    }
                }
            })
        }
    }

    destroyAllConnections(){
        const downstreamNodesToNotify = new Set()

        const connectionsToRemove = [...Connection.connections].filter(connection => {
            // If this node is the source, the destination needs to be notified.
            if(connection.source.parent === this){
                downstreamNodesToNotify.add(connection.destination.parent)
                return true
            }
            // If this node is the destination, we just remove the connection.
            if(connection.destination.parent === this){
                return true
            }
            return false
        })

        connectionsToRemove.forEach(connection => {
            // Re-enable the control of the downstream node
            connection.destination.parent.setControlDisabled(connection.destination.key, false)

            // Clear port border colors
            Connection.clearPortColor(connection.source.portEl)
            Connection.clearPortColor(connection.destination.portEl)

            connection.destination.connection = null
            Connection.connections.delete(connection)
        })

        // Now that connections are severed, tell the affected downstream nodes to update.
        downstreamNodesToNotify.forEach(node => SNode.refreshDownstreamOutputs(node))

        Connection.redrawAllConnections()
    }

    clearPort(e){
        e.preventDefault()
        e.stopPropagation()

        const {portObj} = e.currentTarget // Use currentTarget to get the element the listener is attached to
        let nodeToNotify = null

        const connectionsToRemove = [...Connection.connections].filter(connection => {
            if(connection.destination === portObj){
                // If we are clearing an input port, this is the node to notify.
                nodeToNotify = connection.destination.parent
                return true
            }
            if(connection.source === portObj){
                // If we are clearing an output port, the connected input node is the one to notify.
                nodeToNotify = connection.destination.parent
                return true
            }
            return false
        })

        // For actions, which can have multiple connections from one output port,
        // we need to find all of them.
        if(portObj.type === 'action' && portObj.portType === 'output'){
            const actionConnections = [...Connection.connections].filter(c => c.source === portObj)
            connectionsToRemove.push(...actionConnections)
            // Notify all destination nodes
            actionConnections.forEach(c => nodeToNotify = c.destination.parent)
        }

        if(connectionsToRemove.length > 0){
            connectionsToRemove.forEach(connection => {
                // Re-enable the control for the cleared port's connection
                connection.destination.parent.setControlDisabled(connection.destination.key, false)

                // Clear port border colors
                Connection.clearPortColor(connection.source.portEl)
                Connection.clearPortColor(connection.destination.portEl)

                connection.destination.connection = null
                Connection.connections.delete(connection)
            })

            // Clear any hover highlights before redrawing
            this.unhighlightPortConnections()

            Connection.redrawAllConnections()

            // Notify the single affected node.
            if(nodeToNotify){
                SNode.refreshDownstreamOutputs(nodeToNotify)
            }
        }
    }

    setControlDisabled(inputKey, isDisabled){
        // Only proceed if the input is defined to have a control in the first place
        if(this.input[inputKey]?.control){
            const controlEl = this.nodeEl.querySelector(`[data-input-el="${inputKey}"]`)
            if(controlEl){
                controlEl.disabled = isDisabled
            }
        }
    }

    destroy(){
        this.isDestroyed = true
        SNode.outputs.forEach(outputNode => {
            outputNode.runtimeState.shaderInfo?.removeUniformProvider(this)
        })

        SNode.refreshDownstreamOutputs(this)
        this.destroyAllConnections()
        this.nodeEl.remove()
        SNode.nodes.delete(this)
        window.markDirty()

        // After removing a node, the min width might have changed
        updateCropButtonState()

        // Call lifecycle hook if available
        if(this.onDestroy){
            this.onDestroy()
        }
    }

    deleteAllConnections(){
        // Find all connections to/from this node
        const connectionsToRemove = [...Connection.connections].filter(connection => {
            return connection.source.parent === this || connection.destination.parent === this
        })

        // Remove each connection
        connectionsToRemove.forEach(connection => {
            // Re-enable controls disconnected from inputs
            connection.destination.parent.setControlDisabled(connection.destination.key, false)
            
            // Clear port border colors
            Connection.clearPortColor(connection.source.portEl)
            Connection.clearPortColor(connection.destination.portEl)
            
            connection.destination.connection = null
            Connection.connections.delete(connection)
        })

        if(connectionsToRemove.length > 0){
            Connection.redrawAllConnections()
            SNode.refreshDownstreamOutputs(this)
        }
    }

    duplicate(){
        // Serialize current node's state
        const controls = {}
        const controlRanges = {}
        Object.entries(this.input).forEach(([key, input]) => {
            if(input.control !== null){
                const controlEl = this.nodeEl.querySelector(`[data-input-el="${key}"]`)
                if(controlEl){
                    controls[key] = controlEl.value
                    
                    // Check if this is an s-number with edited min/max
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

        // Get current position and offset for the duplicate
        const currentX = Number.parseInt(this.nodeEl.style.left, 10)
        const currentY = Number.parseInt(this.nodeEl.style.top, 10)
        const offsetX = 30
        const offsetY = 30

        // Create duplicate node data
        const duplicateData = {
            controls,
            controlRanges,
            optionValues: {...this.optionValues},
            values: this.values ? JSON.parse(JSON.stringify(this.values)) : {} // Deep clone values
        }

        // Create the duplicate node
        const duplicateNode = new SNode(
            this.slug,
            currentX + offsetX,
            currentY + offsetY,
            duplicateData
        )

        // Bring the new node to front
        duplicateNode.nodeEl.style.zIndex = ++SNode.nextZIndex

        return duplicateNode
    }

    resetControls(){
        // Reset all input controls to their default values
        Object.entries(this.input).forEach(([key, input]) => {
            if(input.control !== null && !input.connection){
                const controlEl = this.nodeEl.querySelector(`[data-input-el="${key}"]`)
                if(controlEl){
                    const defaultValue = input.control.default ?? 0
                    controlEl.value = defaultValue
                    
                    // Dispatch change event to update any dependent systems
                    controlEl.dispatchEvent(new Event('change', { bubbles: true }))
                }
            }
        })
        
        // Refresh outputs since control values changed
        SNode.refreshDownstreamOutputs(this)
    }

    clearMidiMappings(){
        // Clear MIDI mappings for all input controls (both float and action types)
        Object.entries(this.input).forEach(([key, input]) => {
            const controlEl = this.nodeEl.querySelector(`[data-input-el="${key}"]`)
            if(controlEl){
                // Remove visual indicators
                controlEl.classList.remove('midi-mapped')
                
                // Clear CC mappings (for s-number controls)
                if(controlEl.dataset.midiCc){
                    const cc = parseInt(controlEl.dataset.midiCc)
                    if(!isNaN(cc) && midiManager.ccMappings.has(cc)){
                        midiManager.ccMappings.get(cc).delete(controlEl)
                    }
                    delete controlEl.dataset.midiCc
                }
                
                // Clear Note mappings (for action buttons)
                if(controlEl.dataset.midiNote){
                    const note = parseInt(controlEl.dataset.midiNote)
                    if(!isNaN(note) && midiManager.noteMappings.has(note)){
                        midiManager.noteMappings.get(note).delete(controlEl)
                    }
                    delete controlEl.dataset.midiNote
                }
                
                // Clear general mapping data
                delete controlEl.dataset.midiMapping
                
                // Remove hover event listeners
                if(controlEl._midiShowTooltip){
                    controlEl.removeEventListener('mouseenter', controlEl._midiShowTooltip)
                    delete controlEl._midiShowTooltip
                }
                if(controlEl._midiHideTooltip){
                    controlEl.removeEventListener('mouseleave', controlEl._midiHideTooltip)
                    delete controlEl._midiHideTooltip
                }
            }
        })
        
        // Clear the midiMappings object stored on the node
        if(this.midiMappings){
            this.midiMappings = {}
        }
    }

    toggleCollapsed(){
        this.collapsed = !this.collapsed
        if(this.collapsed){
            this.nodeEl.classList.add('collapsed')
        } else {
            this.nodeEl.classList.remove('collapsed')
        }
        
        // Immediately recalculate port positions for this node
        this.updatePortPoints()
        
        // Immediately redraw all connections
        Connection.redrawAllConnections()
        
        // Close the context menu if it exists
        const existingMenu = document.getElementById('node-context-menu')
        if(existingMenu){
            existingMenu.remove()
        }
    }

    highlightPortConnections(portEl){
        // Check if glow on hover is enabled
        if(!settings.glowOnHover) return

        const nodeId = parseInt(portEl.dataset.nodeId)
        const portKey = portEl.dataset.portKey
        const portType = portEl.dataset.portType

        // Find all connections involving this port
        const relatedConnections = [...Connection.connections].filter(conn => {
            if(portType === 'input'){
                return conn.destination.parent.id === nodeId && conn.destination.key === portKey
            } else {
                return conn.source.parent.id === nodeId && conn.source.key === portKey
            }
        })

        // Highlight the hovered port
        portEl.classList.add('highlighted')

        // Highlight connections and connected ports
        relatedConnections.forEach(conn => {
            // Build connection ID
            const connectionId = `conn-${conn.source.parent.id}-${conn.source.key}-${conn.destination.parent.id}-${conn.destination.key}`

            // Highlight connection paths
            const pathElements = document.querySelectorAll(`[data-connection-id="${connectionId}"]`)
            pathElements.forEach(path => path.classList.add('highlighted'))

            // Highlight shadow if present
            const shadowElements = document.querySelectorAll(`[data-connection-id="${connectionId}-shadow"]`)
            shadowElements.forEach(shadow => shadow.classList.add('highlighted'))

            // Highlight connected ports
            if(conn.source.portEl){
                conn.source.portEl.classList.add('highlighted')
            }
            if(conn.destination.portEl){
                conn.destination.portEl.classList.add('highlighted')
            }
        })
    }

    unhighlightPortConnections(){
        // Remove all highlights
        document.querySelectorAll('.port.highlighted').forEach(port => {
            port.classList.remove('highlighted')
        })
        document.querySelectorAll('.connection-path.highlighted').forEach(path => {
            path.classList.remove('highlighted')
        })
    }

    showContextMenu(x, y){
        // Remove any existing context menu
        const existingMenu = document.getElementById('node-context-menu')
        if(existingMenu){
            existingMenu.remove()
        }

        // Create context menu
        const menu = document.createElement('div')
        menu.id = 'node-context-menu'
        menu.className = 'node-context-menu'
        menu.style.position = 'fixed'
        menu.style.left = `${x}px`
        menu.style.top = `${y}px`
        menu.style.zIndex = '10000'

        // Add menu items
        const menuItems = [
            {
                label: this.collapsed ? 'Expand' : 'Collapse',
                icon: this.collapsed ? '▼' : '▲',
                action: () => {
                    this.toggleCollapsed()
                    // menu.remove() is now handled inside toggleCollapsed()
                }
            },
            {
                label: 'Delete Connections',
                icon: '✂️',
                action: () => {
                    this.deleteAllConnections()
                    menu.remove()
                }
            },
            {
                label: 'Duplicate',
                icon: '📋',
                action: () => {
                    this.duplicate()
                    menu.remove()
                }
            },
            {
                label: 'Reset Controls',
                icon: '🔄',
                action: () => {
                    this.resetControls()
                    menu.remove()
                }
            },
            {
                label: 'Clear MIDI Mappings',
                icon: '🎹',
                action: () => {
                    this.clearMidiMappings()
                    menu.remove()
                }
            },
            {
                label: 'Delete',
                icon: '🗑️',
                action: () => {
                    this.destroy()
                    menu.remove()
                }
            }
        ]

        menuItems.forEach(item => {
            const menuItem = document.createElement('div')
            menuItem.className = 'context-menu-item'
            menuItem.innerHTML = `<span class="context-menu-icon">${item.icon}</span><span>${item.label}</span>`
            menuItem.addEventListener('click', item.action)
            menu.appendChild(menuItem)
        })

        // Add menu to document
        document.body.appendChild(menu)

        // Close menu when clicking outside
        const closeMenu = (e) => {
            if(!menu.contains(e.target)){
                menu.remove()
                document.removeEventListener('pointerdown', closeMenu)
            }
        }
        setTimeout(() => {
            document.addEventListener('pointerdown', closeMenu)
        }, 0)
    }

    createElement(X, Y, nodeData){
        const html = `
    <div class="node${this.collapsed ? ' collapsed' : ''}" style="top:${Y}px; left:${X}px;" data-el="nodeEl" data-node-id="${this.id}">
        <div class="node-header" data-el="header">
            <div class="node-icon">${this.icon}</div>
            <div class="node-label">${this.label}</div>
            ${this.tooltip ? `<div class="node-tooltip" data-el="tooltipBtn">?</div>` : ''}
            <div class="node-close" data-el="close"></div>
        </div>
        <div class="node-inputs">
            ${mapJoin(this.input, (input, key) => {
        // --- Conditional rendering for action controls ---
        if(input.type === 'action' && input.control){
            return `
                    <div class="node-input action-control-row">
                        <div class="port ${input.type}" data-in-port="${key}"></div>
                        <button class="action-control-button" data-input-el="${key}">${input.label}</button>
                    </div>`
        }
        // --- Original rendering for data controls ---
        return `
                <div class="node-input">
                    <div class="port ${input.type}" data-in-port="${key}"></div>
                    <div class="input-label">
                        <span>${input.label}</span>
                        ${(input.type === 'float' && input.range) ? `<span class="input-range">${input.range}</span>` : ''}
                    </div>
                    ${!input.control ? '' : `
                    <div class="input-control">
                        ${input.type === 'float' ?
        `<s-number 
                            min="${nodeData?.controlRanges?.[key]?.min ?? input.control.min}" 
                            max="${nodeData?.controlRanges?.[key]?.max ?? input.control.max}" 
                            step="${nodeData?.controlRanges?.[key]?.step ?? input.control.step}" 
                            value="${nodeData?.controls[key] !== undefined ? nodeData.controls[key] : input.control.default}"
                            default="${input.control.default}"
                            ${input.control.unit ? `unit="${input.control.unit}"` : ``} 
                            ${input.control.logScale ? `log-scale` : ``}
                            data-input-el="${key}">
                         </s-number>`
        :
        `<s-color
                            value="${nodeData?.controls[key] !== undefined ? nodeData.controls[key] : input.control.default}"
                            data-input-el="${key}">
                         </s-color>`
}
                    </div>`}
                </div>`
    })}
        </div>
        <hr />
        <div class="node-outputs">
        ${mapJoin(this.output, (output, key) =>
        `<div class="node-output">
                <div class="output-label">
                    <span>${output.label}</span>
                    ${(output.type === 'float' && output.range) ? `<span class="output-range">${output.range}</span>` : ''}
                </div>
                <div class="port ${output.type}" data-out-port="${key}"></div>
            </div>`
    )}
        </div>
        ${this.options ? `
        <hr />
        <div class="node-options">
            ${mapJoin(this.options, (option, key) => {
        if(typeof option === 'function'){return ''} // Filter out the 'get' helper
        return `
                <div class="node-option">
                    <div class="option-label">${option.label}</div>
                    <div class="option-control">
                        ${option.type === 'select' ?
        `<select data-option-el="${key}">
                            ${mapJoin(option.choices, choice => `<option value="${choice.value}">${choice.name}</option>`)}
                        </select>`
        : ''}
                    </div>
                </div>`
    })}
        </div>` : ''}
        <div class="node-custom" data-el="customArea">
        </div>
    </div>
    `
        const content = StringToFragment(html)
        const {nodeEl, header, close, customArea, tooltipBtn} = autowire(content)
        const inputPorts = autowire(content, 'data-in-port')
        const outputPorts = autowire(content, 'data-out-port')
        const optionControls = autowire(content, 'data-option-el')

        this.nodeEl = nodeEl
        this.customArea = customArea

        close.addEventListener('click', () => {
            this.destroy()
        })

        // Add tooltip functionality to tooltip button if it exists
        if (tooltipBtn && this.tooltip) {
            let nodeTooltipEl = null
            let nodeTooltipTimeout = null
            
            tooltipBtn.addEventListener('mouseenter', (e) => {
                // Clean up any existing tooltip first
                if (nodeTooltipEl) {
                    nodeTooltipEl.remove()
                    nodeTooltipEl = null
                }
                if (nodeTooltipTimeout) {
                    clearTimeout(nodeTooltipTimeout)
                    nodeTooltipTimeout = null
                }
                
                // Create tooltip element
                nodeTooltipEl = document.createElement('div')
                nodeTooltipEl.className = 'menu-tooltip'
                nodeTooltipEl.textContent = this.tooltip
                document.body.appendChild(nodeTooltipEl)
                
                // Position tooltip
                const rect = tooltipBtn.getBoundingClientRect()
                const tooltipRect = nodeTooltipEl.getBoundingClientRect()
                
                let left = rect.right + 10
                let top = rect.top
                
                // Keep tooltip in viewport
                if (left + tooltipRect.width > window.innerWidth) {
                    left = rect.left - tooltipRect.width - 10
                }
                if (top + tooltipRect.height > window.innerHeight) {
                    top = window.innerHeight - tooltipRect.height - 10
                }
                
                nodeTooltipEl.style.left = `${left}px`
                nodeTooltipEl.style.top = `${top}px`
                
                // Show tooltip after brief delay
                nodeTooltipTimeout = setTimeout(() => {
                    if (nodeTooltipEl) {
                        nodeTooltipEl.classList.add('visible')
                    }
                    nodeTooltipTimeout = null
                }, 200)
            })
            
            tooltipBtn.addEventListener('mouseleave', (e) => {
                if (nodeTooltipTimeout) {
                    clearTimeout(nodeTooltipTimeout)
                    nodeTooltipTimeout = null
                }
                if (nodeTooltipEl) {
                    nodeTooltipEl.remove()
                    nodeTooltipEl = null
                }
            })
        }

        // Context menu for header (right-click)
        header.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()
            this.showContextMenu(e.clientX, e.clientY)
        })

        this.nodeEl.addEventListener('pointerdown', e => {
            if(close.contains(e.target)){return}
            if(e.target.closest('.input-control') || e.target.closest('.action-control-button')){return}
            if(e.target.closest('.option-control')){return}
            if(e.target.closest('.node-custom')){return}
            if(e.target.closest('.node-show-bg')){return}

            // Replace the re-append hack with a z-index update.
            this.nodeEl.style.zIndex = SNode.nextZIndex++

            if(header.contains(e.target)){
                e.preventDefault() // Prevent text selection during drag
                this.nodeEl.classList.add('dragging')
                
                // Store initial position for escape cancellation
                const initialLeft = parseFloat(this.nodeEl.style.left)
                const initialTop = parseFloat(this.nodeEl.style.top)
                
                // Store initial scroll position for scroll-aware dragging
                let lastScrollLeft = editor.scrollLeft
                let lastScrollTop = editor.scrollTop

                const moveNode = e2 => {
                    const currentLeft = parseFloat(this.nodeEl.style.left)
                    const currentTop = parseFloat(this.nodeEl.style.top)
                    
                    // Calculate scroll delta since last frame
                    const currentScrollLeft = editor.scrollLeft
                    const currentScrollTop = editor.scrollTop
                    const scrollDeltaX = currentScrollLeft - lastScrollLeft
                    const scrollDeltaY = currentScrollTop - lastScrollTop
                    
                    // Apply movement with scroll compensation (ADD scroll delta to keep node under cursor)
                    let newLeft = currentLeft + e2.movementX + scrollDeltaX
                    let newTop = currentTop + e2.movementY + scrollDeltaY
                    
                    // Update scroll tracking
                    lastScrollLeft = currentScrollLeft
                    lastScrollTop = currentScrollTop

                    const nodeWidth = this.nodeEl.offsetWidth
                    const nodeHeight = this.nodeEl.offsetHeight

                    // Boundaries of the parent container (#node-root)
                    const maxX = SNode.rootDIV.offsetWidth - (nodeWidth + 20)
                    const maxY = SNode.rootDIV.offsetHeight - nodeHeight

                    // Clamp position
                    newLeft = Math.max(10, Math.min(newLeft, maxX))
                    newTop = Math.max(0, Math.min(newTop, maxY))

                    this.nodeEl.style.left = `${newLeft}px`
                    this.nodeEl.style.top = `${newTop}px`
                    this.updatePortPoints()
                    Connection.redrawAllConnections()
                }

                const stopMove = () => {
                    this.nodeEl.classList.remove('dragging')
                    document.removeEventListener('pointermove', moveNode)
                    document.removeEventListener('escape-pressed', cancelMove)
                    document.removeEventListener('p-key-pressed', putDown)
                    // When movement stops, update the crop button state
                    updateCropButtonState()
                    window.markDirty()
                }
                
                const cancelMove = () => {
                    // Restore initial position
                    this.nodeEl.style.left = `${initialLeft}px`
                    this.nodeEl.style.top = `${initialTop}px`
                    this.updatePortPoints()
                    Connection.redrawAllConnections()
                    stopMove()
                }
                
                const putDown = () => {
                    // Drop node in-place without restoring position
                    stopMove()
                }

                document.addEventListener('pointermove', moveNode)
                document.addEventListener('pointerup', stopMove, {once: true})
                document.addEventListener('escape-pressed', cancelMove)
                document.addEventListener('p-key-pressed', putDown)
            }
        })

        // --- Attach listeners to action control buttons ---
        this.nodeEl.querySelectorAll('button[data-input-el]').forEach(button => {
            const key = button.dataset.inputEl
            const inputPort = this.input[key]
            if(inputPort && inputPort.type === 'action'){
                // Support both new down/up callbacks and legacy callback
                if(inputPort.downCallback || inputPort.upCallback){
                    // Mark button as having down/up callbacks for MIDI handling
                    button._hasDownUpCallbacks = true
                    
                    // New style - separate down/up events
                    button.addEventListener('pointerdown', (e) => {
                        if(e.altKey){
                            e.preventDefault()
                            // Alt+click for MIDI learn or unmap
                            if(button.classList.contains('midi-mapped')){
                                midiManager.unmapElement(button, 'note')
                            } else {
                                midiManager.startLearning(button, 'note')
                            }
                        } else {
                            // Call downCallback or fallback to callback for backwards compat
                            const cb = inputPort.downCallback || inputPort.callback
                            cb?.()
                        }
                    })
                    
                    if(inputPort.upCallback){
                        button.addEventListener('pointerup', (e) => {
                            if(!e.altKey){
                                inputPort.upCallback()
                            }
                        })
                    }
                } else if(inputPort.callback){
                    // Legacy style - click event
                    button.addEventListener('click', (e) => {
                        if(e.altKey){
                            e.preventDefault()
                            // If already mapped, unmap it
                            if(button.classList.contains('midi-mapped')){
                                midiManager.unmapElement(button, 'note')
                            } else {
                                midiManager.startLearning(button, 'note')
                            }
                        } else {
                            inputPort.callback()
                        }
                    })
                }
            }
        })

        mapJoin(inputPorts, (inputPort) => {
            inputPort.style.cursor = 'grab'
            inputPort.portObj = this.input[inputPort.dataset.inPort]

            // Add data attributes for connection highlighting
            inputPort.dataset.nodeId = this.id
            inputPort.dataset.portKey = inputPort.dataset.inPort
            inputPort.dataset.portType = 'input'

            inputPort.addEventListener('pointerdown', e => {
                if(e.button !== 0){return}
                e.preventDefault() // Prevent text selection during wire drag
                new CursorWire(inputPort.portObj, e)
            })
            inputPort.addEventListener('contextmenu', e => this.clearPort(e))

            // Hover highlighting for connections
            inputPort.addEventListener('mouseenter', () => this.highlightPortConnections(inputPort))
            inputPort.addEventListener('mouseleave', () => this.unhighlightPortConnections())
        })

        mapJoin(outputPorts, (outputPort) => {
            outputPort.style.cursor = 'grab'
            outputPort.portObj = this.output[outputPort.dataset.outPort]

            // Add data attributes for connection highlighting
            outputPort.dataset.nodeId = this.id
            outputPort.dataset.portKey = outputPort.dataset.outPort
            outputPort.dataset.portType = 'output'

            outputPort.addEventListener('pointerdown', e => {
                if(e.button !== 0){return}
                e.preventDefault() // Prevent text selection during wire drag
                new CursorWire(outputPort.portObj, e)
            })
            outputPort.addEventListener('contextmenu', e => this.clearPort(e))

            // Hover highlighting for connections
            outputPort.addEventListener('mouseenter', () => this.highlightPortConnections(outputPort))
            outputPort.addEventListener('mouseleave', () => this.unhighlightPortConnections())
        })

        mapJoin(optionControls, (control, key) => {
            control.value = this.optionValues[key]
            control.addEventListener('change', (e) => {
                const def = this.options[key].default
                this.optionValues[key] = typeof def === 'number'
                    ? Number(e.target.value)
                    : e.target.value
                SNode.refreshDownstreamOutputs(this)
            })
        })

        document.getElementById('node-root').appendChild(content)
    }
}

/**
 * Finds all descendant nodes (downstream) for a given start node.
 * @param {SNode} startNode The node to start traversal from.
 * @returns {Set<SNode>} A set of all descendant nodes.
 */
export function getDescendants(startNode){
    const descendants = new Set()
    const queue = [startNode]
    const visited = new Set([startNode])

    while(queue.length > 0){
        const currentNode = queue.shift()
        Object.values(currentNode.output).forEach(outputPort => {
            for(const connection of Connection.connections){
                if(connection.source === outputPort){
                    const childNode = connection.destination.parent
                    if(!visited.has(childNode)){
                        visited.add(childNode)
                        descendants.add(childNode)
                        queue.push(childNode)
                    }
                }
            }
        })
    }
    return descendants
}