// autoLayout.js - Automatic node layout with topological ranking

import { SNode } from './snode.js'
import { Connection } from './connections.js'

/**
 * Performs automatic layout of nodes in the current workspace
 * Uses topological ranking to organize nodes into columns
 */
export function autoLayoutNodes() {
    const nodes = SNode.getNodesInCurrentWorkspace()
    if (nodes.length === 0) return

    const VERTICAL_MARGIN = 50
    const MAX_HEIGHT = window.innerHeight - 2 * VERTICAL_MARGIN
    const HORIZONTAL_MARGIN = 50
    const MIN_SPACING = 10
    const MAX_SPACING = 30

    // Rank nodes by dependencies and split into columns
    const ranks = assignRanks(nodes)
    const nodesByRank = groupNodesByRank(nodes, ranks)
    const columns = splitIntoColumns(nodesByRank, MAX_HEIGHT, VERTICAL_MARGIN, MIN_SPACING)

    // Calculate column widths (widest node in column + 2x left margin)
    const columnWidths = columns.map(column => {
        let widestWidth = 0
        for (const node of column.nodes) {
            const width = node.nodeEl.offsetWidth
            if (width > widestWidth) widestWidth = width
        }
        return 2 * HORIZONTAL_MARGIN + widestWidth
    })

    // Calculate total workspace width
    const totalWidth = columnWidths.reduce((sum, w) => sum + w, HORIZONTAL_MARGIN)
    const nodeRoot = document.getElementById('node-root')
    if (totalWidth > nodeRoot.offsetWidth) {
        nodeRoot.style.width = `${totalWidth}px`
    }

    // Position nodes
    let currentX = HORIZONTAL_MARGIN
    columns.forEach((column, columnIndex) => {
        const positions = distributeVertically(column.nodes, MAX_HEIGHT, VERTICAL_MARGIN, MIN_SPACING, MAX_SPACING)
        column.nodes.forEach((node, index) => {
            node.nodeEl.style.left = `${currentX}px`
            node.nodeEl.style.top = `${positions[index]}px`
        })
        currentX += columnWidths[columnIndex]
    })

    // Update connections
    nodes.forEach(node => node.updatePortPoints())
    Connection.redrawAllConnections()
    SNode.recalculateWorkspaceWidth()
}

/**
 * Assigns a rank (column) to each node based on topological ordering
 * Nodes with no dependencies get rank 0
 * Each node's rank is 1 + max rank of its dependencies
 */
function assignRanks(nodes) {
    const ranks = new Map()
    const inStack = new Set()

    function getInputSourceNodes(node) {
        const sourceNodes = []
        if (!node.input) return sourceNodes

        for (const inputPort of Object.values(node.input)) {
            if (inputPort.type !== 'action' && inputPort.connection) {
                const sourcePort = inputPort.connection
                if (sourcePort && sourcePort.parent) {
                    sourceNodes.push(sourcePort.parent)
                }
            }
        }
        return sourceNodes
    }

    function calculateRank(node) {
        if (ranks.has(node)) return ranks.get(node)
        if (inStack.has(node)) {
            // Circular dependency - break it
            ranks.set(node, 0)
            return 0
        }

        inStack.add(node)
        const sourceNodes = getInputSourceNodes(node)

        if (sourceNodes.length === 0) {
            ranks.set(node, 0)
            inStack.delete(node)
            return 0
        }

        let maxInputRank = -1
        for (const sourceNode of sourceNodes) {
            maxInputRank = Math.max(maxInputRank, calculateRank(sourceNode))
        }

        const nodeRank = maxInputRank + 1
        ranks.set(node, nodeRank)
        inStack.delete(node)
        return nodeRank
    }

    nodes.forEach(node => calculateRank(node))
    return ranks
}

/**
 * Groups nodes by their rank into a Map
 */
function groupNodesByRank(nodes, ranks) {
    const nodesByRank = new Map()

    for (const node of nodes) {
        const rank = ranks.get(node)
        if (!nodesByRank.has(rank)) {
            nodesByRank.set(rank, [])
        }
        nodesByRank.get(rank).push(node)
    }

    return nodesByRank
}

/**
 * Splits ranks into physical columns, breaking up tall ranks into multiple columns
 */
function splitIntoColumns(nodesByRank, maxHeight, topMargin, minSpacing) {
    const columns = []
    const sortedRanks = Array.from(nodesByRank.keys()).sort((a, b) => a - b)

    for (const rank of sortedRanks) {
        const subColumns = splitRankIntoSubColumns(nodesByRank.get(rank), maxHeight, topMargin, minSpacing)
        subColumns.forEach(subColumn => columns.push({ rank, nodes: subColumn }))
    }

    return columns
}

/**
 * Splits a single rank's nodes into multiple sub-columns if needed
 */
function splitRankIntoSubColumns(nodes, maxHeight, topMargin, minSpacing) {
    const subColumns = []
    let currentColumn = []
    let currentHeight = topMargin

    for (const node of nodes) {
        const nodeHeight = node.nodeEl.offsetHeight
        const spacingNeeded = currentColumn.length > 0 ? minSpacing : 0
        const newHeight = currentHeight + spacingNeeded + nodeHeight

        if (newHeight > maxHeight && currentColumn.length > 0) {
            // Current node doesn't fit, start a new column
            subColumns.push(currentColumn)
            currentColumn = [node]
            currentHeight = topMargin + nodeHeight
        } else {
            // Current node fits
            currentColumn.push(node)
            currentHeight = newHeight
        }
    }

    if (currentColumn.length > 0) {
        subColumns.push(currentColumn)
    }

    return subColumns
}

/**
 * Distributes nodes vertically with even spacing
 */
function distributeVertically(nodes, maxHeight, topMargin, minSpacing, maxSpacing) {
    if (nodes.length === 0) return []
    if (nodes.length === 1) return [topMargin]

    const nodeHeights = nodes.map(node => node.nodeEl.offsetHeight)
    const totalNodeHeight = nodeHeights.reduce((sum, h) => sum + h, 0)
    const availableSpace = maxHeight - totalNodeHeight - topMargin
    const spacing = Math.max(minSpacing, Math.min(maxSpacing, availableSpace / (nodes.length - 1)))

    const positions = []
    let currentY = topMargin
    for (let i = 0; i < nodes.length; i++) {
        positions[i] = currentY
        currentY += nodeHeights[i] + spacing
    }

    return positions
}
