// preload.js
const { contextBridge, ipcRenderer } = require('electron')

console.log('Preload script loaded')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Asset management APIs
    copyAsset: async (fileData, type) => {
        // Convert File object to serializable data
        const serializedFile = {
            name: fileData.name,
            size: fileData.size,
            type: fileData.type,
            data: fileData.data, // ArrayBuffer data
            thumbnailData: fileData.thumbnailData // Include thumbnail data for videos
        }
        return await ipcRenderer.invoke('copy-asset', serializedFile, type)
    },
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
    listPatchFiles: (folderName) => ipcRenderer.invoke('list-patch-files', folderName),
    listPatchFolders: () => ipcRenderer.invoke('list-patch-folders'),
    loadPatchFile: (filename) => ipcRenderer.invoke('load-patch-file', filename),
    deletePatchFile: (filename) => ipcRenderer.invoke('delete-patch-file', filename),
    loadPatchFromPath: (filePath) => ipcRenderer.invoke('load-patch-from-path', filePath),
    
    // Event listeners
    onOpenPatchFile: (callback) => {
        ipcRenderer.on('open-patch-file', (event, filePath) => callback(filePath))
    },
    
    // Debug info
    getDebugInfo: () => ipcRenderer.invoke('get-debug-info'),

    // Note: Window close handling now uses standard beforeunload events

    // Environment info
    isElectron: true,

    // External link handling
    openExternal: (url) => ipcRenderer.invoke('open-external', url)
})