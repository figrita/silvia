/**
 * WorkspaceTabBar - Simple flat tab bar for workspace navigation
 *
 * - Click tab: Switch to that workspace
 * - Double-click tab name: Inline rename
 * - Right-click tab: Context menu (delete)
 * - (+) button: Create new workspace
 */

import { WorkspaceManager } from './workspaceManager.js'
import { SNode } from './snode.js'
import { masterMixer } from './masterMixer.js'
import { masterMixerUI } from './masterMixerUI.js'

class WorkspaceTabBar {
    constructor() {
        this.containerEl = null
        this.tabBarEl = null
    }

    /**
     * Initialize the tab bar UI.
     */
    init() {
        this.createContainer()
        this.render()
        this.setupGlobalClickHandler()
    }

    /**
     * Create the container and tab bar.
     */
    createContainer() {
        // Remove old workspace selector if exists
        const oldSelector = document.getElementById('workspace-selector')
        if (oldSelector) oldSelector.remove()

        // Create container
        const container = document.createElement('div')
        container.id = 'workspace-tab-container'
        container.className = 'workspace-tab-container'

        // Insert before editor
        const editor = document.getElementById('editor')
        editor.parentNode.insertBefore(container, editor)

        this.containerEl = container

        // Right-click on empty area shows "New Workspace" context menu
        container.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()
            // Only show menu if clicking on empty area (not on a tab)
            if (!e.target.closest('.workspace-tab')) {
                this.showTabBarContextMenu(e.clientX, e.clientY)
            }
        })
    }

    /**
     * Render the tab bar.
     */
    render() {
        this.containerEl.innerHTML = ''

        const tabBar = document.createElement('div')
        tabBar.className = 'workspace-tab-bar'
        tabBar.innerHTML = `
            <div class="workspace-tabs-container"></div>
            <button class="workspace-tab-add" title="New Workspace">+</button>
        `

        const addBtn = tabBar.querySelector('.workspace-tab-add')
        addBtn.addEventListener('click', () => this.createNewWorkspace())

        const tabsContainer = tabBar.querySelector('.workspace-tabs-container')

        // Double-click on empty area of tab bar to create new workspace
        tabBar.addEventListener('dblclick', (e) => {
            // Ignore if renaming (contenteditable)
            if (e.target.getAttribute('contenteditable') === 'true') return
            // Only trigger if clicking on the tab bar itself or tabs container, not on a tab
            if (e.target === tabBar || e.target === tabsContainer) {
                this.createNewWorkspace(true)  // true = start with rename mode
            }
        })
        WorkspaceManager.getAll().forEach(workspace => {
            tabsContainer.appendChild(this.createTab(workspace))
        })

        this.containerEl.appendChild(tabBar)
        this.tabBarEl = tabBar
    }

    /**
     * Create a single workspace tab.
     */
    createTab(workspace) {
        const isActive = WorkspaceManager.activeWorkspaceId === workspace.id

        const tab = document.createElement('div')
        tab.className = `workspace-tab ${isActive ? 'active' : ''}`
        tab.dataset.workspaceId = workspace.id
        tab.innerHTML = `<span class="workspace-tab-name">${workspace.name}</span>`

        const nameEl = tab.querySelector('.workspace-tab-name')

        // Click to switch
        tab.addEventListener('click', (e) => {
            if (e.target.classList.contains('workspace-tab-name') &&
                e.target.getAttribute('contenteditable') === 'true') return
            this.switchToWorkspace(workspace.id)
        })

        // Double-click on tab to rename
        tab.addEventListener('dblclick', (e) => {
            e.preventDefault()
            e.stopPropagation()
            // Don't start rename if already editing
            if (nameEl.getAttribute('contenteditable') === 'true') return
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
     * Switch to a workspace.
     */
    switchToWorkspace(workspaceId) {
        // Don't re-render if already on this workspace (allows double-click to work)
        if (WorkspaceManager.activeWorkspaceId === workspaceId) return
        WorkspaceManager.setActive(workspaceId)
        SNode.updateVisibility()
        this.render()
        window.markDirty()
    }

    /**
     * Create a new workspace.
     * @param {boolean} startRenaming - If true, immediately start inline rename
     */
    createNewWorkspace(startRenaming = false) {
        const workspace = WorkspaceManager.create()
        SNode.updateVisibility()
        this.render()
        window.markDirty()

        if (startRenaming) {
            // Find the newly created tab and start renaming
            const tab = this.tabBarEl.querySelector(`[data-workspace-id="${workspace.id}"]`)
            const nameEl = tab?.querySelector('.workspace-tab-name')
            if (nameEl) {
                this.startRenaming(nameEl, workspace)
            }
        }
    }

    /**
     * Start inline renaming.
     */
    startRenaming(nameEl, workspace) {
        nameEl.contentEditable = 'true'
        nameEl.focus()

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
     * Setup global click handler to close menus.
     */
    setupGlobalClickHandler() {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.workspace-tab-context-menu')) {
                const menu = document.getElementById('workspace-tab-context-menu')
                if (menu) menu.remove()
            }
        })
    }

    /**
     * Show context menu for empty tab bar area.
     */
    showTabBarContextMenu(x, y) {
        const existing = document.getElementById('workspace-tab-context-menu')
        if (existing) existing.remove()

        const menu = document.createElement('div')
        menu.id = 'workspace-tab-context-menu'
        menu.className = 'node-context-menu'
        menu.style.cssText = `position: fixed; left: ${x}px; top: ${y}px; z-index: 10000;`

        const menuItem = document.createElement('div')
        menuItem.className = 'context-menu-item'
        menuItem.innerHTML = `<span class="context-menu-icon">+</span><span>New Workspace</span>`
        menuItem.addEventListener('click', () => {
            menu.remove()
            this.createNewWorkspace(true)
        })
        menu.appendChild(menuItem)

        document.body.appendChild(menu)

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
     * Show context menu for a tab.
     */
    showContextMenu(workspace, x, y) {
        const existing = document.getElementById('workspace-tab-context-menu')
        if (existing) existing.remove()

        const menu = document.createElement('div')
        menu.id = 'workspace-tab-context-menu'
        menu.className = 'node-context-menu'
        menu.style.cssText = `position: fixed; left: ${x}px; top: ${y}px; z-index: 10000;`

        const items = [
            {
                label: 'Rename',
                icon: '✏️',
                action: () => {
                    menu.remove()
                    const tab = this.tabBarEl.querySelector(`[data-workspace-id="${workspace.id}"]`)
                    const nameEl = tab?.querySelector('.workspace-tab-name')
                    if (nameEl) this.startRenaming(nameEl, workspace)
                }
            },
            {
                label: 'Delete',
                icon: '🗑️',
                action: () => {
                    menu.remove()
                    this.deleteWorkspace(workspace)
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
     * Delete a workspace.
     */
    deleteWorkspace(workspace) {
        // Find nodes that would be orphaned (ONLY on this workspace)
        const orphanedNodes = [...SNode.nodes].filter(node => {
            if (!node.workspaceVisibility) return false
            return node.workspaceVisibility.size === 1 && node.workspaceVisibility.has(workspace.id)
        })

        if (orphanedNodes.length === 0) {
            this.executeWorkspaceDeletion(workspace, orphanedNodes, 'none')
            return
        }

        this.showDeleteModal(workspace, orphanedNodes)
    }

    /**
     * Show delete confirmation modal.
     */
    showDeleteModal(workspace, orphanedNodes) {
        const existing = document.getElementById('workspace-delete-modal')
        if (existing) existing.remove()

        const modal = document.createElement('div')
        modal.id = 'workspace-delete-modal'
        modal.className = 'workspace-delete-modal'

        modal.innerHTML = `
            <div class="workspace-delete-modal-content">
                <h3>Delete "${workspace.name}"?</h3>
                <p><strong>${orphanedNodes.length}</strong> node${orphanedNodes.length > 1 ? 's' : ''} will be deleted.</p>
                <div class="workspace-delete-modal-buttons">
                    <button class="modal-btn delete-btn">
                        <strong>Delete workspace and nodes</strong>
                    </button>
                    <button class="modal-btn cancel-btn">Cancel</button>
                </div>
            </div>
        `

        document.body.appendChild(modal)

        const deleteBtn = modal.querySelector('.delete-btn')
        const cancelBtn = modal.querySelector('.cancel-btn')

        deleteBtn.addEventListener('click', () => {
            modal.remove()
            this.executeWorkspaceDeletion(workspace, orphanedNodes, 'delete')
        })

        cancelBtn.addEventListener('click', () => modal.remove())

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove()
        })

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                modal.remove()
                document.removeEventListener('keydown', handleEscape)
            }
        }
        document.addEventListener('keydown', handleEscape)
    }

    /**
     * Execute workspace deletion.
     */
    executeWorkspaceDeletion(workspace, orphanedNodes, action) {
        if (action === 'delete') {
            orphanedNodes.forEach(node => {
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

        // Remove workspace ID from nodes that are on multiple workspaces
        [...SNode.nodes].forEach(node => {
            if (node.workspaceVisibility?.has(workspace.id)) {
                node.workspaceVisibility.delete(workspace.id)
            }
        })

        WorkspaceManager.delete(workspace.id)
        SNode.updateVisibility()
        this.render()
        window.markDirty()
    }
}

export const workspaceTabBar = new WorkspaceTabBar()
