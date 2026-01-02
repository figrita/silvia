/**
 * WorkspaceManager - Central state management for workspace tree
 *
 * Clean recursive tree design:
 * - Everything is a workspace (no separate "layer" concept)
 * - Workspaces can contain subworkspaces (children)
 * - A node can be visible on multiple sibling workspaces simultaneously
 * - activePath tracks the selected workspace at each depth level
 */

export class WorkspaceManager {
    static workspaces = new Map()  // id → Workspace (flat storage, tree via parentId)
    static activePath = []         // Array of workspace IDs from root to deepest active
    static nextId = 1

    /**
     * Initialize with a default workspace. Called from main.js on startup.
     */
    static init() {
        if (this.workspaces.size === 0) {
            const ws = this.create('Workspace 1', null)
            this.activePath = [ws.id]
        }
    }

    /**
     * Create a new workspace.
     * @param {string|null} name - Optional workspace name
     * @param {number|null} parentId - Parent workspace ID (null for root)
     * @returns {object} The created workspace
     */
    static create(name = null, parentId = null) {
        const id = this.nextId++
        const workspace = {
            id,
            parentId,
            name: name || `Workspace ${id}`
        }
        this.workspaces.set(id, workspace)

        // Update active path to include the new workspace
        if (parentId === null) {
            // Root workspace - set as active if no path exists
            if (this.activePath.length === 0) {
                this.activePath = [id]
            }
        } else {
            // Child workspace - find parent's depth and extend path to include new child
            const parentDepth = this.getDepth(parentId)
            // Ensure parent is in path, then add new workspace
            this.activePath = this.activePath.slice(0, parentDepth + 1)
            this.activePath.push(id)
        }

        return workspace
    }

    /**
     * Get the depth of a workspace in the hierarchy (0 = root).
     */
    static getDepth(workspaceId) {
        const ws = this.workspaces.get(workspaceId)
        if (!ws || ws.parentId === null) return 0
        return 1 + this.getDepth(ws.parentId)
    }

    /**
     * Get all root workspaces (no parent).
     */
    static getRootWorkspaces() {
        return [...this.workspaces.values()].filter(ws => ws.parentId === null)
    }

    /**
     * Get child workspaces of a specific workspace.
     */
    static getChildren(parentId) {
        return [...this.workspaces.values()].filter(ws => ws.parentId === parentId)
    }

    /**
     * Get siblings of a workspace (same parent, excluding self).
     */
    static getSiblings(workspaceId) {
        const ws = this.workspaces.get(workspaceId)
        if (!ws) return []
        return [...this.workspaces.values()].filter(
            w => w.parentId === ws.parentId && w.id !== workspaceId
        )
    }

    /**
     * Get all descendant workspace IDs (children, grandchildren, etc.) including the workspace itself.
     * @param {number} workspaceId - The workspace ID
     * @returns {Set<number>} Set of workspace IDs in the subtree
     */
    static getDescendantIds(workspaceId) {
        const ids = new Set()
        const collect = (wsId) => {
            ids.add(wsId)
            this.getChildren(wsId).forEach(child => collect(child.id))
        }
        collect(workspaceId)
        return ids
    }

    /**
     * Get all workspaces in a subtree (workspace and all descendants).
     * @param {number} workspaceId - The root workspace ID
     * @returns {Array} Array of workspace objects
     */
    static getSubtree(workspaceId) {
        const ids = this.getDescendantIds(workspaceId)
        return [...this.workspaces.values()].filter(ws => ids.has(ws.id))
    }

    /**
     * Get the active workspace at a specific depth.
     */
    static getActiveAtDepth(depth) {
        if (depth < this.activePath.length) {
            return this.workspaces.get(this.activePath[depth])
        }
        return null
    }

    /**
     * Get the deepest active workspace.
     */
    static getActiveWorkspace() {
        if (this.activePath.length === 0) return null
        return this.workspaces.get(this.activePath[this.activePath.length - 1])
    }

    /**
     * Get the root workspace of the current active path.
     */
    static getActiveRootWorkspace() {
        if (this.activePath.length === 0) return null
        return this.workspaces.get(this.activePath[0])
    }

    /**
     * Get the full active path as workspace objects.
     */
    static getActivePath() {
        return this.activePath.map(id => this.workspaces.get(id)).filter(Boolean)
    }

    /**
     * Set the active workspace, updating the path.
     * If workspace is already the deepest in path, it toggles to just show up to that depth.
     * @param {number} workspaceId - The workspace ID to activate
     * @returns {boolean} True if set successfully
     */
    static setActive(workspaceId) {
        if (!this.workspaces.has(workspaceId)) return false

        const ws = this.workspaces.get(workspaceId)
        const depth = this.getDepth(workspaceId)

        // Check if this workspace is already in the path at its depth
        if (this.activePath[depth] === workspaceId) {
            // Already active - truncate path to this depth (hide children)
            this.activePath = this.activePath.slice(0, depth + 1)
            return true
        }

        // Build new path up to this workspace only (don't auto-select children)
        const newPath = []
        let current = ws
        while (current) {
            newPath.unshift(current.id)
            current = current.parentId ? this.workspaces.get(current.parentId) : null
        }

        this.activePath = newPath
        return true
    }

    /**
     * Delete a workspace. Cannot delete if it's the only root workspace.
     * Children are also deleted recursively.
     * @param {number} workspaceId - The workspace ID to delete
     * @returns {boolean} True if deleted successfully
     */
    static delete(workspaceId) {
        const ws = this.workspaces.get(workspaceId)
        if (!ws) return false

        // Cannot delete the last root workspace
        const rootWorkspaces = this.getRootWorkspaces()
        if (ws.parentId === null && rootWorkspaces.length <= 1) return false

        // Get siblings for fallback
        const siblings = this.getSiblings(workspaceId)

        // Recursively delete all children
        const deleteRecursive = (id) => {
            const children = this.getChildren(id)
            children.forEach(child => deleteRecursive(child.id))
            this.workspaces.delete(id)
        }
        deleteRecursive(workspaceId)

        // Update active path if deleted workspace was in it
        const pathIndex = this.activePath.indexOf(workspaceId)
        if (pathIndex !== -1) {
            // Truncate path before deleted workspace
            this.activePath = this.activePath.slice(0, pathIndex)
            // Add first sibling if available
            if (siblings.length > 0) {
                this.activePath.push(siblings[0].id)
            } else if (pathIndex === 0 && rootWorkspaces.length > 1) {
                // Deleted root workspace, switch to another root
                const remainingRoot = rootWorkspaces.find(r => r.id !== workspaceId)
                if (remainingRoot) {
                    this.activePath = [remainingRoot.id]
                }
            }
            // If path is empty after deleting a child, this is fine -
            // the parent is still there (just not selected yet)
        }

        // Ensure activePath is not empty if we have workspaces
        if (this.activePath.length === 0 && this.workspaces.size > 0) {
            const roots = this.getRootWorkspaces()
            if (roots.length > 0) {
                this.activePath = [roots[0].id]
            }
        }

        // Note: Node handling is done by the caller (WorkspaceTabBar.deleteWorkspace)
        // to give user options (move vs delete nodes)

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
     * Serialize a workspace for saving.
     */
    static serialize(workspace) {
        return {
            id: workspace.id,
            name: workspace.name,
            parentId: workspace.parentId
        }
    }

    /**
     * Serialize the entire session.
     * @returns {object} Session data for saving
     */
    static serializeSession() {
        return {
            version: '0.5.0',  // Bumped for unified workspace tree
            activePath: this.activePath,
            nextId: this.nextId,
            workspaces: [...this.workspaces.values()].map(ws => this.serialize(ws))
        }
    }

    /**
     * Restore session state from serialized data.
     * @param {object} sessionData - Serialized session data
     */
    static restoreSession(sessionData) {
        this.workspaces.clear()
        this.nextId = sessionData.nextId || 1
        this.activePath = sessionData.activePath || []

        if (sessionData.workspaces) {
            sessionData.workspaces.forEach(wsData => {
                this.workspaces.set(wsData.id, {
                    id: wsData.id,
                    name: wsData.name,
                    parentId: wsData.parentId ?? null
                })
            })
        }

        // Migration from old format (version 0.4.0 with layers)
        if (sessionData.version === '0.4.0' || sessionData.activeWorkspaceId !== undefined) {
            this.migrateFromLayerFormat(sessionData)
        }

        // Ensure we have at least one workspace
        if (this.workspaces.size === 0) {
            this.init()
        }

        // Ensure activePath is valid
        if (this.activePath.length === 0 || !this.workspaces.has(this.activePath[0])) {
            const roots = this.getRootWorkspaces()
            if (roots.length > 0) {
                this.activePath = [roots[0].id]
            }
        }
    }

    /**
     * Migrate from old workspace+layer format to unified workspace tree.
     */
    static migrateFromLayerFormat(oldData) {
        // Old format had: workspaces[].layers[] with parentLayerId
        // Convert each layer to a workspace
        if (!oldData.workspaces) return

        this.workspaces.clear()
        let maxId = 0

        oldData.workspaces.forEach(oldWs => {
            if (!oldWs.layers || oldWs.layers.length === 0) {
                // Workspace without layers - create as single workspace
                const id = oldWs.id
                maxId = Math.max(maxId, id)
                this.workspaces.set(id, {
                    id,
                    name: oldWs.name,
                    parentId: null
                })
            } else {
                // Convert layers to workspaces
                // Root layers become root workspaces
                // Child layers become child workspaces
                oldWs.layers.forEach(layer => {
                    const id = oldWs.id * 1000 + layer.id  // Create unique IDs
                    maxId = Math.max(maxId, id)
                    const parentId = layer.parentLayerId
                        ? oldWs.id * 1000 + layer.parentLayerId
                        : null
                    this.workspaces.set(id, {
                        id,
                        name: layer.name,
                        parentId
                    })
                })

                // Convert activeLayerPath to activePath
                if (oldWs.activeLayerPath && oldWs.activeLayerPath.length > 0) {
                    this.activePath = oldWs.activeLayerPath.map(layerId => oldWs.id * 1000 + layerId)
                }
            }
        })

        this.nextId = maxId + 1
    }

    /**
     * Reset to initial state.
     */
    static reset() {
        this.workspaces.clear()
        this.activePath = []
        this.nextId = 1
        this.init()
    }
}
