/**
 * WorkspaceManager - Central state management for workspaces
 *
 * Simple flat design:
 * - Workspaces are independent (no hierarchy)
 * - A node can be visible on multiple workspaces simultaneously
 * - activeWorkspaceId tracks the currently selected workspace
 *
 * TERMINOLOGY GUIDE:
 * - "Workspace" = a tab in the UI; the container users work in (user-facing term)
 * - "Patch" in code = a saved .svs file (legacy term from before the tab refactor).
 *   In the save/load code, "patch" variables refer to serialized file data.
 * - "Session" = the full app state across all workspaces (Ctrl+Shift+S = Save As)
 * - "Source" = where a workspace was last saved/loaded from (file path or localStorage).
 *   Enables Ctrl+S quick-save back to the original location.
 * - IPC methods like savePatchFile/listPatchFiles deal with .svs file I/O
 *   ("patch" in IPC = file on disk, not a UI concept)
 */

import { PATCH_VERSION } from './version.js'

export class WorkspaceManager {
    static workspaces = new Map()  // id → Workspace
    static activeWorkspaceId = null
    static nextId = 1
    static _onBeforeDelete = null // Registered by snode.js to clean up node visibility

    /**
     * Initialize with a default workspace. Called from main.js on startup.
     */
    static init() {
        if (this.workspaces.size === 0) {
            const ws = this.create('Workspace 1')
            this.activeWorkspaceId = ws.id
        }
    }

    /**
     * Create a new workspace.
     * @param {string|null} name - Optional workspace name
     * @returns {object} The created workspace
     */
    static create(name = null) {
        const id = this.nextId++
        const workspace = {
            id,
            name: name || `Workspace ${id}`,
            source: null
        }
        this.workspaces.set(id, workspace)

        // Set as active if none selected
        if (this.activeWorkspaceId === null) {
            this.activeWorkspaceId = id
        }

        return workspace
    }

    /**
     * Get all workspaces.
     */
    static getAll() {
        return [...this.workspaces.values()]
    }

    /**
     * Get the active workspace.
     */
    static getActiveWorkspace() {
        if (this.activeWorkspaceId === null) return null
        return this.workspaces.get(this.activeWorkspaceId)
    }

    /**
     * Set the active workspace.
     * @param {number} workspaceId - The workspace ID to activate
     * @returns {boolean} True if set successfully
     */
    static setActive(workspaceId) {
        if (!this.workspaces.has(workspaceId)) return false
        this.activeWorkspaceId = workspaceId
        document.dispatchEvent(new CustomEvent('source-changed'))
        return true
    }

    /**
     * Delete a workspace. If deleting the last workspace, creates a new empty one.
     * @param {number} workspaceId - The workspace ID to delete
     * @returns {boolean} True if deleted successfully
     */
    static delete(workspaceId) {
        if (!this.workspaces.has(workspaceId)) return false

        // Clean up node visibility before removing workspace
        this._onBeforeDelete?.(workspaceId)

        this.workspaces.delete(workspaceId)

        // If deleted the last workspace, create a new empty one
        if (this.workspaces.size === 0) {
            const newWs = this.create('Workspace 1')
            this.setActive(newWs.id)
            return true
        }

        // If deleted the active workspace, switch to another
        if (this.activeWorkspaceId === workspaceId) {
            this.setActive(this.workspaces.keys().next().value)
        }

        return true
    }

    /**
     * Rename a workspace.
     * @param {number} workspaceId - The workspace ID
     * @param {string} newName - The new name
     * @returns {boolean} True if renamed successfully
     */
    static rename(workspaceId, newName) {
        const ws = this.workspaces.get(workspaceId)
        if (!ws) return false
        ws.name = newName
        document.dispatchEvent(new CustomEvent('workspace-renamed'))
        return true
    }

    /**
     * Set the save/load source for a workspace.
     * @param {number} workspaceId
     * @param {object|null} source - { type, filename, folder, author, description } or null
     */
    static setSource(workspaceId, source) {
        const ws = this.workspaces.get(workspaceId)
        if (!ws) return false
        ws.source = source || null
        document.dispatchEvent(new CustomEvent('source-changed'))
        return true
    }

    /**
     * Serialize the entire session.
     * @returns {object} Session data for saving
     */
    static serializeSession() {
        return {
            version: PATCH_VERSION,
            activeWorkspaceId: this.activeWorkspaceId,
            nextId: this.nextId,
            workspaces: [...this.workspaces.values()].map(ws => ({
                id: ws.id,
                name: ws.name,
                source: ws.source || null
            }))
        }
    }

    /**
     * Restore session state from serialized data.
     * @param {object} sessionData - Serialized session data
     */
    static restoreSession(sessionData) {
        this.workspaces.clear()
        this.nextId = sessionData.nextId || 1

        if (sessionData.workspaces) {
            sessionData.workspaces.forEach(wsData => {
                this.workspaces.set(wsData.id, {
                    id: wsData.id,
                    name: wsData.name,
                    source: wsData.source || null
                })
            })
        }

        // Ensure nextId is past all existing IDs to prevent collisions
        for (const id of this.workspaces.keys()) {
            if (id >= this.nextId) this.nextId = id + 1
        }

        // Ensure we have at least one workspace
        if (this.workspaces.size === 0) {
            this.init()
            return
        }

        // Ensure activeWorkspaceId is valid
        const targetId = this.workspaces.has(sessionData.activeWorkspaceId)
            ? sessionData.activeWorkspaceId
            : this.workspaces.keys().next().value
        this.setActive(targetId)
    }

    /**
     * Reset to initial state.
     */
    static reset() {
        this.workspaces.clear()
        this.activeWorkspaceId = null
        this.nextId = 1
        this.init()
    }
}
