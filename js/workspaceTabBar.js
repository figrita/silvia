/**
 * WorkspaceTabBar - Hierarchical stacked tab bars for workspace/layer navigation
 *
 * Features:
 * - Top tab bar shows workspaces
 * - Below that, stacked tab bars show layers at each depth level
 * - Layers can have sub-layers, adding more stacked bars vertically
 * - Only sibling layers (same parent) appear in the same tab bar
 * - Click tab: Switch to that item
 * - Double-click tab name: Inline rename
 * - Right-click tab: Context menu (delete, add sub-layer)
 * - (+) button: Create new item at that level
 */

import { WorkspaceManager } from './workspaceManager.js'
import { SNode } from './snode.js'
import { Connection } from './connections.js'
import { masterMixer } from './masterMixer.js'
import { masterMixerUI } from './masterMixerUI.js'

class WorkspaceTabBar {
    constructor() {
        this.containerEl = null
        this.workspaceBarEl = null
        this.layerBars = []  // Array of layer tab bar elements, one per depth
    }

    /**
     * Initialize the tab bar UI. Called from main.js after DOMContentLoaded.
     */
    init() {
        this.createContainer()
        this.render()
        this.setupGlobalClickHandler()
    }

    /**
     * Create the container for stacked tab bars.
     */
    createContainer() {
        // Remove old workspace selector
        const oldSelector = document.getElementById('workspace-selector')
        if (oldSelector) {
            oldSelector.remove()
        }

        // Create container for all tab bars
        const container = document.createElement('div')
        container.id = 'workspace-tab-container'
        container.className = 'workspace-tab-container'

        // Insert BEFORE editor (as sibling, not child)
        const editor = document.getElementById('editor')
        editor.parentNode.insertBefore(container, editor)

        this.containerEl = container

        // Prevent right-click anywhere in tab container from opening node quick menu
        container.addEventListener('contextmenu', (e) => {
            e.stopPropagation()
        })
    }

    /**
     * Render all tab bars based on current state.
     */
    render() {
        this.containerEl.innerHTML = ''

        // Always render workspace tab bar
        this.workspaceBarEl = this.createTabBar('workspace')
        this.containerEl.appendChild(this.workspaceBarEl)
        this.renderWorkspaceTabs()

        // Render layer tab bar if active workspace has layers (show when > 1 layer)
        const activeWs = WorkspaceManager.getActiveWorkspace()
        if (activeWs && activeWs.layers.size > 1) {
            this.layerBarEl = this.createTabBar('layer')
            this.containerEl.appendChild(this.layerBarEl)
            this.renderLayerTabs(activeWs)
        } else {
            this.layerBarEl = null
        }
    }

    /**
     * Create a tab bar element.
     */
    createTabBar(level) {
        const tabBar = document.createElement('div')
        tabBar.className = `workspace-tab-bar workspace-tab-bar-${level}`
        tabBar.dataset.level = level
        tabBar.innerHTML = `
            <div class="workspace-tabs-container"></div>
            <button class="workspace-tab-add" title="New ${level === 'workspace' ? 'Workspace' : 'Layer'}">+</button>
        `

        const addBtn = tabBar.querySelector('.workspace-tab-add')
        addBtn.addEventListener('click', () => {
            if (level === 'workspace') {
                this.createNewWorkspace()
            } else {
                this.createNewLayer()
            }
        })

        return tabBar
    }

    /**
     * Render workspace tabs.
     */
    renderWorkspaceTabs() {
        const container = this.workspaceBarEl.querySelector('.workspace-tabs-container')
        container.innerHTML = ''

        WorkspaceManager.workspaces.forEach(workspace => {
            const tab = this.createWorkspaceTab(workspace)
            container.appendChild(tab)
        })
    }

    /**
     * Render layer tabs for a workspace.
     */
    renderLayerTabs(workspace) {
        if (!this.layerBarEl) return

        const container = this.layerBarEl.querySelector('.workspace-tabs-container')
        container.innerHTML = ''

        workspace.layers.forEach(layer => {
            const tab = this.createLayerTab(layer, workspace)
            container.appendChild(tab)
        })
    }

    /**
     * Create a single workspace tab element.
     */
    createWorkspaceTab(workspace) {
        const isActive = workspace.id === WorkspaceManager.activeWorkspaceId

        const tab = document.createElement('div')
        tab.className = `workspace-tab ${isActive ? 'active' : ''}`
        tab.dataset.workspaceId = workspace.id

        tab.innerHTML = `
            <span class="workspace-tab-name">${workspace.name}</span>
        `

        // Click to switch workspace
        tab.addEventListener('click', (e) => {
            if (e.target.classList.contains('workspace-tab-name') &&
                e.target.getAttribute('contenteditable') === 'true') return

            this.switchToWorkspace(workspace.id)
        })

        // Double-click to rename
        const nameEl = tab.querySelector('.workspace-tab-name')
        nameEl.addEventListener('dblclick', (e) => {
            e.stopPropagation()
            this.startRenaming(nameEl, workspace, 'workspace')
        })

        // Right-click context menu
        tab.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()
            this.showContextMenu(workspace, null, e.clientX, e.clientY, 'workspace')
        })

        return tab
    }

    /**
     * Create a single layer tab element.
     */
    createLayerTab(layer, workspace) {
        const isActive = layer.id === workspace.activeLayerId

        const tab = document.createElement('div')
        tab.className = `workspace-tab workspace-tab-layer ${isActive ? 'active' : ''}`
        tab.dataset.layerId = layer.id

        tab.innerHTML = `
            <span class="workspace-tab-name">${layer.name}</span>
        `

        // Click to switch layer
        tab.addEventListener('click', (e) => {
            if (e.target.classList.contains('workspace-tab-name') &&
                e.target.getAttribute('contenteditable') === 'true') return

            this.switchToLayer(workspace.id, layer.id)
        })

        // Double-click to rename
        const nameEl = tab.querySelector('.workspace-tab-name')
        nameEl.addEventListener('dblclick', (e) => {
            e.stopPropagation()
            this.startRenaming(nameEl, layer, 'layer')
        })

        // Right-click context menu
        tab.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()
            this.showContextMenu(workspace, layer, e.clientX, e.clientY, 'layer')
        })

        return tab
    }

    /**
     * Switch to a different workspace.
     */
    switchToWorkspace(workspaceId) {
        if (WorkspaceManager.activeWorkspaceId === workspaceId) return

        SNode.setCurrentWorkspace(workspaceId)
        this.render()
        window.markDirty()
    }

    /**
     * Switch to a different layer.
     */
    switchToLayer(workspaceId, layerId) {
        const ws = WorkspaceManager.workspaces.get(workspaceId)
        if (!ws || ws.activeLayerId === layerId) return

        WorkspaceManager.setActiveLayer(workspaceId, layerId)
        SNode.updateVisibility()
        this.render()
        window.markDirty()
    }

    /**
     * Create a new workspace and switch to it.
     */
    createNewWorkspace() {
        const workspace = WorkspaceManager.createWorkspace()
        SNode.setCurrentWorkspace(workspace.id)
        this.render()
        window.markDirty()
    }

    /**
     * Create a new layer in the active workspace.
     */
    createNewLayer() {
        const activeWs = WorkspaceManager.getActiveWorkspace()
        if (!activeWs) return

        const layer = WorkspaceManager.createLayer(activeWs)
        WorkspaceManager.setActiveLayer(activeWs.id, layer.id)
        SNode.updateVisibility()
        this.render()
        window.markDirty()
    }

    /**
     * Start inline renaming.
     */
    startRenaming(nameEl, item, type) {
        nameEl.contentEditable = 'true'
        nameEl.focus()

        // Select all text
        const range = document.createRange()
        range.selectNodeContents(nameEl)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)

        const finishRename = () => {
            nameEl.contentEditable = 'false'
            const newName = nameEl.textContent.trim()
            if (newName && newName !== item.name) {
                item.name = newName
                window.markDirty()
            } else {
                nameEl.textContent = item.name
            }
        }

        nameEl.addEventListener('blur', finishRename, { once: true })
        nameEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                nameEl.blur()
            }
            if (e.key === 'Escape') {
                nameEl.textContent = item.name
                nameEl.blur()
            }
        })
    }

    /**
     * Setup global click handler.
     */
    setupGlobalClickHandler() {
        document.addEventListener('click', (e) => {
            // Close any open context menus
            if (!e.target.closest('.workspace-tab-context-menu')) {
                const menu = document.getElementById('workspace-tab-context-menu')
                if (menu) menu.remove()
            }
        })
    }

    /**
     * Show context menu for a tab.
     */
    showContextMenu(workspace, layer, x, y, type) {
        // Remove existing menu
        const existing = document.getElementById('workspace-tab-context-menu')
        if (existing) existing.remove()

        const menu = document.createElement('div')
        menu.id = 'workspace-tab-context-menu'
        menu.className = 'node-context-menu'
        menu.style.cssText = `position: fixed; left: ${x}px; top: ${y}px; z-index: 10000;`

        const items = []

        if (type === 'workspace') {
            const canDelete = WorkspaceManager.workspaces.size > 1

            items.push({
                label: 'Rename',
                icon: '✏️',
                action: () => {
                    menu.remove()
                    const tab = this.workspaceBarEl.querySelector(`[data-workspace-id="${workspace.id}"]`)
                    const nameEl = tab?.querySelector('.workspace-tab-name')
                    if (nameEl) this.startRenaming(nameEl, workspace, 'workspace')
                }
            })

            items.push({
                label: 'Add Layer',
                icon: '➕',
                action: () => {
                    menu.remove()
                    // Switch to this workspace first
                    if (WorkspaceManager.activeWorkspaceId !== workspace.id) {
                        SNode.setCurrentWorkspace(workspace.id)
                    }
                    this.createNewLayer()
                }
            })

            items.push({
                label: 'Delete Workspace',
                icon: '🗑️',
                disabled: !canDelete,
                action: () => {
                    menu.remove()
                    if (canDelete) {
                        this.deleteWorkspace(workspace)
                    }
                }
            })
        } else if (type === 'layer') {
            const canDelete = workspace.layers.size > 1

            items.push({
                label: 'Rename',
                icon: '✏️',
                action: () => {
                    menu.remove()
                    const tab = this.layerBarEl?.querySelector(`[data-layer-id="${layer.id}"]`)
                    const nameEl = tab?.querySelector('.workspace-tab-name')
                    if (nameEl) this.startRenaming(nameEl, layer, 'layer')
                }
            })

            items.push({
                label: 'Add Layer',
                icon: '➕',
                action: () => {
                    menu.remove()
                    this.createNewLayer()
                }
            })

            items.push({
                label: 'Delete Layer',
                icon: '🗑️',
                disabled: !canDelete,
                action: () => {
                    menu.remove()
                    if (canDelete) {
                        this.deleteLayer(workspace, layer)
                    }
                }
            })
        }

        items.forEach(item => {
            const menuItem = document.createElement('div')
            menuItem.className = `context-menu-item ${item.disabled ? 'disabled' : ''}`
            menuItem.innerHTML = `<span class="context-menu-icon">${item.icon}</span><span>${item.label}</span>`
            if (!item.disabled) {
                menuItem.addEventListener('click', item.action)
            }
            menu.appendChild(menuItem)
        })

        document.body.appendChild(menu)

        // Close on click outside
        setTimeout(() => {
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove()
                    document.removeEventListener('pointerdown', closeMenu)
                }
            }
            document.addEventListener('pointerdown', closeMenu)
        }, 0)
    }

    /**
     * Delete a layer.
     */
    deleteLayer(workspace, layer) {
        if (workspace.layers.size <= 1) return

        // Handle nodes on this layer
        const nodesOnLayer = SNode.getNodesOnLayer(workspace.id, layer.id)
        const remainingLayerIds = [...workspace.layers.keys()].filter(id => id !== layer.id)

        if (remainingLayerIds.length === 0) return

        const targetLayerId = remainingLayerIds[0]

        nodesOnLayer.forEach(node => {
            // If node is ONLY on this layer, move to target
            if (node.layerVisibility.size === 1) {
                node.layerVisibility.clear()
                node.layerVisibility.add(targetLayerId)
            } else {
                // Just remove from this layer
                node.layerVisibility.delete(layer.id)
            }
        })

        // Delete the layer
        WorkspaceManager.deleteLayer(workspace, layer.id)
        SNode.updateVisibility()
        this.render()
        window.markDirty()
    }

    /**
     * Delete a workspace with confirmation.
     */
    deleteWorkspace(workspace) {
        if (WorkspaceManager.workspaces.size <= 1) return

        // Check for nodes and mixer assignments
        const nodesInWorkspace = SNode.getNodesInWorkspace(workspace.id)
        const hasAssignedOutput = nodesInWorkspace.some(node =>
            masterMixer.channelA === node || masterMixer.channelB === node
        )

        let confirmMsg = `Delete workspace "${workspace.name}"?`
        if (nodesInWorkspace.length > 0) {
            confirmMsg += `\n\nThis will delete ${nodesInWorkspace.length} node(s).`
        }
        if (hasAssignedOutput) {
            confirmMsg += '\n\nWarning: This workspace has outputs assigned to the mixer.'
        }

        if (!confirm(confirmMsg)) return

        // Clear mixer assignments for nodes in this workspace
        nodesInWorkspace.forEach(node => {
            if (masterMixer.channelA === node) {
                masterMixer.assignToChannelA(null)
                masterMixerUI.updateChannelStatus('A', null)
            }
            if (masterMixer.channelB === node) {
                masterMixer.assignToChannelB(null)
                masterMixerUI.updateChannelStatus('B', null)
            }
        })

        // Destroy all nodes in this workspace
        nodesInWorkspace.forEach(node => node.destroy())

        // Delete workspace
        WorkspaceManager.deleteWorkspace(workspace.id)

        // Switch to remaining workspace
        SNode.setCurrentWorkspace(WorkspaceManager.activeWorkspaceId)
        this.render()
        window.markDirty()
    }
}

// Export singleton instance
export const workspaceTabBar = new WorkspaceTabBar()
