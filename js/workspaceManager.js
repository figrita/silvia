/**
 * WorkspaceManager - Central state management for workspaces and layers
 *
 * Workspaces are isolated containers (no cross-workspace connections).
 * Layers are hierarchical - each layer can have sub-layers (children).
 * A node can be visible on multiple sibling layers simultaneously.
 *
 * Layer hierarchy:
 * - Workspace contains root layers (parentLayerId = null)
 * - Each layer can have child layers (parentLayerId = parent's id)
 * - Active layer path: tracks selection at each depth level
 */

export class WorkspaceManager {
    static workspaces = new Map()  // id → Workspace
    static activeWorkspaceId = null
    static nextWorkspaceId = 1

    /**
     * Initialize with a default workspace. Called from main.js on startup.
     */
    static init() {
        if (this.workspaces.size === 0) {
            const ws = this.createWorkspace('Workspace 1')
            this.activeWorkspaceId = ws.id
        }
    }

    /**
     * Create a new workspace with a default layer.
     * @param {string|null} name - Optional workspace name
     * @returns {object} The created workspace
     */
    static createWorkspace(name = null) {
        const id = this.nextWorkspaceId++
        const workspace = {
            id,
            name: name || `Workspace ${id}`,
            layers: new Map(),
            activeLayerPath: [],  // Array of layer IDs from root to deepest active
            nextLayerId: 1
        }
        // Always create default layer
        this.createLayer(workspace, 'Layer 1', null)
        this.workspaces.set(id, workspace)
        return workspace
    }

    /**
     * Create a new layer within a workspace.
     * @param {object} workspace - The workspace to add the layer to
     * @param {string|null} name - Optional layer name
     * @param {number|null} parentLayerId - Parent layer ID (null for root layer)
     * @returns {object} The created layer
     */
    static createLayer(workspace, name = null, parentLayerId = null) {
        const id = workspace.nextLayerId++
        const layer = {
            id,
            workspaceId: workspace.id,
            parentLayerId,
            name: name || `Layer ${id}`
        }
        workspace.layers.set(id, layer)

        // Update active layer path
        if (parentLayerId === null) {
            // Root layer - set as active if no path exists
            if (workspace.activeLayerPath.length === 0) {
                workspace.activeLayerPath = [id]
            }
        } else {
            // Sub-layer - find depth and update path
            const parentDepth = this.getLayerDepth(workspace, parentLayerId)
            // Truncate path to parent's depth + 1, then add new layer
            workspace.activeLayerPath = workspace.activeLayerPath.slice(0, parentDepth + 1)
            workspace.activeLayerPath.push(id)
        }

        return layer
    }

    /**
     * Get the depth of a layer in the hierarchy (0 = root).
     */
    static getLayerDepth(workspace, layerId) {
        const layer = workspace.layers.get(layerId)
        if (!layer || layer.parentLayerId === null) return 0
        return 1 + this.getLayerDepth(workspace, layer.parentLayerId)
    }

    /**
     * Get all root layers (no parent) in a workspace.
     */
    static getRootLayers(workspace) {
        return [...workspace.layers.values()].filter(l => l.parentLayerId === null)
    }

    /**
     * Get child layers of a specific layer.
     */
    static getChildLayers(workspace, parentLayerId) {
        return [...workspace.layers.values()].filter(l => l.parentLayerId === parentLayerId)
    }

    /**
     * Get the active layer at a specific depth.
     */
    static getActiveLayerAtDepth(workspace, depth) {
        if (depth < workspace.activeLayerPath.length) {
            return workspace.layers.get(workspace.activeLayerPath[depth])
        }
        return null
    }

    /**
     * Get the deepest active layer.
     */
    static getActiveLayer() {
        const ws = this.getActiveWorkspace()
        if (!ws || ws.activeLayerPath.length === 0) return null
        return ws.layers.get(ws.activeLayerPath[ws.activeLayerPath.length - 1])
    }

    /**
     * Get the full active layer path as layer objects.
     */
    static getActiveLayerPath(workspace) {
        return workspace.activeLayerPath.map(id => workspace.layers.get(id)).filter(Boolean)
    }

    /**
     * Set the active layer at a specific depth, updating the path.
     * @param {number} workspaceId - The workspace ID
     * @param {number} layerId - The layer ID to activate
     * @returns {boolean} True if set successfully
     */
    static setActiveLayer(workspaceId, layerId) {
        const ws = this.workspaces.get(workspaceId)
        if (!ws || !ws.layers.has(layerId)) return false

        const layer = ws.layers.get(layerId)
        const depth = this.getLayerDepth(ws, layerId)

        // Build new path up to this layer
        const newPath = []
        let current = layer
        while (current) {
            newPath.unshift(current.id)
            current = current.parentLayerId ? ws.layers.get(current.parentLayerId) : null
        }

        ws.activeLayerPath = newPath
        return true
    }

    /**
     * Delete a layer from a workspace. Cannot delete the last root layer.
     * Child layers are also deleted.
     * @param {object} workspace - The workspace containing the layer
     * @param {number} layerId - The layer ID to delete
     * @returns {boolean} True if deleted successfully
     */
    static deleteLayer(workspace, layerId) {
        const layer = workspace.layers.get(layerId)
        if (!layer) return false

        // Cannot delete last root layer
        const rootLayers = this.getRootLayers(workspace)
        if (layer.parentLayerId === null && rootLayers.length <= 1) return false

        // Get sibling layers for fallback
        const siblings = [...workspace.layers.values()].filter(
            l => l.parentLayerId === layer.parentLayerId && l.id !== layerId
        )

        // Recursively delete all child layers
        const deleteRecursive = (id) => {
            const children = this.getChildLayers(workspace, id)
            children.forEach(child => deleteRecursive(child.id))
            workspace.layers.delete(id)
        }
        deleteRecursive(layerId)

        // Update active path if deleted layer was in it
        const pathIndex = workspace.activeLayerPath.indexOf(layerId)
        if (pathIndex !== -1) {
            // Truncate path before deleted layer
            workspace.activeLayerPath = workspace.activeLayerPath.slice(0, pathIndex)
            // Add first sibling if available
            if (siblings.length > 0) {
                workspace.activeLayerPath.push(siblings[0].id)
            } else if (pathIndex === 0 && rootLayers.length > 1) {
                // Deleted root layer, switch to another root
                const remainingRoot = rootLayers.find(l => l.id !== layerId)
                if (remainingRoot) {
                    workspace.activeLayerPath = [remainingRoot.id]
                }
            }
        }

        // Handle orphaned nodes
        import('./snode.js').then(({ SNode }) => {
            const remainingLayerId = siblings[0]?.id || workspace.activeLayerPath[0]
            for (const node of SNode.nodes) {
                if (node.workspaceId === workspace.id && node.layerVisibility) {
                    node.layerVisibility.delete(layerId)
                    if (node.layerVisibility.size === 0 && remainingLayerId) {
                        node.layerVisibility.add(remainingLayerId)
                    }
                }
            }
        })

        return true
    }

    /**
     * Delete a workspace. Cannot delete the last workspace.
     * @param {number} workspaceId - The workspace ID to delete
     * @returns {boolean} True if deleted successfully
     */
    static deleteWorkspace(workspaceId) {
        if (this.workspaces.size <= 1) return false

        this.workspaces.delete(workspaceId)

        if (this.activeWorkspaceId === workspaceId) {
            this.activeWorkspaceId = this.workspaces.keys().next().value
        }
        return true
    }

    /**
     * Get the currently active workspace.
     * @returns {object|undefined} The active workspace
     */
    static getActiveWorkspace() {
        return this.workspaces.get(this.activeWorkspaceId)
    }

    /**
     * Set the active workspace.
     * @param {number} workspaceId - The workspace ID to activate
     * @returns {boolean} True if set successfully
     */
    static setActiveWorkspace(workspaceId) {
        if (!this.workspaces.has(workspaceId)) return false
        this.activeWorkspaceId = workspaceId
        return true
    }

    /**
     * Serialize a workspace for saving.
     * @param {object} workspace - The workspace to serialize
     * @returns {object} Serialized workspace data
     */
    static serializeWorkspace(workspace) {
        return {
            id: workspace.id,
            name: workspace.name,
            layers: [...workspace.layers.values()].map(l => ({
                id: l.id,
                name: l.name,
                parentLayerId: l.parentLayerId
            })),
            activeLayerPath: workspace.activeLayerPath,
            nextLayerId: workspace.nextLayerId
        }
    }

    /**
     * Deserialize workspace data (for loading).
     * @param {object} data - Serialized workspace data
     * @returns {object} Deserialized workspace
     */
    static deserializeWorkspace(data) {
        const workspace = {
            id: data.id,
            name: data.name,
            layers: new Map(),
            activeLayerPath: data.activeLayerPath || [],
            nextLayerId: data.nextLayerId || 1
        }

        if (data.layers) {
            data.layers.forEach(l => {
                workspace.layers.set(l.id, {
                    id: l.id,
                    workspaceId: workspace.id,
                    parentLayerId: l.parentLayerId ?? null,
                    name: l.name
                })
            })
        }

        // Migration: convert old activeLayerId to activeLayerPath
        if (data.activeLayerId && workspace.activeLayerPath.length === 0) {
            workspace.activeLayerPath = [data.activeLayerId]
        }

        // Ensure path is valid
        if (workspace.activeLayerPath.length === 0 && workspace.layers.size > 0) {
            const rootLayers = [...workspace.layers.values()].filter(l => l.parentLayerId === null)
            if (rootLayers.length > 0) {
                workspace.activeLayerPath = [rootLayers[0].id]
            }
        }

        return workspace
    }

    /**
     * Serialize the entire session (all workspaces).
     * @returns {object} Session data for saving
     */
    static serializeSession() {
        return {
            version: '0.4.0',  // Bumped for nested layers
            activeWorkspaceId: this.activeWorkspaceId,
            nextWorkspaceId: this.nextWorkspaceId,
            workspaces: [...this.workspaces.values()].map(ws => this.serializeWorkspace(ws))
        }
    }

    /**
     * Restore session state from serialized data.
     * @param {object} sessionData - Serialized session data
     */
    static restoreSessionState(sessionData) {
        this.workspaces.clear()
        this.nextWorkspaceId = sessionData.nextWorkspaceId || 1
        this.activeWorkspaceId = sessionData.activeWorkspaceId

        if (sessionData.workspaces) {
            sessionData.workspaces.forEach(wsData => {
                const workspace = this.deserializeWorkspace(wsData)
                this.workspaces.set(workspace.id, workspace)
            })
        }

        // Ensure we have at least one workspace
        if (this.workspaces.size === 0) {
            this.init()
        }

        // Ensure activeWorkspaceId is valid
        if (!this.workspaces.has(this.activeWorkspaceId)) {
            this.activeWorkspaceId = this.workspaces.keys().next().value
        }
    }

    /**
     * Reset to initial state (for testing or clear all).
     */
    static reset() {
        this.workspaces.clear()
        this.activeWorkspaceId = null
        this.nextWorkspaceId = 1
        this.init()
    }
}
