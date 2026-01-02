/**
 * WorkspaceTabBar - Unified recursive tab bars for workspace tree navigation
 *
 * Clean tree design:
 * - Everything is a workspace (no separate "layer" concept)
 * - Each depth level shows sibling workspaces (same parent)
 * - Tab bars stack vertically as you go deeper in the tree
 * - Click tab: Switch to that workspace
 * - Double-click tab name: Inline rename
 * - Right-click tab: Context menu (delete, add child)
 * - (+) button: Create new workspace at that level
 */

import { WorkspaceManager } from './workspaceManager.js'
import { SNode } from './snode.js'
import { Connection } from './connections.js'
import { masterMixer } from './masterMixer.js'
import { masterMixerUI } from './masterMixerUI.js'

class WorkspaceTabBar {
    constructor() {
        this.containerEl = null
        this.tabBars = []  // Array of tab bar elements, one per depth
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
        this.tabBars = []

        // Render tab bars recursively starting from root (parentId = null)
        this.renderTabBarsRecursive(null, 0)
    }

    /**
     * Recursively render tab bars for each depth level.
     * @param {number|null} parentId - Parent workspace ID (null for root)
     * @param {number} depth - Current depth level
     */
    renderTabBarsRecursive(parentId, depth) {
        // Get workspaces at this depth (children of parentId)
        const workspacesAtDepth = parentId === null
            ? WorkspaceManager.getRootWorkspaces()
            : WorkspaceManager.getChildren(parentId)

        // Show tab bar if there are any workspaces at this depth
        if (workspacesAtDepth.length > 0) {
            const tabBar = this.createTabBar(depth, parentId)
            this.containerEl.appendChild(tabBar)
            this.tabBars.push(tabBar)
            this.renderTabs(workspacesAtDepth, tabBar, depth)
        }

        // Get active workspace at this depth to recurse into its children
        const activeAtDepth = WorkspaceManager.getActiveAtDepth(depth)
        if (activeAtDepth) {
            // Check if this workspace has children
            const children = WorkspaceManager.getChildren(activeAtDepth.id)
            if (children.length > 0) {
                this.renderTabBarsRecursive(activeAtDepth.id, depth + 1)
            }
        }
    }

    /**
     * Create a tab bar element.
     * @param {number} depth - Depth level (0 for root workspaces)
     * @param {number|null} parentId - Parent workspace ID for this bar's workspaces
     */
    createTabBar(depth, parentId) {
        const tabBar = document.createElement('div')
        tabBar.className = 'workspace-tab-bar'
        if (depth > 0) {
            tabBar.classList.add('workspace-tab-bar-nested')
        }
        tabBar.dataset.depth = depth
        if (parentId !== null) {
            tabBar.dataset.parentId = parentId
        }
        tabBar.innerHTML = `
            <div class="workspace-tabs-container"></div>
            <button class="workspace-tab-add" title="New Workspace">+</button>
        `

        const addBtn = tabBar.querySelector('.workspace-tab-add')
        addBtn.addEventListener('click', () => {
            this.createNewWorkspace(parentId)
        })

        return tabBar
    }

    /**
     * Render workspace tabs in a tab bar.
     * @param {Array} workspaces - Workspaces to render at this depth
     * @param {HTMLElement} tabBar - The tab bar element
     * @param {number} depth - Depth level
     */
    renderTabs(workspaces, tabBar, depth) {
        const container = tabBar.querySelector('.workspace-tabs-container')
        container.innerHTML = ''

        workspaces.forEach(workspace => {
            const tab = this.createTab(workspace, depth)
            container.appendChild(tab)
        })
    }

    /**
     * Create a single workspace tab element.
     * @param {object} workspace - The workspace object
     * @param {number} depth - Depth level
     */
    createTab(workspace, depth) {
        // Workspace is active if it's in the activePath at this depth
        const isActive = WorkspaceManager.activePath[depth] === workspace.id

        const tab = document.createElement('div')
        tab.className = `workspace-tab ${isActive ? 'active' : ''}`
        tab.dataset.workspaceId = workspace.id
        tab.dataset.depth = depth

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
            this.startRenaming(nameEl, workspace)
        })

        // Right-click context menu
        tab.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()
            this.showContextMenu(workspace, e.clientX, e.clientY)
        })

        return tab
    }

    /**
     * Switch to a different workspace.
     * If already active, clicking again hides child workspaces.
     */
    switchToWorkspace(workspaceId) {
        WorkspaceManager.setActive(workspaceId)
        SNode.updateVisibility()
        this.render()
        window.markDirty()
    }

    /**
     * Create a new workspace at a specific level.
     * @param {number|null} parentId - Parent workspace ID (null for root)
     */
    createNewWorkspace(parentId) {
        const workspace = WorkspaceManager.create(null, parentId)
        SNode.updateVisibility()
        this.render()
        window.markDirty()
    }

    /**
     * Start inline renaming.
     */
    startRenaming(nameEl, workspace) {
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
            if (newName && newName !== workspace.name) {
                WorkspaceManager.rename(workspace.id, newName)
                window.markDirty()
            } else {
                nameEl.textContent = workspace.name
            }
        }

        nameEl.addEventListener('blur', finishRename, { once: true })
        nameEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                nameEl.blur()
            }
            if (e.key === 'Escape') {
                nameEl.textContent = workspace.name
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
    showContextMenu(workspace, x, y) {
        // Remove existing menu
        const existing = document.getElementById('workspace-tab-context-menu')
        if (existing) existing.remove()

        const menu = document.createElement('div')
        menu.id = 'workspace-tab-context-menu'
        menu.className = 'node-context-menu'
        menu.style.cssText = `position: fixed; left: ${x}px; top: ${y}px; z-index: 10000;`

        // Get siblings for delete check
        const siblings = WorkspaceManager.getSiblings(workspace.id)
        // Can delete if:
        // 1. Has siblings (another workspace at same level to switch to), OR
        // 2. Has a parent (this is a child workspace, parent remains after deletion)
        // Cannot delete the ONLY root workspace (no siblings and no parent)
        const isOnlyRootWorkspace = workspace.parentId === null && siblings.length === 0
        const canDelete = !isOnlyRootWorkspace

        const items = [
            {
                label: 'Rename',
                icon: '✏️',
                action: () => {
                    menu.remove()
                    // Find the tab
                    let tab = null
                    for (const bar of this.tabBars) {
                        tab = bar.querySelector(`[data-workspace-id="${workspace.id}"]`)
                        if (tab) break
                    }
                    const nameEl = tab?.querySelector('.workspace-tab-name')
                    if (nameEl) this.startRenaming(nameEl, workspace)
                }
            },
            {
                label: 'Add Workspace',
                icon: '➕',
                action: () => {
                    menu.remove()
                    // Switch to this workspace first if needed
                    if (!WorkspaceManager.activePath.includes(workspace.id)) {
                        WorkspaceManager.setActive(workspace.id)
                    }
                    // Create child workspace
                    this.createNewWorkspace(workspace.id)
                }
            },
            {
                label: 'Delete',
                icon: '🗑️',
                disabled: !canDelete,
                action: () => {
                    menu.remove()
                    if (canDelete) {
                        this.deleteWorkspace(workspace)
                    }
                }
            }
        ]

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
     * Delete a workspace with a proper modal dialog.
     * Offers choice to promote nodes to parent or delete them.
     */
    deleteWorkspace(workspace) {
        // Collect all workspaces being deleted (this workspace and descendants)
        const workspacesToDelete = new Set()
        const collectDescendants = (wsId) => {
            workspacesToDelete.add(wsId)
            WorkspaceManager.getChildren(wsId).forEach(child => {
                collectDescendants(child.id)
            })
        }
        collectDescendants(workspace.id)

        // Find nodes that would be orphaned (ONLY on deleted workspaces, not also on others)
        const orphanedNodes = [...SNode.nodes].filter(node => {
            if (!node.workspaceVisibility) return false
            // Check if ALL of the node's workspaces are being deleted
            for (const wsId of node.workspaceVisibility) {
                if (!workspacesToDelete.has(wsId)) {
                    return false // Node is also on a non-deleted workspace
                }
            }
            return true // All workspaces are being deleted
        })

        const hasParent = workspace.parentId !== null
        const parentWs = hasParent ? WorkspaceManager.workspaces.get(workspace.parentId) : null

        // If no orphaned nodes, just delete
        if (orphanedNodes.length === 0) {
            this.executeWorkspaceDeletion(workspace, workspacesToDelete, [], 'none')
            return
        }

        // Show modal for user choice
        this.showDeleteModal(workspace, workspacesToDelete, orphanedNodes, hasParent, parentWs)
    }

    /**
     * Show modal dialog for workspace deletion options.
     */
    showDeleteModal(workspace, workspacesToDelete, orphanedNodes, hasParent, parentWs) {
        const existing = document.getElementById('workspace-delete-modal')
        if (existing) existing.remove()

        const modal = document.createElement('div')
        modal.id = 'workspace-delete-modal'
        modal.className = 'workspace-delete-modal'

        const childCount = workspacesToDelete.size - 1
        const childText = childCount > 0 ? ` and ${childCount} child workspace${childCount > 1 ? 's' : ''}` : ''

        modal.innerHTML = `
            <div class="workspace-delete-modal-content">
                <h3>Delete "${workspace.name}"${childText}?</h3>
                <p><strong>${orphanedNodes.length}</strong> node${orphanedNodes.length > 1 ? 's' : ''} will be orphaned.</p>
                <div class="workspace-delete-modal-buttons">
                    ${hasParent ? `
                        <button class="modal-btn promote-btn">
                            <strong>Move to "${parentWs.name}"</strong>
                            <span class="modal-btn-desc">Promote nodes to parent workspace</span>
                        </button>
                    ` : ''}
                    <button class="modal-btn delete-btn">
                        <strong>Delete nodes</strong>
                        <span class="modal-btn-desc">Permanently remove ${orphanedNodes.length} node${orphanedNodes.length > 1 ? 's' : ''}</span>
                    </button>
                    <button class="modal-btn cancel-btn">Cancel</button>
                </div>
            </div>
        `

        document.body.appendChild(modal)

        // Event handlers
        const promoteBtn = modal.querySelector('.promote-btn')
        const deleteBtn = modal.querySelector('.delete-btn')
        const cancelBtn = modal.querySelector('.cancel-btn')

        if (promoteBtn) {
            promoteBtn.addEventListener('click', () => {
                modal.remove()
                this.executeWorkspaceDeletion(workspace, workspacesToDelete, orphanedNodes, 'promote')
            })
        }

        deleteBtn.addEventListener('click', () => {
            modal.remove()
            this.executeWorkspaceDeletion(workspace, workspacesToDelete, orphanedNodes, 'delete')
        })

        cancelBtn.addEventListener('click', () => {
            modal.remove()
        })

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove()
            }
        })

        // Close on Escape
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                modal.remove()
                document.removeEventListener('keydown', handleEscape)
            }
        }
        document.addEventListener('keydown', handleEscape)
    }

    /**
     * Execute the workspace deletion with the chosen action for orphaned nodes.
     * @param {object} workspace - The workspace to delete
     * @param {Set} workspacesToDelete - All workspace IDs being deleted
     * @param {Array} orphanedNodes - Nodes that will be orphaned
     * @param {string} action - 'promote', 'delete', or 'none'
     */
    executeWorkspaceDeletion(workspace, workspacesToDelete, orphanedNodes, action) {
        // Handle orphaned nodes based on user choice
        if (action === 'promote' && workspace.parentId !== null) {
            orphanedNodes.forEach(node => {
                // Remove from deleted workspaces
                for (const deletedId of workspacesToDelete) {
                    node.workspaceVisibility.delete(deletedId)
                }
                // Add to parent
                node.workspaceVisibility.add(workspace.parentId)
            })
        } else if (action === 'delete') {
            orphanedNodes.forEach(node => {
                // Clear mixer assignments first
                if (masterMixer.channelA === node) {
                    masterMixer.assignToChannelA(null)
                    masterMixerUI.updateChannelStatus('A', null)
                }
                if (masterMixer.channelB === node) {
                    masterMixer.assignToChannelB(null)
                    masterMixerUI.updateChannelStatus('B', null)
                }
                node.destroy()
            })
        }

        // For nodes that are on both deleted and non-deleted workspaces,
        // just remove the deleted workspace IDs
        const nonOrphanedAffectedNodes = [...SNode.nodes].filter(node => {
            if (!node.workspaceVisibility) return false
            const isOnDeletedWs = [...node.workspaceVisibility].some(wsId => workspacesToDelete.has(wsId))
            const isOnOtherWs = [...node.workspaceVisibility].some(wsId => !workspacesToDelete.has(wsId))
            return isOnDeletedWs && isOnOtherWs
        })

        nonOrphanedAffectedNodes.forEach(node => {
            for (const deletedId of workspacesToDelete) {
                node.workspaceVisibility.delete(deletedId)
            }
        })

        // Delete workspace
        WorkspaceManager.delete(workspace.id)
        SNode.updateVisibility()
        this.render()
        window.markDirty()
    }
}

// Export singleton instance
export const workspaceTabBar = new WorkspaceTabBar()
