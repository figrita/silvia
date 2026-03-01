/**
 * WorkspaceTabBar - Flat tab bar for workspace navigation
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

    init() {
        // Remove old workspace selector if exists
        document.getElementById('workspace-selector')?.remove()

        // Create container
        this.containerEl = document.createElement('div')
        this.containerEl.id = 'workspace-tab-container'
        this.containerEl.className = 'workspace-tab-container'

        const editor = document.getElementById('editor')
        editor.parentNode.insertBefore(this.containerEl, editor)

        this.render()

        // Re-render tabs when workspace is switched externally (e.g. cross-workspace tag click)
        document.addEventListener('workspace-switched', () => this.render())

        // Global click to close menus
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.workspace-tab-context-menu')) {
                document.getElementById('workspace-tab-context-menu')?.remove()
            }
        })
    }

    render() {
        this.containerEl.innerHTML = `
            <div class="workspace-tab-bar">
                <div class="workspace-tabs-container"></div>
                <button class="workspace-tab-add" title="New Workspace">+</button>
            </div>
        `
        this.tabBarEl = this.containerEl.firstElementChild
        const tabsContainer = this.tabBarEl.querySelector('.workspace-tabs-container')

        WorkspaceManager.getAll().forEach(ws => {
            const isActive = WorkspaceManager.activeWorkspaceId === ws.id
            tabsContainer.insertAdjacentHTML('beforeend',
                `<div class="workspace-tab ${isActive ? 'active' : ''}" data-workspace-id="${ws.id}">
                    <span class="workspace-tab-name">${ws.name}</span>
                </div>`
            )
        })

        this.setupEvents(this.tabBarEl, tabsContainer)
    }

    setupEvents(tabBar, tabsContainer) {
        tabBar.addEventListener('click', (e) => {
            if (e.target.closest('.workspace-tab-add')) {
                this.createNewWorkspace()
                return
            }
            const tab = e.target.closest('.workspace-tab')
            if (tab && e.target.getAttribute('contenteditable') !== 'true') {
                this.switchToWorkspace(parseInt(tab.dataset.workspaceId))
            }
        })

        tabBar.addEventListener('dblclick', (e) => {
            if (e.target.getAttribute('contenteditable') === 'true') return
            const tab = e.target.closest('.workspace-tab')
            if (tab) {
                e.preventDefault()
                this.startRenaming(tab)
            } else if (e.target === tabBar || e.target === tabsContainer) {
                this.createNewWorkspace()
            }
        })

        tabBar.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()
            const tab = e.target.closest('.workspace-tab')
            this.showContextMenu(e.clientX, e.clientY, tab ? parseInt(tab.dataset.workspaceId) : null)
        })
    }

    switchToWorkspace(workspaceId) {
        if (WorkspaceManager.activeWorkspaceId === workspaceId) return
        WorkspaceManager.setActive(workspaceId)
        SNode.updateVisibility()
        this.render()
        window.markDirty()
    }

    createNewWorkspace() {
        const workspace = WorkspaceManager.create()
        SNode.updateVisibility()
        this.render()
        window.markDirty()
        const tab = this.tabBarEl.querySelector(`[data-workspace-id="${workspace.id}"]`)
        if (tab) this.startRenaming(tab)
    }

    startRenaming(tab) {
        const nameEl = tab.querySelector('.workspace-tab-name')
        const workspaceId = parseInt(tab.dataset.workspaceId)
        const workspace = WorkspaceManager.workspaces.get(workspaceId)
        if (!workspace) return

        nameEl.contentEditable = 'true'
        nameEl.focus()
        const sel = window.getSelection()
        sel.selectAllChildren(nameEl)

        const finish = () => {
            nameEl.contentEditable = 'false'
            const newName = nameEl.textContent.trim()
            if (newName && newName !== workspace.name) {
                WorkspaceManager.rename(workspaceId, newName)
                window.markDirty()
            } else {
                nameEl.textContent = workspace.name
            }
        }

        nameEl.addEventListener('blur', finish, { once: true })
        nameEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); nameEl.blur() }
            if (e.key === 'Escape') { nameEl.textContent = workspace.name; nameEl.blur() }
        })
    }

    showContextMenu(x, y, workspaceId) {
        document.getElementById('workspace-tab-context-menu')?.remove()

        const menu = document.createElement('div')
        menu.id = 'workspace-tab-context-menu'
        menu.className = 'node-context-menu'
        menu.style.cssText = `position: fixed; left: ${x}px; top: ${y}px; z-index: 10000;`

        const items = workspaceId
            ? [
                { icon: '✏️', label: 'Rename', action: () => this.startRenaming(this.tabBarEl.querySelector(`[data-workspace-id="${workspaceId}"]`)) },
                { icon: '🗑️', label: 'Delete', action: () => this.deleteWorkspace(workspaceId) }
            ]
            : [{ icon: '+', label: 'New Workspace', action: () => this.createNewWorkspace() }]

        items.forEach(({ icon, label, action }) => {
            const item = document.createElement('div')
            item.className = 'context-menu-item'
            item.innerHTML = `<span class="context-menu-icon">${icon}</span><span>${label}</span>`
            item.addEventListener('click', () => { menu.remove(); action() })
            menu.appendChild(item)
        })

        document.body.appendChild(menu)
        setTimeout(() => {
            const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', close) } }
            document.addEventListener('pointerdown', close)
        }, 0)
    }

    deleteWorkspace(workspaceId) {
        const workspace = WorkspaceManager.workspaces.get(workspaceId)
        if (!workspace) return

        const orphanedNodes = [...SNode.nodes].filter(n =>
            n.workspaceVisibility?.size === 1 && n.workspaceVisibility.has(workspaceId)
        )

        if (orphanedNodes.length > 0) {
            this.showDeleteModal(workspace, orphanedNodes)
        } else {
            this.executeDelete(workspace, [])
        }
    }

    showDeleteModal(workspace, orphanedNodes) {
        document.getElementById('workspace-delete-modal')?.remove()

        const modal = document.createElement('div')
        modal.id = 'workspace-delete-modal'
        modal.className = 'workspace-delete-modal'
        modal.innerHTML = `
            <div class="workspace-delete-modal-content">
                <h3>Delete "${workspace.name}"?</h3>
                <p><strong>${orphanedNodes.length}</strong> node${orphanedNodes.length > 1 ? 's' : ''} will be deleted.</p>
                <div class="workspace-delete-modal-buttons">
                    <button class="modal-btn delete-btn"><strong>Delete workspace and nodes</strong></button>
                    <button class="modal-btn cancel-btn">Cancel</button>
                </div>
            </div>
        `
        document.body.appendChild(modal)

        const close = () => modal.remove()
        modal.querySelector('.delete-btn').addEventListener('click', () => { close(); this.executeDelete(workspace, orphanedNodes) })
        modal.querySelector('.cancel-btn').addEventListener('click', close)
        modal.addEventListener('click', (e) => { if (e.target === modal) close() })
        document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc) } })
    }

    executeDelete(workspace, orphanedNodes) {
        orphanedNodes.forEach(node => {
            if (masterMixer.channelA === node) { masterMixer.assignToChannelA(null); masterMixerUI.updateChannelStatus('A', null) }
            if (masterMixer.channelB === node) { masterMixer.assignToChannelB(null); masterMixerUI.updateChannelStatus('B', null) }
            node.destroy()
        })

        SNode.nodes.forEach(node => node.workspaceVisibility.delete(workspace.id))
        WorkspaceManager.delete(workspace.id)
        SNode.updateVisibility()
        this.render()
        window.markDirty()
    }
}

export const workspaceTabBar = new WorkspaceTabBar()
