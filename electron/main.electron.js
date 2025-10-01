// electron.js
console.log('Main Electron process starting...')
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron')
const path = require('path')
const fs = require('fs').promises
const crypto = require('crypto')
console.log('Electron modules loaded successfully')

// Register the custom protocol as a standard scheme before app ready
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'asset',
        privileges: {
            standard: true,
            secure: true,
            supportsFetchAPI: true,
            corsEnabled: true
        }
    }
])

// Get workspace path (always relative to app directory)
function getWorkspacePath() {
    if (app.isPackaged) {
        // Production: use directory containing the executable
        return path.dirname(process.execPath)
    } else {
        // Development: use the project directory
        return path.dirname(__dirname)
    }
}

// Ensure required directories exist
async function ensureDirectories() {
    const wsPath = getWorkspacePath()

    try {
        await fs.mkdir(path.join(wsPath, 'assets', 'images'), { recursive: true })
        await fs.mkdir(path.join(wsPath, 'assets', 'videos'), { recursive: true })
        await fs.mkdir(path.join(wsPath, 'assets', 'audio'), { recursive: true })
        await fs.mkdir(path.join(wsPath, 'patches'), { recursive: true })
        return true
    } catch (error) {
        console.error('Error creating directories:', error)
        return false
    }
}

// Generate unique asset ID
function generateAssetId() {
    return crypto.randomBytes(8).toString('hex')
}

// Get file extension
function getFileExtension(filename) {
    return path.extname(filename).toLowerCase()
}

// Get asset folder name (audio stays singular, others get 's')
function getAssetFolder(type) {
    return type === 'audio' ? 'audio' : `${type}s`
}

// Validate asset type
function validateAssetType(file, expectedType) {
    const ext = getFileExtension(file.name)
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
    const videoExts = ['.mp4', '.webm', '.ogv', '.mov', '.avi', '.mkv']
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac']
    
    switch (expectedType) {
        case 'image': return imageExts.includes(ext)
        case 'video': return videoExts.includes(ext)
        case 'audio': return audioExts.includes(ext)
        default: return false
    }
}

function createWindow() {
    // Create the browser window.
    const win = new BrowserWindow({
        width: 1920,
        height: 1080,
        show: false, // Don't show until ready to prevent flash
        autoHideMenuBar: true, // Hide menu bar (Alt to show)
        webPreferences: {
            backgroundThrottling: false,
            // The preload script is a bridge between the Electron main process (Node.js)
            // and your web page's JavaScript (renderer process).
            preload: path.join(__dirname, 'preload.js'),
            // It's good practice for security to keep contextIsolation enabled.
            contextIsolation: true,
            // Security: disable Node.js integration in renderer
            nodeIntegration: false,
            // Security: block all remote content and network requests
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
            nativeWindowOpen: true,
        },
        icon: path.join(__dirname, 'favicon-32x32.png') // Set the window icon
    })

    // Basic background throttling disable
    win.webContents.setBackgroundThrottling(false)

    win.webContents.setWindowOpenHandler(({ url }) => {
        console.log('Window open handler called with URL:', url)

        // Allow only asset:// protocol and about:blank (for injected projector windows)
        if (!url.startsWith('asset://') && url !== 'about:blank') {
            console.log('Blocked attempt to open URL:', url)
            return { action: 'deny' }
        }

        console.log('Allowing window open for URL:', url)
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                icon: path.join(__dirname, 'favicon-32x32.png'),
                autoHideMenuBar: true,  // Hide menu bar for projector windows
                frame: true,           // Keep window frame but hide menu
                webPreferences: {
                    backgroundThrottling: false,
                    webSecurity: true,
                    allowRunningInsecureContent: false,
                    experimentalFeatures: false,
                    nativeWindowOpen: true,
                    // Additional security for child windows
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true
                }
            }
        }
    })

    // Block all remote network requests
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
        const url = details.url

        // Allow only specific local protocols and data URLs
        if (url.startsWith('asset://') ||
            url.startsWith('data:') ||
            url.startsWith('blob:') ||
            url.includes('localhost') ||
            url.includes('127.0.0.1')) {
            callback({ cancel: false })
            return
        }

        // Block all other requests
        console.log('Blocked network request to:', url)
        callback({ cancel: true })
    })

    // Add Content Security Policy to block remote content
    // SECURITY: Strict CSP for defense against XSS and injection attacks
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self' asset: data: blob:; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +  // unsafe-eval needed for shader compilation
                    "style-src 'self' 'unsafe-inline'; " +  // unsafe-inline needed for dynamic styles
                    "img-src 'self' asset: data: blob:; " +
                    "media-src 'self' asset: data: blob:; " +
                    "connect-src asset:; " +  // Allow fetching from asset protocol
                    "font-src 'self' data:; " +
                    "object-src 'none'; " +  // Block plugins
                    "frame-src 'none'; " +  // Block iframes
                    "frame-ancestors 'none'; " +  // Prevent framing
                    "base-uri 'self'; " +  // Restrict base tag
                    "form-action 'none'; " +  // Block form submissions
                    "upgrade-insecure-requests;"  // Force HTTPS where applicable
                ],
                'X-Content-Type-Options': ['nosniff'],
                'X-Frame-Options': ['DENY'],
                'X-XSS-Protection': ['1; mode=block'],
                'Referrer-Policy': ['no-referrer']
            }
        })
    })


    // Load your web application's entry point.
    win.loadFile('index.html')

    // Maximize window and show when ready
    win.once('ready-to-show', () => {
        win.maximize()
        win.show()
    })

    // Handle window close with custom confirmation modal
    win.on('close', async (event) => {
        // Prevent close initially to check for unsaved changes
        event.preventDefault()

        try {
            // Ask renderer to show custom modal and wait for user decision
            const shouldClose = await win.webContents.executeJavaScript(`
                (async () => {
                    if (typeof showCloseConfirmation === 'function') {
                        return await showCloseConfirmation();
                    }
                    return true; // Fallback: allow close if function not available
                })()
            `)

            if (shouldClose) {
                // Remove this listener to prevent infinite loop and close
                win.removeAllListeners('close')
                win.close()
            }
            // If shouldClose is false, do nothing - window stays open
        } catch (error) {
            console.warn('Error checking close confirmation:', error)
            // On error, don't close to be safe
        }
    })

    // Optional: Open the DevTools for debugging.
    // win.webContents.openDevTools();

    return win
}

// IPC Handlers for asset management
ipcMain.handle('copy-asset-from-path', async (event, filePath, type, thumbnailData) => {
    try {
        const wsPath = getWorkspacePath()
        await ensureDirectories()

        // Get file info
        const fileStats = await fs.stat(filePath)
        const fileName = path.basename(filePath)
        const extension = getFileExtension(fileName)

        // Validate file type
        if (!validateAssetType({name: fileName}, type)) {
            throw new Error(`Invalid file type for ${type}`)
        }

        const assetId = generateAssetId()
        const filename = `${assetId}${extension}`
        const folderName = getAssetFolder(type)
        const assetDir = path.join(wsPath, 'assets', folderName)
        const assetPath = path.join(assetDir, filename)

        // Ensure asset directory exists
        await fs.mkdir(assetDir, { recursive: true })

        // Copy file directly without loading into memory
        await fs.copyFile(filePath, assetPath)

        // Handle thumbnail for video files (if provided)
        if (type === 'video' && thumbnailData) {
            try {
                const thumbnailFilename = `${assetId}_thumb.png`
                const thumbnailPath = path.join(assetDir, thumbnailFilename)

                // Convert thumbnail data to buffer
                let thumbnailBuffer
                if (thumbnailData instanceof ArrayBuffer) {
                    thumbnailBuffer = Buffer.from(thumbnailData)
                } else if (thumbnailData.buffer instanceof ArrayBuffer) {
                    thumbnailBuffer = Buffer.from(thumbnailData.buffer, thumbnailData.byteOffset, thumbnailData.byteLength)
                } else {
                    thumbnailBuffer = Buffer.from(thumbnailData)
                }

                await fs.writeFile(thumbnailPath, thumbnailBuffer)
                console.log(`Thumbnail saved: ${thumbnailPath}`)
            } catch (error) {
                console.error('Failed to save video thumbnail:', error)
                // Continue without thumbnail - don't fail the entire upload
            }
        }

        // Create asset metadata
        const assetUrl = `asset://${folderName}/${filename}`
        const metadata = {
            id: assetId,
            originalName: fileName,
            type: type,
            extension: extension,
            size: fileStats.size,
            created: new Date().toISOString(),
            path: assetUrl,
            tags: []
        }

        const metadataPath = path.join(assetDir, `${assetId}.json`)
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))

        console.log(`Asset copied from path: ${assetPath}`)
        console.log(`Asset URL returned: ${assetUrl}`)
        return assetUrl
    } catch (error) {
        console.error('Failed to copy asset from path:', error)
        throw error
    }
})

ipcMain.handle('resolve-asset-path', async (event, assetPath) => {
    try {
        console.log(`Resolving asset path: ${assetPath}`)
        if (!assetPath.startsWith('asset://')) {
            throw new Error('Invalid asset path')
        }
        
        // For asset:// URLs, just pass them through - the protocol handler will resolve them
        console.log(`Asset resolved: ${assetPath}`)
        return assetPath
    } catch (error) {
        console.error('Failed to resolve asset path:', error)
        throw error
    }
})

ipcMain.handle('list-assets', async (event, type) => {
    try {
        const wsPath = getWorkspacePath()

        const folderName = getAssetFolder(type)
        const assetDir = path.join(wsPath, 'assets', folderName)
        
        try {
            const files = await fs.readdir(assetDir)
            const assets = []
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const metadataPath = path.join(assetDir, file)
                    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))

                    // For video assets, check if thumbnail exists
                    if (type === 'video') {
                        const assetId = metadata.id
                        const thumbnailFilename = `${assetId}_thumb.png`
                        const thumbnailPath = path.join(assetDir, thumbnailFilename)

                        try {
                            await fs.access(thumbnailPath)
                            metadata.thumbnailPath = `asset://videos/${thumbnailFilename}`
                        } catch {
                            // Thumbnail doesn't exist, that's fine
                            metadata.thumbnailPath = null
                        }
                    }

                    assets.push(metadata)
                }
            }
            
            return assets.sort((a, b) => new Date(b.created) - new Date(a.created))
        } catch {
            return []
        }
    } catch (error) {
        console.error('Failed to list assets:', error)
        return []
    }
})

ipcMain.handle('delete-asset', async (event, assetPath) => {
    try {
        const wsPath = getWorkspacePath()
        if (!wsPath || !assetPath.startsWith('asset://')) {
            console.error('Invalid workspace path or asset path:', wsPath, assetPath)
            return false
        }

        const url = new URL(assetPath)
        const relativePath = url.hostname + url.pathname
        const fullPath = path.join(wsPath, 'assets', relativePath)
        const assetId = path.basename(fullPath, path.extname(fullPath))
        const assetDir = path.dirname(fullPath)
        const metadataPath = path.join(assetDir, `${assetId}.json`)

        console.log(`Deleting asset: ${fullPath}`)

        // Delete asset file and metadata
        await fs.unlink(fullPath)
        console.log(`Deleted asset file: ${fullPath}`)

        await fs.unlink(metadataPath)
        console.log(`Deleted metadata: ${metadataPath}`)

        // For video assets, also delete thumbnail if it exists
        if (relativePath.startsWith('videos/')) {
            const thumbnailPath = path.join(assetDir, `${assetId}_thumb.png`)
            try {
                await fs.unlink(thumbnailPath)
                console.log(`Deleted video thumbnail: ${thumbnailPath}`)
            } catch (error) {
                // Thumbnail might not exist, that's fine
                console.log(`No thumbnail to delete for video asset: ${assetId}`)
            }
        }

        console.log(`Successfully deleted asset: ${assetPath}`)
        return true
    } catch (error) {
        console.error('Failed to delete asset:', error)
        return false
    }
})

ipcMain.handle('get-asset-info', async (event, assetPath) => {
    try {
        if (!assetPath.startsWith('asset://')) {
            return null
        }

        const wsPath = getWorkspacePath()
        const url = new URL(assetPath)
        const relativePath = url.hostname + url.pathname
        const fullPath = path.join(wsPath, 'assets', relativePath)
        const assetId = path.basename(fullPath, path.extname(fullPath))
        const assetDir = path.dirname(fullPath)
        const metadataPath = path.join(assetDir, `${assetId}.json`)

        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
        return metadata
    } catch (error) {
        console.error('Failed to get asset info:', error)
        return null
    }
})

ipcMain.handle('update-asset-info', async (event, assetPath, newInfo) => {
    try {
        if (!assetPath.startsWith('asset://')) {
            return false
        }

        const wsPath = getWorkspacePath()
        const url = new URL(assetPath)
        const relativePath = url.hostname + url.pathname
        const fullPath = path.join(wsPath, 'assets', relativePath)
        const assetId = path.basename(fullPath, path.extname(fullPath))
        const assetDir = path.dirname(fullPath)
        const metadataPath = path.join(assetDir, `${assetId}.json`)

        // Read existing metadata
        const existingMetadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))

        // Update only the specified fields (preserving other metadata)
        const updatedMetadata = {
            ...existingMetadata,
            // Ensure backward compatibility for tags
            tags: existingMetadata.tags || [],
            ...newInfo,
            // Ensure we don't overwrite critical system fields
            path: existingMetadata.path,
            filename: existingMetadata.filename,
            created: existingMetadata.created,
            type: existingMetadata.type
        }

        // Write updated metadata back to file
        await fs.writeFile(metadataPath, JSON.stringify(updatedMetadata, null, 2))

        console.log(`Updated asset metadata: ${assetPath}`)
        return true
    } catch (error) {
        console.error('Failed to update asset info:', error)
        return false
    }
})

ipcMain.handle('get-workspace-path', async () => {
    return getWorkspacePath()
})

// Note: Using standard web beforeunload handling instead of custom close dialogs


ipcMain.handle('create-workspace', async (event, wsPath) => {
    return await ensureDirectories()
})

// Patch file management IPC handlers
ipcMain.handle('save-patch-file', async (event, patchData, filename, folderName = null) => {
    try {
        const wsPath = getWorkspacePath()
        await ensureDirectories()

        let patchesDir = path.join(wsPath, 'patches')

        // If a folder is specified, create subdirectory path
        if (folderName && folderName.trim() !== '') {
            patchesDir = path.join(patchesDir, folderName)
        }

        // Ensure the target directory exists
        await fs.mkdir(patchesDir, { recursive: true })
        
        // Ensure filename has .svs extension
        const cleanFilename = filename.endsWith('.svs') ? filename : `${filename}.svs`
        const patchPath = path.join(patchesDir, cleanFilename)
        
        // Add save timestamp to patch metadata
        if (!patchData.meta) patchData.meta = {}
        patchData.meta.savedAt = new Date().toISOString()
        
        await fs.writeFile(patchPath, JSON.stringify(patchData, null, 2))
        console.log(`Patch saved: ${patchPath}`)
        return patchPath
    } catch (error) {
        console.error('Failed to save patch file:', error)
        throw error
    }
})

ipcMain.handle('list-patch-files', async (event, folderName = null) => {
    try {
        const wsPath = getWorkspacePath()
        const patchesDir = path.join(wsPath, 'patches')

        try {
            if (folderName === null) {
                // List patches in root directory only
                const files = await fs.readdir(patchesDir)
                const patches = []

                for (const file of files) {
                    if (file.endsWith('.svs')) {
                        try {
                            const patchPath = path.join(patchesDir, file)
                            const stats = await fs.stat(patchPath)
                            const content = await fs.readFile(patchPath, 'utf8')
                            const patchData = JSON.parse(content)

                            patches.push({
                                filename: file,
                                path: patchPath,
                                folder: null,
                                data: patchData,
                                modified: stats.mtime.toISOString(),
                                size: stats.size
                            })
                        } catch (err) {
                            console.warn(`Skipping invalid patch file ${file}:`, err.message)
                        }
                    }
                }

                return patches.sort((a, b) => new Date(b.modified) - new Date(a.modified))
            } else if (folderName) {
                // List patches in a specific subfolder
                const folderPath = path.join(patchesDir, folderName)
                const files = await fs.readdir(folderPath)
                const patches = []

                for (const file of files) {
                    if (file.endsWith('.svs')) {
                        try {
                            const patchPath = path.join(folderPath, file)
                            const stats = await fs.stat(patchPath)
                            const content = await fs.readFile(patchPath, 'utf8')
                            const patchData = JSON.parse(content)

                            patches.push({
                                filename: file,
                                path: patchPath,
                                folder: folderName,
                                data: patchData,
                                modified: stats.mtime.toISOString(),
                                size: stats.size
                            })
                        } catch (err) {
                            console.warn(`Skipping invalid patch file ${file}:`, err.message)
                        }
                    }
                }

                return patches.sort((a, b) => new Date(b.modified) - new Date(a.modified))
            } else {
                // List all patches from root patches directory and subfolders
                const items = await fs.readdir(patchesDir, { withFileTypes: true })
                const patches = []

                for (const item of items) {
                    if (item.isFile() && item.name.endsWith('.svs')) {
                        // Root level patch file
                        try {
                            const patchPath = path.join(patchesDir, item.name)
                            const stats = await fs.stat(patchPath)
                            const content = await fs.readFile(patchPath, 'utf8')
                            const patchData = JSON.parse(content)

                            patches.push({
                                filename: item.name,
                                path: patchPath,
                                folder: null,
                                data: patchData,
                                modified: stats.mtime.toISOString(),
                                size: stats.size
                            })
                        } catch (err) {
                            console.warn(`Skipping invalid patch file ${item.name}:`, err.message)
                        }
                    } else if (item.isDirectory()) {
                        // Subfolder - scan for patches
                        try {
                            const subfolderPath = path.join(patchesDir, item.name)
                            const subFiles = await fs.readdir(subfolderPath)

                            for (const subFile of subFiles) {
                                if (subFile.endsWith('.svs')) {
                                    try {
                                        const patchPath = path.join(subfolderPath, subFile)
                                        const stats = await fs.stat(patchPath)
                                        const content = await fs.readFile(patchPath, 'utf8')
                                        const patchData = JSON.parse(content)

                                        patches.push({
                                            filename: subFile,
                                            path: patchPath,
                                            folder: item.name,
                                            data: patchData,
                                            modified: stats.mtime.toISOString(),
                                            size: stats.size
                                        })
                                    } catch (err) {
                                        console.warn(`Skipping invalid patch file ${item.name}/${subFile}:`, err.message)
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn(`Failed to read subfolder ${item.name}:`, err.message)
                        }
                    }
                }

                return patches.sort((a, b) => new Date(b.modified) - new Date(a.modified))
            }
        } catch {
            return []
        }
    } catch (error) {
        console.error('Failed to list patch files:', error)
        return []
    }
})

// List patch folders
ipcMain.handle('list-patch-folders', async (event) => {
    try {
        const wsPath = getWorkspacePath()
        const patchesDir = path.join(wsPath, 'patches')

        try {
            const items = await fs.readdir(patchesDir, { withFileTypes: true })
            const folders = []

            // Count patches in root directory
            let rootPatchCount = 0
            for (const item of items) {
                if (item.isFile() && item.name.endsWith('.svs')) {
                    rootPatchCount++
                }
            }

            // Add root folder if it has patches
            if (rootPatchCount > 0) {
                folders.push({
                    name: null, // null indicates root folder
                    displayName: 'Root',
                    patchCount: rootPatchCount
                })
            }

            // Add subfolders
            for (const item of items) {
                if (item.isDirectory()) {
                    try {
                        const subfolderPath = path.join(patchesDir, item.name)
                        const subFiles = await fs.readdir(subfolderPath)
                        const patchCount = subFiles.filter(file => file.endsWith('.svs')).length

                        if (patchCount > 0) {
                            folders.push({
                                name: item.name,
                                displayName: item.name,
                                patchCount: patchCount
                            })
                        }
                    } catch (err) {
                        console.warn(`Failed to read subfolder ${item.name}:`, err.message)
                    }
                }
            }

            return folders.sort((a, b) => {
                // Root folder first, then alphabetical
                if (a.name === null) return -1
                if (b.name === null) return 1
                return a.name.localeCompare(b.name)
            })
        } catch {
            return []
        }
    } catch (error) {
        console.error('Failed to list patch folders:', error)
        return []
    }
})

ipcMain.handle('load-patch-file', async (event, filename) => {
    try {
        const wsPath = getWorkspacePath()
        
        const patchPath = path.join(wsPath, 'patches', filename)
        const content = await fs.readFile(patchPath, 'utf8')
        const patchData = JSON.parse(content)
        
        console.log(`Patch loaded: ${patchPath}`)
        return patchData
    } catch (error) {
        console.error('Failed to load patch file:', error)
        throw error
    }
})

ipcMain.handle('delete-patch-file', async (event, filename) => {
    try {
        const wsPath = getWorkspacePath()
        
        const patchPath = path.join(wsPath, 'patches', filename)
        await fs.unlink(patchPath)
        console.log(`Patch deleted: ${patchPath}`)
        return true
    } catch (error) {
        console.error('Failed to delete patch file:', error)
        return false
    }
})

ipcMain.handle('load-patch-from-path', async (event, filePath) => {
    try {
        const content = await fs.readFile(filePath, 'utf8')
        const patchData = JSON.parse(content)
        console.log(`External patch loaded: ${filePath}`)
        return patchData
    } catch (error) {
        console.error('Failed to load patch from path:', error)
        throw error
    }
})

ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(options)
    return result
})

ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(options)
    return result
})

ipcMain.handle('open-external', async (event, url) => {
    try {
        // Security: only allow http/https URLs to prevent local file access
        if (url.startsWith('http://') || url.startsWith('https://')) {
            await shell.openExternal(url)
            return true
        } else {
            console.error('Blocked attempt to open non-http URL:', url)
            return false
        }
    } catch (error) {
        console.error('Failed to open external URL:', error)
        return false
    }
})


// Handle command line arguments for opening .svs files
function handleFileOpen(filePath) {
    if (filePath && filePath.endsWith('.svs')) {
        // Send file path to renderer once it's ready
        const windows = BrowserWindow.getAllWindows()
        if (windows.length > 0) {
            windows[0].webContents.send('open-patch-file', filePath)
        } else {
            // Store for later if no window exists yet
            app.commandLineFile = filePath
        }
    }
}

// Handle file association on Windows/Linux
if (process.platform === 'win32' || process.platform === 'linux') {
    const args = process.argv.slice(1)
    if (args.length > 0 && args[0].endsWith('.svs')) {
        handleFileOpen(args[0])
    }
}

// Handle drag & drop and double-click on macOS  
app.on('open-file', (event, filePath) => {
    event.preventDefault()
    handleFileOpen(filePath)
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
    // Ensure required directories exist
    const wsPath = getWorkspacePath()
    console.log('WORKSPACE PATH:', wsPath)

    const success = await ensureDirectories()
    if (!success) {
        console.error('CRITICAL: Failed to create directories!')
        app.quit()
        return
    }
    
    // Register asset protocol for secure file access with video seeking support
    protocol.registerFileProtocol('asset', (request, callback) => {
        try {
            const wsPath = getWorkspacePath()
            
            const url = new URL(request.url)
            // For asset://videos/filename.mp4: hostname="videos", pathname="/filename.mp4"
            const relativePath = url.hostname + url.pathname
            console.log(`Asset protocol called with URL: ${request.url}`)
            console.log(`Relative path: ${relativePath}`)
            const assetPath = path.join(wsPath, 'assets', relativePath)
            console.log(`Looking for file at: ${assetPath}`)
            
            // Security: ensure path is within assets directory
            const normalizedAssetPath = path.normalize(assetPath)
            const normalizedWorkspacePath = path.normalize(path.join(wsPath, 'assets'))
            if (!normalizedAssetPath.startsWith(normalizedWorkspacePath)) {
                throw new Error('Access denied: path outside assets directory')
            }
            
            // Check if file exists synchronously (registerFileProtocol doesn't support async)
            try {
                require('fs').accessSync(assetPath)
                console.log(`Asset protocol success: ${assetPath}`)
                callback({ path: assetPath })
            } catch {
                console.error('Asset file not found:', assetPath)
                callback({ error: -6 }) // FILE_NOT_FOUND
            }
        } catch (error) {
            console.error('Asset protocol error:', error)
            callback({ error: -2 }) // GENERIC_FAILURE
        }
    })


    console.log('🪟 About to create main window...')
    const mainWindow = createWindow()
    console.log('🪟 Main window created successfully')
    
    // Handle command line file argument after window is created
    if (app.commandLineFile) {
        mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.webContents.send('open-patch-file', app.commandLineFile)
            delete app.commandLineFile
        })
    }

    // This is for macOS. On macOS it's common to re-create a window in the
    // app when the dock icon is clicked and there are no other windows open.
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
    
})

// This is for Windows & Linux. Quit when all windows are closed.
app.on('window-all-closed', () => {
    // macOS: keep app active until explicit quit (Cmd + Q)
    if (process.platform !== 'darwin') {
        app.quit()
    }
})