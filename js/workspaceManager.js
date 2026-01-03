/**
 * WorkspaceManager - Central state management for workspaces
 *
 * Simple flat design:
 * - Workspaces are independent (no hierarchy)
 * - A node can be visible on multiple workspaces simultaneously
 * - activeWorkspaceId tracks the currently selected workspace
 */

export class WorkspaceManager {
    static workspaces = new Map()  // id → Workspace
    static activeWorkspaceId = null
    static nextId = 1

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
            name: name || `Workspace ${id}`
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
        return true
    }

    /**
     * Delete a workspace. If deleting the last workspace, creates a new empty one.
     * @param {number} workspaceId - The workspace ID to delete
     * @returns {boolean} True if deleted successfully
     */
    static delete(workspaceId) {
        if (!this.workspaces.has(workspaceId)) return false

        this.workspaces.delete(workspaceId)

        // If deleted the last workspace, create a new empty one
        if (this.workspaces.size === 0) {
            const newWs = this.create('Workspace 1')
            this.activeWorkspaceId = newWs.id
            return true
        }

        // If deleted the active workspace, switch to another
        if (this.activeWorkspaceId === workspaceId) {
            this.activeWorkspaceId = this.workspaces.keys().next().value
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
        return true
    }

    /**
     * Serialize the entire session.
     * @returns {object} Session data for saving
     */
    static serializeSession() {
        return {
            version: '0.6.0',  // Flat workspaces
            activeWorkspaceId: this.activeWorkspaceId,
            nextId: this.nextId,
            workspaces: [...this.workspaces.values()].map(ws => ({
                id: ws.id,
                name: ws.name
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
                    name: wsData.name
                })
            })
        }

        // Handle activeWorkspaceId (new format) or activePath (old format)
        if (sessionData.activeWorkspaceId !== undefined) {
            this.activeWorkspaceId = sessionData.activeWorkspaceId
        } else if (sessionData.activePath?.length > 0) {
            // Migration from old nested format - just use the deepest active
            this.activeWorkspaceId = sessionData.activePath[sessionData.activePath.length - 1]
        }

        // Ensure we have at least one workspace
        if (this.workspaces.size === 0) {
            this.init()
            return
        }

        // Ensure activeWorkspaceId is valid
        if (!this.workspaces.has(this.activeWorkspaceId)) {
            this.activeWorkspaceId = this.workspaces.keys().next().value
        }
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
