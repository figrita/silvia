// typeConversions.js - Handles automatic type conversion between incompatible ports

import {SNode} from './snode.js'
import {Connection} from './connections.js'

// Define available conversions between types
export const conversions = {
    // Color to Float conversions
    'color-to-float': [
        {
            label: 'Luminosity',
            icon: '🕯️',
            createConverter: (sourcePort, targetPort) => {
                return createAndConnectNode('luminosity', sourcePort, targetPort, 'output')
            }
        },
        {
            label: 'Lightness',
            icon: '💡',
            createConverter: (sourcePort, targetPort) => {
                return createAndConnectNode('lightness', sourcePort, targetPort, 'output')
            }
        },
        {
            label: 'Hue',
            icon: '🎨',
            createConverter: (sourcePort, targetPort) => {
                return createAndConnectNode('hue', sourcePort, targetPort, 'output')
            }
        },
        {
            label: 'Saturation',
            icon: '🌈',
            createConverter: (sourcePort, targetPort) => {
                return createAndConnectNode('saturation', sourcePort, targetPort, 'output')
            }
        },
        {
            label: 'Red Channel',
            icon: '🔴',
            createConverter: (sourcePort, targetPort) => {
                return createAndConnectNode('channelsplitter', sourcePort, targetPort, 'r')
            }
        },
        {
            label: 'Green Channel',
            icon: '🟢',
            createConverter: (sourcePort, targetPort) => {
                return createAndConnectNode('channelsplitter', sourcePort, targetPort, 'g')
            }
        },
        {
            label: 'Blue Channel',
            icon: '🔵',
            createConverter: (sourcePort, targetPort) => {
                return createAndConnectNode('channelsplitter', sourcePort, targetPort, 'b')
            }
        },
        {
            label: 'Alpha Channel',
            icon: '🌫️',
            createConverter: (sourcePort, targetPort) => {
                return createAndConnectNode('channelsplitter', sourcePort, targetPort, 'a')
            }
        }
    ],
    
    // Float to Color conversions
    'float-to-color': [
        {
            label: 'Greyscale',
            icon: '⬜',
            createConverter: (sourcePort, targetPort) => {
                const combiner = createConverterNode('rgba', sourcePort, targetPort)
                // Connect the float to R, G, B inputs (not alpha)
                new Connection(sourcePort, combiner.input['r'])
                new Connection(sourcePort, combiner.input['g'])
                new Connection(sourcePort, combiner.input['b'])
                new Connection(combiner.output['output'], targetPort)
                return combiner
            }
        },
        {
            label: 'Red Only',
            icon: '🔴',
            createConverter: (sourcePort, targetPort) => {
                const combiner = createConverterNode('rgba', sourcePort, targetPort)
                new Connection(sourcePort, combiner.input['r'])
                new Connection(combiner.output['output'], targetPort)
                return combiner
            }
        },
        {
            label: 'Green Only',
            icon: '🟢',
            createConverter: (sourcePort, targetPort) => {
                const combiner = createConverterNode('rgba', sourcePort, targetPort)
                new Connection(sourcePort, combiner.input['g'])
                new Connection(combiner.output['output'], targetPort)
                return combiner
            }
        },
        {
            label: 'Blue Only',
            icon: '🔵',
            createConverter: (sourcePort, targetPort) => {
                const combiner = createConverterNode('rgba', sourcePort, targetPort)
                new Connection(sourcePort, combiner.input['b'])
                new Connection(combiner.output['output'], targetPort)
                return combiner
            }
        }
    ]
}

// Helper function to create a converter node and position it between source and target
function createConverterNode(nodeSlug, sourcePort, targetPort) {
    const sourceNode = sourcePort.parent
    const targetNode = targetPort.parent
    
    // Calculate position between the two nodes
    const sourceEl = sourceNode.nodeEl
    const targetEl = targetNode.nodeEl
    
    const sourceX = parseInt(sourceEl.style.left)
    const sourceY = parseInt(sourceEl.style.top)
    const targetX = parseInt(targetEl.style.left)
    const targetY = parseInt(targetEl.style.top)
    
    // Position converter node in the middle
    const x = (sourceX + targetX) / 2
    const y = (sourceY + targetY) / 2
    
    // Create the converter node
    const converterNode = new SNode(nodeSlug, x, y)
    
    return converterNode
}

// Helper function to create a converter node and connect it
function createAndConnectNode(nodeSlug, sourcePort, targetPort, outputKey = 'output') {
    const converterNode = createConverterNode(nodeSlug, sourcePort, targetPort)
    
    // Connect source to converter input
    const converterInput = Object.values(converterNode.input)[0] // Get first input
    new Connection(sourcePort, converterInput)
    
    // Connect converter output to target
    new Connection(converterNode.output[outputKey], targetPort)
    
    return converterNode
}

// Check if a conversion is available between two types
export function canConvert(fromType, toType) {
    if (fromType === toType) return false
    if (fromType === 'action' || toType === 'action') return false
    
    const conversionKey = `${fromType}-to-${toType}`
    return conversions.hasOwnProperty(conversionKey)
}

// Get available conversions for a type pair
export function getConversions(fromType, toType) {
    const conversionKey = `${fromType}-to-${toType}`
    return conversions[conversionKey] || []
}

// Create the conversion menu UI
export function createConversionMenu(sourcePort, targetPort, x, y) {
    const fromType = sourcePort.type
    const toType = targetPort.type
    const availableConversions = getConversions(fromType, toType)
    
    if (availableConversions.length === 0) return null
    
    // Remove any existing conversion menu
    const existingMenu = document.getElementById('conversion-menu')
    if (existingMenu) existingMenu.remove()
    
    // Create menu container
    const menu = document.createElement('div')
    menu.id = 'conversion-menu'
    menu.className = 'conversion-menu'
    menu.style.left = `${x}px`
    menu.style.top = `${y}px`
    
    // Create menu header
    const header = document.createElement('div')
    header.className = 'conversion-menu-header'
    header.textContent = 'Convert'
    menu.appendChild(header)
    
    // Create menu items
    availableConversions.forEach(conversion => {
        const item = document.createElement('div')
        item.className = 'conversion-menu-item'
        item.innerHTML = `<span class="icon">${conversion.icon}</span><span class="label">${conversion.label}</span>`
        
        item.addEventListener('pointerenter', () => {
            item.classList.add('hover')
        })
        
        item.addEventListener('pointerleave', () => {
            item.classList.remove('hover')
        })
        
        item.addEventListener('pointerup', (e) => {
            e.stopPropagation()
            e.preventDefault()
            
            // Create the converter node
            const converterNode = conversion.createConverter(sourcePort, targetPort)
            
            // Update port points after DOM update
            setTimeout(() => {
                converterNode.updatePortPoints()
                Connection.redrawAllConnections()
            }, 10)
            
            // Trigger downstream updates
            SNode.refreshDownstreamOutputs(targetPort.parent)
            
            // Remove menu and clean up convertible classes
            menu.remove()
            document.querySelectorAll('.port.convertible').forEach(port => {
                port.classList.remove('convertible')
            })
        })
        
        menu.appendChild(item)
    })
    
    // Add menu to editor
    const editor = document.getElementById('editor')
    editor.appendChild(menu)
    
    return menu
}

// Remove conversion menu
export function removeConversionMenu() {
    const menu = document.getElementById('conversion-menu')
    if (menu) menu.remove()
}