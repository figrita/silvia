/**
 * WorkspaceTabBar - Flat tab bar for workspace navigation
 */

import { WorkspaceManager } from './workspaceManager.js'
import { SNode } from './snode.js'
import { Connection } from './connections.js'
import { mainMixer } from './mainMixer.js'
import { iconHtml } from './icons.js'
import { mainMixerUI } from './mainMixerUI.js'

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

        // Re-render tabs when workspace is switched or renamed externally
        document.addEventListener('workspace-switched', () => this.render())
        document.addEventListener('workspace-renamed', () => this.render())

        // Global click to close menus
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.workspace-tab-context-menu')) {
                document.getElementById('workspace-tab-context-menu')?.remove()
            }
        })
    }

    render() {
        // First render: build the stable shell
        if (!this.tabBarEl) {
            this.containerEl.innerHTML = `
                <div class="workspace-tab-bar">
                    <div class="workspace-tabs-container"></div>
                    <button class="workspace-tab-add" title="New Workspace"><span class="floating-btn-label">New</span><span class="floating-btn-icon">${iconHtml('plus', 14)}</span></button>
                </div>
            `
            this.tabBarEl = this.containerEl.firstElementChild
            this.tabsContainer = this.tabBarEl.querySelector('.workspace-tabs-container')
            this.setupEvents(this.tabBarEl, this.tabsContainer)
        }

        // Update only the tabs
        this.tabsContainer.innerHTML = ''
        WorkspaceManager.getAll().forEach(ws => {
            const isActive = WorkspaceManager.activeWorkspaceId === ws.id
            const hasSource = ws.source?.type != null
            this.tabsContainer.insertAdjacentHTML('beforeend',
                `<div class="workspace-tab${isActive ? ' active' : ''}${hasSource ? ' has-source' : ''}" data-workspace-id="${ws.id}">
                    <span class="workspace-tab-name">${ws.name}</span>
                </div>`
            )
        })
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
    }

    createNewWorkspace() {
        const workspace = WorkspaceManager.create()
        SNode.updateVisibility()
        this.render()
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
                mainMixerUI.updateChannelStatus('A', mainMixer.channelA)
                mainMixerUI.updateChannelStatus('B', mainMixer.channelB)
                Connection.redrawAllConnections()
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
        menu.className = 'tabbar-context-menu'
        menu.style.cssText = `position: fixed; left: ${x}px; top: ${y}px; z-index: 10000;`

        const items = workspaceId
            ? [
                { icon: iconHtml('pencil', 14), label: 'Rename', action: () => this.startRenaming(this.tabBarEl.querySelector(`[data-workspace-id="${workspaceId}"]`)) },
                { icon: iconHtml('info', 14), label: 'Properties...', action: () => this.showPropertiesModal(workspaceId) },
                { icon: iconHtml('x', 14), label: 'Close', action: () => this.deleteWorkspace(workspaceId) }
            ]
            : [{ icon: iconHtml('plus', 14), label: 'New Workspace', action: () => this.createNewWorkspace() }]

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

    showPropertiesModal(workspaceId) {
        const workspace = WorkspaceManager.workspaces.get(workspaceId)
        if (!workspace) return

        document.getElementById('workspace-properties-modal')?.remove()

        const modal = document.createElement('div')
        modal.id = 'workspace-properties-modal'
        modal.className = 'modal-overlay'
        modal.innerHTML = `
            <div class="modal-content workspace-properties-content">
                <h2>Workspace Properties</h2>
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="ws-prop-name" value="" />
                </div>
                <div class="form-group">
                    <label>Author</label>
                    <input type="text" id="ws-prop-author" value="" />
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="ws-prop-description" rows="3"></textarea>
                </div>
                <div class="modal-actions">
                    <button class="modal-btn cancel-btn">Cancel</button>
                    <button class="modal-btn confirm-btn">OK</button>
                </div>
            </div>
        `
        document.body.appendChild(modal)

        // Pre-fill fields
        const nameInput = modal.querySelector('#ws-prop-name')
        const authorInput = modal.querySelector('#ws-prop-author')
        const descInput = modal.querySelector('#ws-prop-description')

        nameInput.value = workspace.name
        authorInput.value = workspace.source?.author || ''
        descInput.value = workspace.source?.description || ''

        const close = () => { modal.remove(); document.removeEventListener('keydown', onKey) }
        const confirm = () => {
            const newName = nameInput.value.trim()
            if (!newName) { nameInput.focus(); return }

            if (newName !== workspace.name) {
                WorkspaceManager.rename(workspaceId, newName)
                mainMixerUI.updateChannelStatus('A', mainMixer.channelA)
                mainMixerUI.updateChannelStatus('B', mainMixer.channelB)
                Connection.redrawAllConnections()
            }

            // Update or create source metadata
            const author = authorInput.value
            const description = descInput.value
            if (workspace.source) {
                WorkspaceManager.setSource(workspaceId, { ...workspace.source, author, description })
            } else if (author || description) {
                WorkspaceManager.setSource(workspaceId, { type: null, author, description })
            }

            this.render()
            close()
        }

        const onKey = (e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirm() }
        }

        modal.querySelector('.confirm-btn').addEventListener('click', confirm)
        modal.querySelector('.cancel-btn').addEventListener('click', close)
        modal.addEventListener('click', (e) => { if (e.target === modal) close() })
        document.addEventListener('keydown', onKey)
        nameInput.focus()
        nameInput.select()
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
                <h3>Close "${workspace.name}"?</h3>
                <p><strong>${orphanedNodes.length}</strong> node${orphanedNodes.length > 1 ? 's' : ''} will be deleted.</p>
                <div class="workspace-delete-modal-buttons">
                    <button class="modal-btn delete-btn">Close</button>
                    <button class="modal-btn cancel-btn">Cancel</button>
                </div>
            </div>
        `
        document.body.appendChild(modal)

        const esc = (e) => { if (e.key === 'Escape') close() }
        const close = () => { modal.remove(); document.removeEventListener('keydown', esc) }
        modal.querySelector('.delete-btn').addEventListener('click', () => { close(); this.executeDelete(workspace, orphanedNodes) })
        modal.querySelector('.cancel-btn').addEventListener('click', close)
        modal.addEventListener('click', (e) => { if (e.target === modal) close() })
        document.addEventListener('keydown', esc)
    }

    executeDelete(workspace, orphanedNodes) {
        // Clear mixer channels before destroying orphaned nodes
        orphanedNodes.forEach(node => {
            if (mainMixer.channelA === node) { mainMixer.assignToChannelA(null); mainMixerUI.updateChannelStatus('A', null) }
            if (mainMixer.channelB === node) { mainMixer.assignToChannelB(null); mainMixerUI.updateChannelStatus('B', null) }
            node.destroy()
        })

        // WorkspaceManager.delete() handles removing the workspace ID from all
        // remaining nodes' visibility sets and destroying any newly orphaned nodes
        WorkspaceManager.delete(workspace.id)
        SNode.updateVisibility()
        mainMixerUI.updateChannelStatus('A', mainMixer.channelA)
        mainMixerUI.updateChannelStatus('B', mainMixer.channelB)
        this.render()
    }
}

export const workspaceTabBar = new WorkspaceTabBar()
