// AssetManager - Dual-mode asset handling for web and Electron
// Preserves browser-ready deployment while adding Electron asset persistence

// Environment detection
const isElectron = typeof window !== 'undefined' && window.electronAPI
const isWeb = !isElectron

/**
 * Unified asset management that works in both browser and Electron environments
 */
export const AssetManager = {
    /**
     * Copy a file to the assets folder (Electron) or create blob URL (web)
     * @param {Object} file - File data object with {name, size, type, data} properties
     * @param {string} type - Asset type: 'image', 'video', 'audio'
     * @returns {Promise<string>} Asset path or blob URL
     */
    async copyToAssets(file, type = 'image') {
        if (isElectron) {
            try {
                // Expect the same format as nodes use: {name, size, type, data}
                const assetPath = await window.electronAPI.copyAsset(file, type)
                console.log(`Asset copied to: ${assetPath}`)
                return assetPath
            } catch (error) {
                console.error('Failed to copy asset in Electron:', error)
                // Fallback to blob URL if Electron copy fails
                const blob = new Blob([file.data], { type: file.type })
                return URL.createObjectURL(blob)
            }
        } else {
            // Web mode: create blob URL from the data
            const blob = new Blob([file.data], { type: file.type })
            return URL.createObjectURL(blob)
        }
    },

    /**
     * Load an asset by path - resolves asset:// URLs in Electron, passes through blob URLs in web
     * @param {string} assetPath - Asset path or blob URL
     * @returns {Promise<string>} Resolved file path/URL
     */
    async loadAsset(assetPath) {
        if (isElectron && assetPath.startsWith('asset://')) {
            try {
                const resolvedPath = await window.electronAPI.resolveAssetPath(assetPath)
                return resolvedPath
            } catch (error) {
                console.error('Failed to resolve asset path:', error)
                return null
            }
        } else {
            // Web mode or regular URLs: pass through unchanged
            return assetPath
        }
    },

    /**
     * List all available assets of a given type (Electron only)
     * @param {string} type - Asset type: 'image', 'video', 'audio'
     * @returns {Promise<Array>} List of asset info objects
     */
    async listAssets(type = 'image') {
        if (isElectron) {
            try {
                return await window.electronAPI.listAssets(type)
            } catch (error) {
                console.error('Failed to list assets:', error)
                return []
            }
        } else {
            // Web mode: no persistent assets
            return []
        }
    },

    /**
     * Update asset metadata (Electron only)
     * @param {string} assetPath - Asset path to update
     * @param {Object} newInfo - Updated asset info
     * @returns {Promise<boolean>} Success status
     */
    async updateAssetInfo(assetPath, newInfo) {
        if (isElectron && assetPath.startsWith('asset://')) {
            try {
                return await window.electronAPI.updateAssetInfo(assetPath, newInfo)
            } catch (error) {
                console.error('Failed to update asset info:', error)
                return false
            }
        }
        return false
    },

    /**
     * Delete an asset (Electron only)
     * @param {string} assetPath - Asset path to delete
     * @returns {Promise<boolean>} Success status
     */
    async deleteAsset(assetPath) {
        if (isElectron && assetPath.startsWith('asset://')) {
            try {
                return await window.electronAPI.deleteAsset(assetPath)
            } catch (error) {
                console.error('Failed to delete asset:', error)
                return false
            }
        } else {
            // Web mode: revoke blob URL
            if (assetPath.startsWith('blob:')) {
                URL.revokeObjectURL(assetPath)
                return true
            }
            return false
        }
    },

    /**
     * Get asset info (Electron only)
     * @param {string} assetPath - Asset path
     * @returns {Promise<Object|null>} Asset info or null
     */
    async getAssetInfo(assetPath) {
        if (isElectron && assetPath.startsWith('asset://')) {
            try {
                return await window.electronAPI.getAssetInfo(assetPath)
            } catch (error) {
                console.error('Failed to get asset info:', error)
                return null
            }
        }
        return null
    },

    /**
     * Generate video thumbnail and save as PNG file
     * @param {File|Blob} videoFile - Video file data
     * @param {string} assetId - Asset identifier for naming
     * @returns {Promise<ArrayBuffer|null>} Thumbnail data or null on failure
     */
    async generateVideoThumbnail(videoFile, assetId) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video')
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')

            video.onloadeddata = () => {
                // Set thumbnail size (160x90 for 16:9 aspect ratio)
                canvas.width = 160
                canvas.height = 90

                // Seek to 1 second for thumbnail (avoid black frames)
                video.currentTime = Math.min(2.0, video.duration * 0.1)
            }

            video.onseeked = async () => {
                try {
                    // Draw video frame to canvas
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

                    // Convert to blob (PNG format)
                    canvas.toBlob(async (blob) => {
                        if (blob) {
                            try {
                                const arrayBuffer = await blob.arrayBuffer()
                                resolve(arrayBuffer)
                            } catch (error) {
                                console.error('Failed to convert thumbnail to ArrayBuffer:', error)
                                resolve(null)
                            }
                        } else {
                            resolve(null)
                        }
                    }, 'image/png')
                } catch (error) {
                    console.error('Failed to generate thumbnail:', error)
                    resolve(null)
                }
            }

            video.onerror = (error) => {
                console.error('Video loading error:', error)
                resolve(null)
            }

            // Create object URL from file
            if (videoFile instanceof File) {
                video.src = URL.createObjectURL(videoFile)
            } else if (videoFile instanceof Blob) {
                video.src = URL.createObjectURL(videoFile)
            } else {
                reject(new Error('Invalid video file type'))
            }
        })
    },

    /**
     * Check if running in Electron environment
     * @returns {boolean} True if Electron, false if web
     */
    isElectronMode() {
        return isElectron
    },

    /**
     * Get appropriate file protocol for loading assets
     * @param {string} assetPath - Asset path
     * @returns {Promise<string>} Appropriate URL for loading
     */
    async getLoadableUrl(assetPath) {
        if (isElectron && assetPath.startsWith('asset://')) {
            // Validate asset path through IPC (returns same asset:// URL)
            try {
                return await this.loadAsset(assetPath)
            } catch (error) {
                console.error('Failed to resolve loadable URL:', error)
                return assetPath
            }
        }
        return assetPath
    },

    /**
     * Delete an asset with confirmation
     */
    async deleteAssetWithConfirmation(assetPath, assetInfo) {
        const confirmMessage = `Delete "${assetInfo.originalName}"?\n\nThis cannot be undone.`
        if (confirm(confirmMessage)) {
            try {
                await this.deleteAsset(assetPath)
                return true
            } catch (error) {
                console.error('Failed to delete asset:', error)
                alert('Failed to delete asset. Please try again.')
                return false
            }
        }
        return false
    },

    /**
     * Show global asset manager window
     * @param {Object} options - Configuration options
     * @param {string} options.nodeType - Optional node type for selection mode ('image', 'video', 'audio')
     * @param {Function} options.onSelect - Optional callback when asset is selected (assetPath, assetInfo) => {}
     */
    async showGlobalAssetManager(options = {}) {
        const { nodeType = null, onSelect = null } = options
        if (!isElectron) {
            alert('Asset manager is only available in Electron mode')
            return
        }

        try {
            // Create main overlay
            const overlay = document.createElement('div')
            overlay.className = 'global-asset-manager-overlay'
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 2000;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            `

            // Create main window
            const window = document.createElement('div')
            window.className = 'global-asset-manager-window'
            window.style.cssText = `
                background: var(--bg-primary);
                border: 1px solid var(--border-normal);
                border-radius: 12px;
                width: 90vw;
                height: 80vh;
                max-width: 1200px;
                max-height: 800px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 0 20px 60px var(--shadow-primary);
                color: var(--text-primary);
            `

            // Create header
            const header = document.createElement('div')
            header.style.cssText = `
                padding: 16px 24px;
                border-bottom: 1px solid var(--border-normal);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: var(--bg-secondary);
            `

            const title = document.createElement('h2')
            title.textContent = nodeType ? `📂 Select ${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} Asset` : '📂 Asset Manager'
            title.style.cssText = `
                margin: 0;
                color: var(--text-primary);
                font-size: 18px;
                font-weight: 600;
            `

            // Create header controls container
            const headerControls = document.createElement('div')
            headerControls.style.cssText = `
                display: flex;
                gap: 12px;
                align-items: center;
            `

            // Upload button (available in both modes)
            const uploadBtn = document.createElement('button')
                uploadBtn.textContent = '➕ Upload'
                uploadBtn.style.cssText = `
                    padding: 8px 16px;
                    background: var(--primary-color);
                    border: none;
                    border-radius: 6px;
                    color: white;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: background 0.2s;
                `
                uploadBtn.addEventListener('mouseenter', () => {
                    uploadBtn.style.background = 'var(--primary-dark)'
                })
                uploadBtn.addEventListener('mouseleave', () => {
                    uploadBtn.style.background = 'var(--primary-color)'
                })
                headerControls.appendChild(uploadBtn)

            const closeBtn = document.createElement('button')
            closeBtn.textContent = '✕ Close'
            closeBtn.style.cssText = `
                padding: 8px 16px;
                background: var(--bg-interactive);
                border: 1px solid var(--border-normal);
                border-radius: 6px;
                color: var(--text-primary);
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            `
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.background = 'var(--bg-hover)'
            })
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.background = 'var(--bg-interactive)'
            })
            closeBtn.onclick = () => overlay.remove()
            headerControls.appendChild(closeBtn)

            header.appendChild(title)
            header.appendChild(headerControls)

            // Create hidden file input for uploads
            const fileInput = document.createElement('input')
            fileInput.type = 'file'
            fileInput.style.display = 'none'
            fileInput.multiple = true
            document.body.appendChild(fileInput)

            // Upload functionality
            const handleFileUpload = async (files, targetType = null) => {
                if (!files || files.length === 0) return

                const uploadPromises = []

                for (const file of files) {
                    // Determine file type
                    let fileType = 'image'
                    if (file.type.startsWith('video/')) {
                        fileType = 'video'
                    } else if (file.type.startsWith('audio/')) {
                        fileType = 'audio'
                    }

                    // If we have a target type (from tab), only upload matching files
                    if (targetType && fileType !== targetType) {
                        continue
                    }

                    try {
                        // Prepare asset data
                        const assetData = {
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            data: await file.arrayBuffer()
                        }

                        // For video files, generate thumbnail
                        if (fileType === 'video') {
                            try {
                                const thumbnailData = await this.generateVideoThumbnail(file)
                                if (thumbnailData) {
                                    assetData.thumbnailData = thumbnailData
                                }
                            } catch (error) {
                                console.warn(`Failed to generate thumbnail for ${file.name}:`, error)
                                // Continue without thumbnail
                            }
                        }

                        // Call it exactly like the nodes do
                        const assetPath = await this.copyToAssets(assetData, fileType)
                        uploadPromises.push({ success: true, fileName: file.name, assetPath, type: fileType })
                        console.log(`Successfully uploaded: ${file.name} -> ${assetPath}`)
                    } catch (error) {
                        console.error(`Failed to upload ${file.name}:`, error)
                        uploadPromises.push({ success: false, fileName: file.name, error: error.message || error })
                    }
                }

                // Refresh the current tab to show new uploads
                if (uploadPromises.length > 0) {
                    await loadTabContent(activeTab)

                    // Show success message
                    const successCount = uploadPromises.filter(p => p.success).length
                    const failCount = uploadPromises.filter(p => !p.success).length

                    if (successCount > 0 && failCount === 0) {
                        console.log(`Successfully uploaded ${successCount} file(s)`)
                    } else if (successCount > 0 && failCount > 0) {
                        const failedFiles = uploadPromises.filter(p => !p.success).map(p => `${p.fileName}: ${p.error}`).join('\n')
                        alert(`Uploaded ${successCount} file(s), ${failCount} failed:\n\n${failedFiles}`)
                    } else {
                        const failedFiles = uploadPromises.filter(p => !p.success).map(p => `${p.fileName}: ${p.error}`).join('\n')
                        alert(`Failed to upload ${failCount} file(s):\n\n${failedFiles}`)
                    }
                }
            }

            // Connect upload button to file input
                uploadBtn.onclick = () => {
                    // Set file type filter based on active tab
                    const acceptTypes = {
                        'image': 'image/*',
                        'video': 'video/*',
                        'audio': 'audio/*'
                    }
                    fileInput.accept = acceptTypes[activeTab] || 'image/*,video/*,audio/*'
                    fileInput.click()
                }

                fileInput.onchange = async (e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        await handleFileUpload(Array.from(e.target.files), activeTab)
                        e.target.value = '' // Reset input
                    }
                }

            // Create tab bar
            const tabBar = document.createElement('div')
            tabBar.style.cssText = `
                display: flex;
                border-bottom: 1px solid var(--border-normal);
                background: var(--bg-secondary);
            `

            const tabs = [
                { name: 'Images', type: 'image', icon: '🖼️' },
                { name: 'Videos', type: 'video', icon: '📼' },
                { name: 'Audio', type: 'audio', icon: '🔊' }
            ]

            let activeTab = nodeType || 'image'
            const tabElements = []

            // Create main content container (holds both content area and edit panel)
            const mainContainer = document.createElement('div')
            mainContainer.style.cssText = `
                flex: 1;
                display: flex;
                overflow: hidden;
                background: var(--bg-tertiary);
            `

            // Create content area
            const contentArea = document.createElement('div')
            contentArea.className = 'asset-content-area'
            contentArea.style.cssText = `
                flex: 1;
                overflow: auto;
                padding: 24px;
                background: var(--bg-tertiary);
                transition: flex 0.3s ease;
                min-height: 0;
            `

            // Create edit panel (initially hidden)
            const editPanel = document.createElement('div')
            editPanel.className = 'asset-edit-panel'
            editPanel.style.cssText = `
                width: 0;
                overflow: hidden;
                background: var(--bg-secondary);
                border-left: 1px solid var(--border-normal);
                transition: width 0.3s ease;
                display: flex;
                flex-direction: column;
            `

            mainContainer.appendChild(contentArea)
            mainContainer.appendChild(editPanel)

            tabs.forEach((tab, index) => {
                const tabElement = document.createElement('button')
                tabElement.className = 'asset-tab'

                const isActiveTab = tab.type === activeTab
                const isDisabled = nodeType && tab.type !== nodeType

                tabElement.style.cssText = `
                    padding: 12px 20px;
                    border: none;
                    background: ${isActiveTab ? 'var(--bg-tertiary)' : 'transparent'};
                    color: ${isDisabled ? 'var(--text-disabled)' : 'var(--text-primary)'};
                    cursor: ${isDisabled ? 'not-allowed' : 'pointer'};
                    font-size: 14px;
                    border-bottom: 3px solid ${isActiveTab ? 'var(--primary-color)' : 'transparent'};
                    opacity: ${isDisabled ? '0.5' : '1'};
                `
                tabElement.innerHTML = `${tab.icon} ${tab.name}`
                
                tabElement.addEventListener('click', async () => {
                    if (isDisabled) return // Don't allow clicking disabled tabs

                    // Update tab appearances
                    tabElements.forEach((el, i) => {
                        el.style.background = 'transparent'
                        el.style.borderBottomColor = 'transparent'
                    })
                    tabElement.style.background = 'var(--bg-tertiary)'
                    tabElement.style.borderBottomColor = 'var(--primary-color)'

                    activeTab = tab.type
                    await loadTabContent(tab.type)
                })

                // Add hover effect (only for enabled tabs)
                if (!isDisabled) {
                    tabElement.addEventListener('mouseenter', () => {
                        if (tabElement.style.borderBottomColor !== getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim()) {
                            tabElement.style.background = 'var(--bg-hover)'
                        }
                    })
                    tabElement.addEventListener('mouseleave', () => {
                        if (tabElement.style.borderBottomColor !== getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim()) {
                            tabElement.style.background = 'transparent'
                        }
                    })
                }

                tabElements.push(tabElement)
                tabBar.appendChild(tabElement)
            })

            // Create filter bar
            const filterBar = document.createElement('div')
            filterBar.style.cssText = `
                padding: 12px 24px;
                border-bottom: 1px solid var(--border-normal);
                background: var(--bg-tertiary);
                display: flex;
                align-items: center;
                gap: 12px;
            `

            const filterLabel = document.createElement('label')
            filterLabel.textContent = 'Filter by tags:'
            filterLabel.style.cssText = `
                color: var(--text-secondary);
                font-size: 12px;
                font-family: monospace;
                white-space: nowrap;
            `

            const filterContainer = document.createElement('div')
            filterContainer.id = 'filter-tags-container'
            filterContainer.style.cssText = `
                flex: 1;
                min-height: 32px;
                padding: 4px 8px;
                background: var(--bg-interactive);
                border: 1px solid var(--border-normal);
                border-radius: 4px;
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                align-items: flex-start;
                cursor: text;
            `

            const filterInput = document.createElement('input')
            filterInput.type = 'text'
            filterInput.id = 'filter-tag-input'
            filterInput.placeholder = 'Add tag filter...'
            filterInput.style.cssText = `
                border: none;
                background: none;
                outline: none;
                color: var(--text-primary);
                font-family: monospace;
                font-size: 12px;
                flex: 1;
                min-width: 120px;
                padding: 2px;
            `
            filterInput.maxLength = 20

            filterContainer.appendChild(filterInput)
            filterBar.appendChild(filterLabel)
            filterBar.appendChild(filterContainer)

            // Global filter state
            const activeFilters = new Set()

            // Create filter tag functionality
            const createFilterTag = (tagText) => {
                const tagEl = document.createElement('div')
                tagEl.className = 'filter-tag-item'
                tagEl.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 2px 6px;
                    background: var(--primary-color);
                    color: white;
                    border-radius: 12px;
                    font-size: 11px;
                    font-family: monospace;
                    white-space: nowrap;
                    max-width: 120px;
                `

                const textSpan = document.createElement('span')
                textSpan.textContent = tagText
                textSpan.style.cssText = `
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                `

                const removeBtn = document.createElement('button')
                removeBtn.textContent = '×'
                removeBtn.style.cssText = `
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: bold;
                    padding: 0;
                    width: 14px;
                    height: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: background 0.15s;
                `

                removeBtn.addEventListener('mouseenter', () => {
                    removeBtn.style.background = 'var(--bg-hover)'
                })
                removeBtn.addEventListener('mouseleave', () => {
                    removeBtn.style.background = 'none'
                })

                removeBtn.onclick = () => {
                    activeFilters.delete(tagText)
                    tagEl.remove()
                    // Refresh the current tab content with new filters
                    loadTabContent(activeTab)
                }

                tagEl.appendChild(textSpan)
                tagEl.appendChild(removeBtn)
                return tagEl
            }

            // Add filter tag functionality
            const addFilterTag = () => {
                const tagText = filterInput.value.trim()
                if (tagText && !activeFilters.has(tagText) && tagText.length <= 20) {
                    activeFilters.add(tagText)
                    const tagEl = createFilterTag(tagText)
                    filterContainer.insertBefore(tagEl, filterInput)
                    filterInput.value = ''
                    // Refresh the current tab content with new filters
                    loadTabContent(activeTab)
                }
            }

            // Filter input events
            filterInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    addFilterTag()
                } else if (e.key === 'Backspace' && filterInput.value === '' && activeFilters.size > 0) {
                    // Remove last filter if backspace on empty input
                    const lastFilter = Array.from(activeFilters).pop()
                    activeFilters.delete(lastFilter)
                    const filterElements = filterContainer.querySelectorAll('.filter-tag-item')
                    if (filterElements.length > 0) {
                        filterElements[filterElements.length - 1].remove()
                        // Refresh the current tab content with new filters
                        loadTabContent(activeTab)
                    }
                }
            })

            // Focus filter input when clicking container
            filterContainer.addEventListener('click', (e) => {
                if (e.target === filterContainer) {
                    filterInput.focus()
                }
            })

            // Show edit panel function
            const showEditPanel = (asset, nameEl) => {
                // Create edit panel content
                editPanel.innerHTML = `
                    <div style="padding: 20px; flex: 1; display: flex; flex-direction: column; overflow-y: auto;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h3 style="margin: 0; color: var(--text-primary); font-size: 16px;">Edit Asset</h3>
                            <button id="close-edit-panel" style="
                                background: none;
                                border: none;
                                color: var(--text-secondary);
                                cursor: pointer;
                                font-size: 18px;
                                padding: 4px;
                            ">✕</button>
                        </div>

                        <div style="margin-bottom: 20px;">
                            <div style="display: flex; justify-content: center; margin-bottom: 15px;">
                                <div style="
                                    width: 120px;
                                    height: 120px;
                                    background: var(--bg-secondary);
                                    border: 1px solid var(--border-normal);
                                    border-radius: 8px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    overflow: hidden;
                                " id="edit-preview"></div>
                            </div>
                        </div>

                        <div style="margin-bottom: 15px;">
                            <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 5px; font-family: monospace;">
                                Display Name
                            </label>
                            <input type="text" id="asset-name-input" value="${asset.originalName}" style="
                                width: 100%;
                                padding: 8px;
                                background: var(--bg-interactive);
                                border: 1px solid var(--border-normal);
                                border-radius: 4px;
                                color: var(--text-primary);
                                font-family: monospace;
                                font-size: 14px;
                                box-sizing: border-box;
                            ">
                        </div>

                        <div style="margin-bottom: 15px;">
                            <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 5px; font-family: monospace;">
                                Tags
                            </label>
                            <div id="tags-container" style="
                                min-height: 40px;
                                padding: 6px;
                                background: var(--bg-interactive);
                                border: 1px solid var(--border-normal);
                                border-radius: 4px;
                                display: flex;
                                flex-wrap: wrap;
                                gap: 4px;
                                align-items: flex-start;
                                cursor: text;
                            ">
                                <input type="text" id="tag-input" placeholder="Add tag..." style="
                                    border: none;
                                    background: none;
                                    outline: none;
                                    color: var(--text-primary);
                                    font-family: monospace;
                                    font-size: 12px;
                                    flex: 1;
                                    min-width: 80px;
                                    padding: 2px;
                                " maxlength="20">
                            </div>
                            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px; font-family: monospace;">
                                Press Enter to add tag, click × to remove
                            </div>
                        </div>

                        <div style="margin-bottom: 15px;">
                            <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 5px; font-family: monospace;">
                                File Path
                            </label>
                            <div style="
                                padding: 8px;
                                background: var(--bg-secondary);
                                border: 1px solid var(--border-subtle);
                                border-radius: 4px;
                                color: var(--text-secondary);
                                font-family: monospace;
                                font-size: 12px;
                                word-break: break-all;
                            ">${asset.path}</div>
                        </div>

                        <div style="margin-top: auto; display: flex; gap: 10px;">
                            <button id="save-asset-changes" style="
                                flex: 1;
                                padding: 10px;
                                background: var(--primary-color);
                                border: none;
                                border-radius: 6px;
                                color: white;
                                font-weight: 600;
                                cursor: pointer;
                                transition: background 0.2s;
                            ">Save Changes</button>
                            <button id="cancel-edit" style="
                                padding: 10px 20px;
                                background: var(--bg-interactive);
                                border: 1px solid var(--border-normal);
                                border-radius: 6px;
                                color: var(--text-secondary);
                                cursor: pointer;
                                transition: background 0.2s;
                            ">Cancel</button>
                        </div>
                    </div>
                `

                // Set up preview
                const editPreview = editPanel.querySelector('#edit-preview')
                if (asset.type === 'image') {
                    this.getLoadableUrl(asset.path).then(loadableUrl => {
                        const img = document.createElement('img')
                        img.src = loadableUrl
                        img.style.cssText = `
                            width: 100%;
                            height: 100%;
                            object-fit: cover;
                            border-radius: 6px;
                        `
                        img.onerror = () => {
                            editPreview.innerHTML = '<span style="font-size: 32px;">🖼️</span>'
                        }
                        editPreview.appendChild(img)
                    }).catch(() => {
                        editPreview.innerHTML = '<span style="font-size: 32px;">🖼️</span>'
                    })
                } else if (asset.type === 'video' && asset.thumbnailPath) {
                    // Use video thumbnail if available
                    this.getLoadableUrl(asset.thumbnailPath).then(thumbnailUrl => {
                        const img = document.createElement('img')
                        img.src = thumbnailUrl
                        img.style.cssText = `
                            width: 100%;
                            height: 100%;
                            object-fit: cover;
                            border-radius: 6px;
                        `
                        img.onerror = () => {
                            editPreview.innerHTML = '<span style="font-size: 32px;">📼</span>'
                        }
                        editPreview.appendChild(img)
                    }).catch(() => {
                        editPreview.innerHTML = '<span style="font-size: 32px;">📼</span>'
                    })
                } else {
                    editPreview.innerHTML = `<span style="font-size: 32px;">${asset.type === 'video' ? '📼' : '🔊'}</span>`
                }

                // Initialize tags functionality
                const tagsContainer = editPanel.querySelector('#tags-container')
                const tagInput = editPanel.querySelector('#tag-input')
                const currentTags = new Set(asset.tags || [])

                // Create a tag element
                const createTagElement = (tagText) => {
                    const tagEl = document.createElement('div')
                    tagEl.className = 'tag-item'
                    tagEl.style.cssText = `
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        padding: 2px 6px;
                        background: var(--primary-color);
                        color: white;
                        border-radius: 12px;
                        font-size: 11px;
                        font-family: monospace;
                        white-space: nowrap;
                        max-width: 120px;
                    `

                    const textSpan = document.createElement('span')
                    textSpan.textContent = tagText
                    textSpan.style.cssText = `
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    `

                    const removeBtn = document.createElement('button')
                    removeBtn.textContent = '×'
                    removeBtn.style.cssText = `
                        background: none;
                        border: none;
                        color: white;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                        padding: 0;
                        width: 14px;
                        height: 14px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                        transition: background 0.15s;
                    `

                    removeBtn.addEventListener('mouseenter', () => {
                        removeBtn.style.background = 'var(--bg-hover)'
                    })
                    removeBtn.addEventListener('mouseleave', () => {
                        removeBtn.style.background = 'none'
                    })

                    removeBtn.onclick = () => {
                        currentTags.delete(tagText)
                        tagEl.remove()
                    }

                    tagEl.appendChild(textSpan)
                    tagEl.appendChild(removeBtn)
                    return tagEl
                }

                // Add existing tags
                currentTags.forEach(tag => {
                    const tagEl = createTagElement(tag)
                    tagsContainer.insertBefore(tagEl, tagInput)
                })

                // Add tag functionality
                const addTag = () => {
                    const tagText = tagInput.value.trim()
                    if (tagText && !currentTags.has(tagText) && tagText.length <= 20) {
                        currentTags.add(tagText)
                        const tagEl = createTagElement(tagText)
                        tagsContainer.insertBefore(tagEl, tagInput)
                        tagInput.value = ''
                    }
                }

                // Tag input events
                tagInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                    } else if (e.key === 'Backspace' && tagInput.value === '' && currentTags.size > 0) {
                        // Remove last tag if backspace on empty input
                        const lastTag = Array.from(currentTags).pop()
                        currentTags.delete(lastTag)
                        const tagElements = tagsContainer.querySelectorAll('.tag-item')
                        if (tagElements.length > 0) {
                            tagElements[tagElements.length - 1].remove()
                        }
                    }
                })

                // Focus tag input when clicking container
                tagsContainer.addEventListener('click', (e) => {
                    if (e.target === tagsContainer) {
                        tagInput.focus()
                    }
                })

                // Show panel with animation
                editPanel.style.width = '300px'
                contentArea.style.flex = '1'

                // Set up event handlers
                const closeBtn = editPanel.querySelector('#close-edit-panel')
                const saveBtn = editPanel.querySelector('#save-asset-changes')
                const cancelBtn = editPanel.querySelector('#cancel-edit')
                const nameInput = editPanel.querySelector('#asset-name-input')

                const hidePanel = () => {
                    editPanel.style.width = '0'
                    contentArea.style.flex = '1'
                }

                closeBtn.onclick = hidePanel
                cancelBtn.onclick = hidePanel

                saveBtn.onclick = async () => {
                    const newName = nameInput.value.trim()
                    const newTags = Array.from(currentTags)

                    // Check if anything changed
                    const nameChanged = newName && newName !== asset.originalName
                    const tagsChanged = JSON.stringify(newTags.sort()) !== JSON.stringify((asset.tags || []).sort())

                    if (nameChanged || tagsChanged) {
                        try {
                            const updateData = {}
                            if (nameChanged) updateData.originalName = newName
                            if (tagsChanged) updateData.tags = newTags

                            const success = await this.updateAssetInfo(asset.path, updateData)

                            if (success) {
                                // Update the asset object
                                if (nameChanged) {
                                    asset.originalName = newName
                                    // Update the nameEl in the grid
                                    nameEl.textContent = newName.length > 15 ? newName.substring(0, 12) + '...' : newName
                                }
                                if (tagsChanged) {
                                    asset.tags = newTags
                                    // Refresh the current tab content to reflect tag changes
                                    await loadTabContent(activeTab)
                                }
                                console.log('Asset updated successfully')
                            } else {
                                alert('Failed to update asset. Please try again.')
                            }
                        } catch (error) {
                            console.error('Error updating asset:', error)
                            alert('Failed to update asset. Please try again.')
                        }
                    }
                    hidePanel()
                }

                // Save on Enter key
                nameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        saveBtn.click()
                    }
                })

                // Focus the input
                setTimeout(() => nameInput.focus(), 100)
            }

            // Load tab content function
            const loadTabContent = async (type) => {
                contentArea.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">Loading assets...</div>'
                
                try {
                    const allAssets = await this.listAssets(type)

                    // Apply tag filters (AND logic - asset must have ALL active filter tags)
                    const assets = allAssets.filter(asset => {
                        if (activeFilters.size === 0) return true // No filters = show all

                        const assetTags = new Set(asset.tags || [])
                        // Check if asset has ALL active filter tags
                        return Array.from(activeFilters).every(filterTag => assetTags.has(filterTag))
                    })

                    if (assets.length === 0) {
                        if (activeFilters.size > 0) {
                            // Show different message when filtered results are empty
                            const filterList = Array.from(activeFilters).join(', ')
                            contentArea.innerHTML = `
                                <div style="text-align: center; padding: 60px; color: var(--text-secondary);">
                                    <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                                    <h3 style="color: var(--text-primary); font-size: 20px; margin: 16px 0 8px 0;">No ${type}s match filters</h3>
                                    <p style="color: var(--text-secondary); margin: 0;">No ${type}s found with tags: <strong style="color: var(--success-color);">${filterList}</strong></p>
                                    <p style="color: var(--text-muted); margin: 8px 0 0 0; font-size: 12px;">Try removing some filters to see more results.</p>
                                </div>
                            `
                        } else {
                            // Create empty state with upload button (only in Global Mode)
                            const emptyStateContainer = document.createElement('div')
                            emptyStateContainer.style.cssText = `
                                text-align: center;
                                padding: 60px;
                                color: var(--text-secondary);
                            `

                            emptyStateContainer.innerHTML = `
                                <div style="font-size: 48px; margin-bottom: 16px;">${type === 'image' ? '🖼️' : type === 'video' ? '📼' : '🔊'}</div>
                                <h3 style="color: var(--text-primary); font-size: 20px; margin: 16px 0 8px 0;">No ${type}s found</h3>
                                <p style="color: var(--text-secondary); margin: 0 0 20px 0;">Import some ${type}s using the media nodes to see them here.</p>
                            `

                            // Add upload button
                                const uploadEmptyBtn = document.createElement('button')
                                uploadEmptyBtn.textContent = `➕ Upload ${type.charAt(0).toUpperCase() + type.slice(1)}s`
                                uploadEmptyBtn.style.cssText = `
                                    padding: 12px 24px;
                                    background: var(--primary-color);
                                    border: none;
                                    border-radius: 6px;
                                    color: white;
                                    cursor: pointer;
                                    font-size: 14px;
                                    font-weight: 600;
                                    transition: background 0.2s;
                                    margin-top: 8px;
                                `
                                uploadEmptyBtn.addEventListener('mouseenter', () => {
                                    uploadEmptyBtn.style.background = 'var(--primary-dark)'
                                })
                                uploadEmptyBtn.addEventListener('mouseleave', () => {
                                    uploadEmptyBtn.style.background = 'var(--primary-color)'
                                })
                                uploadEmptyBtn.onclick = () => {
                                    // Set file type filter for this specific type
                                    const acceptTypes = {
                                        'image': 'image/*',
                                        'video': 'video/*',
                                        'audio': 'audio/*'
                                    }
                                    fileInput.accept = acceptTypes[type] || 'image/*,video/*,audio/*'
                                    fileInput.click()
                                }
                                emptyStateContainer.appendChild(uploadEmptyBtn)

                            contentArea.innerHTML = ''
                            contentArea.appendChild(emptyStateContainer)
                        }
                        return
                    }


                    // Create asset grid (matching asset browser layout)
                    const grid = document.createElement('div')
                    grid.style.cssText = `
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 10px;
                        padding: 10px;
                        overflow-y: auto;
                        max-height: calc(100vh - 300px);
                        border: 1px solid var(--border-subtle);
                        border-radius: 6px;
                        background: var(--bg-secondary);
                    `

                    for (const asset of assets) {
                        const assetCard = document.createElement('div')
                        assetCard.className = 'asset-card'
                        assetCard.style.cssText = `
                            width: 90px;
                            height: 110px;
                            background: var(--bg-interactive);
                            border: 2px solid var(--border-subtle);
                            border-radius: 6px;
                            overflow: hidden;
                            cursor: pointer;
                            transition: border-color 0.15s ease;
                            position: relative;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto;
                        `

                        // Preview area
                        const preview = document.createElement('div')
                        preview.style.cssText = `
                            width: 70px;
                            height: 70px;
                            background: var(--bg-secondary);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            overflow: hidden;
                            border-radius: 4px;
                            border: 1px solid var(--border-normal);
                        `

                        if (type === 'image') {
                            const img = document.createElement('img')
                            try {
                                const loadableUrl = await this.getLoadableUrl(asset.path)
                                img.src = loadableUrl
                                img.style.cssText = `
                                    width: 100%;
                                    height: 100%;
                                    object-fit: cover;
                                    border-radius: 4px;
                                `
                                img.onerror = () => {
                                    preview.innerHTML = `<span style="font-size: 24px;">🖼️</span>`
                                }
                                preview.appendChild(img)
                            } catch (error) {
                                preview.innerHTML = `<span style="font-size: 32px;">🖼️</span>`
                            }
                        } else if (type === 'video' && asset.thumbnailPath) {
                            // Use video thumbnail if available
                            const img = document.createElement('img')
                            try {
                                const thumbnailUrl = await this.getLoadableUrl(asset.thumbnailPath)
                                img.src = thumbnailUrl
                                img.style.cssText = `
                                    width: 100%;
                                    height: 100%;
                                    object-fit: cover;
                                    border-radius: 4px;
                                `
                                img.onerror = () => {
                                    preview.innerHTML = `<span style="font-size: 24px;">📼</span>`
                                }
                                preview.appendChild(img)
                            } catch (error) {
                                preview.innerHTML = `<span style="font-size: 24px;">📼</span>`
                            }
                        } else {
                            preview.innerHTML = `<span style="font-size: 24px;">${type === 'video' ? '📼' : '🔊'}</span>`
                        }

                        // Filename (styled like asset browser)
                        const nameEl = document.createElement('div')
                        nameEl.textContent = asset.originalName.length > 15 ? asset.originalName.substring(0, 12) + '...' : asset.originalName
                        nameEl.style.cssText = `
                            font-size: 0.8rem;
                            text-align: center;
                            word-break: break-all;
                            color: var(--text-secondary);
                            line-height: 1.2;
                            font-family: monospace;
                            margin-top: 8px;
                        `

                        assetCard.appendChild(preview)
                        assetCard.appendChild(nameEl)

                        // Delete button (only in global manager)
                        const deleteBtn = document.createElement('button')
                        deleteBtn.textContent = '🗑️'
                        deleteBtn.style.cssText = `
                            position: absolute;
                            top: 4px;
                            right: 4px;
                            background: var(--bg-interactive);
                            border: 1px solid var(--border-normal);
                            border-radius: 4px;
                            color: var(--text-secondary);
                            cursor: pointer;
                            padding: 2px 6px;
                            font-size: 0.8rem;
                            opacity: 0;
                            transition: opacity 0.2s ease;
                            z-index: 10;
                        `
                        

                        // Delete button functionality
                        deleteBtn.onclick = async (e) => {
                            e.stopPropagation()
                            const success = await this.deleteAssetWithConfirmation(asset.path, asset)
                            if (success) {
                                assetCard.remove()

                                // Close edit panel if this asset is currently being edited
                                if (editPanel.style.width !== '0' && editPanel.style.width !== '0px') {
                                    editPanel.style.width = '0'
                                    contentArea.style.flex = '1'
                                }

                                // Check if this was the last asset and show empty state
                                const remainingCards = grid.querySelectorAll('.asset-card')
                                if (remainingCards.length === 0) {
                                    // Create empty state with upload button (only in Global Mode)
                                    const emptyStateContainer = document.createElement('div')
                                    emptyStateContainer.style.cssText = `
                                        text-align: center;
                                        padding: 60px;
                                        color: var(--text-secondary);
                                    `

                                    emptyStateContainer.innerHTML = `
                                        <div style="font-size: 48px; margin-bottom: 16px;">${type === 'image' ? '🖼️' : type === 'video' ? '📼' : '🔊'}</div>
                                        <h3 style="color: var(--text-primary); font-size: 20px; margin: 16px 0 8px 0;">No ${type}s found</h3>
                                        <p style="color: var(--text-secondary); margin: 0 0 20px 0;">Import some ${type}s using the media nodes to see them here.</p>
                                    `

                                    // Add upload button
                                        const uploadEmptyBtn = document.createElement('button')
                                        uploadEmptyBtn.textContent = `➕ Upload ${type.charAt(0).toUpperCase() + type.slice(1)}s`
                                        uploadEmptyBtn.style.cssText = `
                                            padding: 12px 24px;
                                            background: var(--primary-color);
                                            border: none;
                                            border-radius: 6px;
                                            color: white;
                                            cursor: pointer;
                                            font-size: 14px;
                                            font-weight: 600;
                                            transition: background 0.2s;
                                            margin-top: 8px;
                                        `
                                        uploadEmptyBtn.addEventListener('mouseenter', () => {
                                            uploadEmptyBtn.style.background = 'var(--primary-dark)'
                                        })
                                        uploadEmptyBtn.addEventListener('mouseleave', () => {
                                            uploadEmptyBtn.style.background = 'var(--primary-color)'
                                        })
                                        uploadEmptyBtn.onclick = () => {
                                            // Set file type filter for this specific type
                                            const acceptTypes = {
                                                'image': 'image/*',
                                                'video': 'video/*',
                                                'audio': 'audio/*'
                                            }
                                            fileInput.accept = acceptTypes[type] || 'image/*,video/*,audio/*'
                                            fileInput.click()
                                        }
                                        emptyStateContainer.appendChild(uploadEmptyBtn)

                                    contentArea.innerHTML = ''
                                    contentArea.appendChild(emptyStateContainer)
                                }
                            }
                        }

                        deleteBtn.addEventListener('mouseenter', () => {
                            deleteBtn.style.background = 'var(--bg-hover)'
                            deleteBtn.style.borderColor = 'var(--primary-muted)'
                        })
                        deleteBtn.addEventListener('mouseleave', () => {
                            deleteBtn.style.background = 'var(--bg-interactive)'
                            deleteBtn.style.borderColor = 'var(--border-normal)'
                        })

                        assetCard.appendChild(deleteBtn)

                        // Combined hover effects for card border and delete button
                        assetCard.addEventListener('mouseenter', () => {
                            assetCard.style.borderColor = 'var(--primary-muted)'
                            deleteBtn.style.opacity = '1'
                        })
                        assetCard.addEventListener('mouseleave', () => {
                            assetCard.style.borderColor = 'var(--border-subtle)'
                            deleteBtn.style.opacity = '0'
                        })

                        // Click handler - edit panel in global mode, selection in node mode
                        assetCard.addEventListener('click', () => {
                            console.log(`Selected asset: ${asset.originalName}`, asset)

                            if (onSelect && typeof onSelect === 'function') {
                                // Selection Mode: opened from a node
                                // Only call selection if asset type matches nodeType (when specified)
                                if (!nodeType || asset.type === nodeType) {
                                    // Call the selection callback
                                    onSelect(asset.path, asset)
                                    // Close the modal
                                    overlay.remove()
                                }
                            } else {
                                // Global Mode: show edit panel instead of selection
                                showEditPanel(asset, nameEl)
                            }
                        })

                        grid.appendChild(assetCard)
                    }

                    contentArea.innerHTML = ''
                    contentArea.appendChild(grid)
                } catch (error) {
                    console.error('Failed to load assets:', error)
                    contentArea.innerHTML = `
                        <div style="text-align: center; padding: 60px; color: var(--text-secondary);">
                            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                            <h3 style="color: var(--text-primary); font-size: 20px; margin: 16px 0 8px 0;">Failed to load assets</h3>
                            <p style="color: var(--text-secondary); margin: 0;">Check the console for more details.</p>
                        </div>
                    `
                }
            }

            // Assemble the window
            window.appendChild(header)
            window.appendChild(tabBar)
            window.appendChild(filterBar)
            window.appendChild(mainContainer)
            overlay.appendChild(window)
            document.body.appendChild(overlay)

            // Load initial content
            await loadTabContent(activeTab)

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    fileInput.remove() // Clean up file input
                    overlay.remove()
                }
            })

            // Clean up file input when close button is clicked
            const originalCloseHandler = closeBtn.onclick
            closeBtn.onclick = () => {
                fileInput.remove()
                originalCloseHandler()
            }

        } catch (error) {
            console.error('Failed to show global asset manager:', error)
            alert('Failed to open asset manager. Check console for details.')
        }
    }
}

// Auto-initialize in Electron environment
if (isElectron) {
    console.log('AssetManager initialized in Electron mode')
    
    // Add global keyboard shortcut for asset manager
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
            e.preventDefault()
            AssetManager.showGlobalAssetManager()
        }
    })
} else {
    console.log('AssetManager initialized in web mode')
}