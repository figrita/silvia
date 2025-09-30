// preload.js
const { contextBridge, ipcRenderer, webUtils } = require('electron')

console.log('Preload script loaded')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Asset management APIs
    getFilePathFromFile: (file) => {
        // Use webUtils to get the real file path from a File object
        try {
            return webUtils.getPathForFile(file)
        } catch (error) {
            console.error('Failed to get file path:', error)
            return null
        }
    },
    copyAssetFromPath: (filePath, type, thumbnailData) => ipcRenderer.invoke('copy-asset-from-path', filePath, type, thumbnailData),
    resolveAssetPath: (assetPath) => ipcRenderer.invoke('resolve-asset-path', assetPath),
    listAssets: (type) => ipcRenderer.invoke('list-assets', type),
    deleteAsset: (assetPath) => ipcRenderer.invoke('delete-asset', assetPath),
    getAssetInfo: (assetPath) => ipcRenderer.invoke('get-asset-info', assetPath),
    updateAssetInfo: (assetPath, newInfo) => ipcRenderer.invoke('update-asset-info', assetPath, newInfo),
    
    // Workspace management
    getWorkspacePath: () => ipcRenderer.invoke('get-workspace-path'),
    createWorkspace: (path) => ipcRenderer.invoke('create-workspace', path),
    
    // File system helpers
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    
    // Patch file management APIs
    savePatchFile: (patchData, filename) => ipcRenderer.invoke('save-patch-file', patchData, filename),
    listPatchFiles: () => ipcRenderer.invoke('list-patch-files'),
    loadPatchFile: (filename) => ipcRenderer.invoke('load-patch-file', filename),
    deletePatchFile: (filename) => ipcRenderer.invoke('delete-patch-file', filename),
    loadPatchFromPath: (filePath) => ipcRenderer.invoke('load-patch-from-path', filePath),
    
    // Event listeners
    onOpenPatchFile: (callback) => {
        ipcRenderer.on('open-patch-file', (event, filePath) => callback(filePath))
    },

    // Note: Window close handling now uses standard beforeunload events

    // Environment info
    isElectron: true,

    // External link handling
    openExternal: (url) => ipcRenderer.invoke('open-external', url)
})