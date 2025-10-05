// AssetManager - Electron-only asset management

/**
 * Asset management for Electron environment
 */
export const AssetManager = {
    /**
     * Load an asset by path - resolves asset:// URLs
     * @param {string} assetPath - Asset path
     * @returns {Promise<string>} Resolved file path/URL
     */
    async loadAsset(assetPath) {
        if (assetPath.startsWith('asset://')) {
            const resolvedPath = await window.electronAPI.resolveAssetPath(assetPath)
            return resolvedPath
        }
        return assetPath
    },

    /**
     * List all available assets of a given type
     * @param {string} type - Asset type: 'image', 'video', 'audio'
     * @returns {Promise<Array>} List of asset info objects
     */
    async listAssets(type = 'image') {
        return await window.electronAPI.listAssets(type)
    },

    /**
     * Update asset metadata
     * @param {string} assetPath - Asset path to update
     * @param {Object} newInfo - Updated asset info
     * @returns {Promise<boolean>} Success status
     */
    async updateAssetInfo(assetPath, newInfo) {
        return await window.electronAPI.updateAssetInfo(assetPath, newInfo)
    },

    /**
     * Delete an asset
     * @param {string} assetPath - Asset path to delete
     * @returns {Promise<boolean>} Success status
     */
    async deleteAsset(assetPath) {
        return await window.electronAPI.deleteAsset(assetPath)
    },

    /**
     * Get asset info
     * @param {string} assetPath - Asset path
     * @returns {Promise<Object|null>} Asset info or null
     */
    async getAssetInfo(assetPath) {
        return await window.electronAPI.getAssetInfo(assetPath)
    },

    /**
     * Generate video thumbnail and save as PNG file
     * @param {File|Blob|string} videoSource - Video file data or file path
     * @param {string} assetId - Asset identifier for naming (optional)
     * @returns {Promise<ArrayBuffer|null>} Thumbnail data or null on failure
     */
    async generateVideoThumbnail(videoSource, assetId) {
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

            // Handle different input types
            if (typeof videoSource === 'string') {
                // File path (Electron)
                video.src = videoSource
            } else if (videoSource instanceof File || videoSource instanceof Blob) {
                // File/Blob object
                video.src = URL.createObjectURL(videoSource)
            } else {
                reject(new Error('Invalid video source type'))
            }
        })
    },

    /**
     * Get appropriate file protocol for loading assets
     * @param {string} assetPath - Asset path
     * @returns {Promise<string>} Appropriate URL for loading
     */
    async getLoadableUrl(assetPath) {
        if (assetPath.startsWith('asset://')) {
            return await this.loadAsset(assetPath)
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

        try {
            // Create main overlay
            const overlay = document.createElement('div')
            overlay.className = 'global-asset-manager-overlay'

            // Create main window (renamed to avoid shadowing global window)
            const windowEl = document.createElement('div')
            windowEl.className = 'global-asset-manager-window'

            // Create header
            const header = document.createElement('div')
            header.className = 'asset-manager-header'

            const title = document.createElement('h2')
            title.textContent = nodeType ? `📂 Select ${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} Asset` : '📂 Asset Manager'

            // Create header controls container
            const headerControls = document.createElement('div')
            headerControls.className = 'asset-manager-header-controls'

            // Upload button (available in both modes)
            const uploadBtn = document.createElement('button')
            uploadBtn.textContent = '➕ Upload'
            uploadBtn.className = 'asset-upload-btn'
            headerControls.appendChild(uploadBtn)

            const closeBtn = document.createElement('button')
            closeBtn.textContent = '✕ Close'
            closeBtn.className = 'asset-close-btn'
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
                        // Get file path from File object
                        const filePath = window.electronAPI.getFilePathFromFile(file)
                        if (!filePath) {
                            throw new Error('Could not get file path')
                        }

                        // Generate thumbnail for video files
                        let thumbnailData = null
                        if (fileType === 'video') {
                            try {
                                thumbnailData = await this.generateVideoThumbnail(file)
                            } catch (error) {
                                console.warn(`Failed to generate thumbnail for ${file.name}:`, error)
                            }
                        }

                        // Copy file to assets using path
                        const assetPath = await window.electronAPI.copyAssetFromPath(filePath, fileType, thumbnailData)
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
            tabBar.className = 'asset-tab-bar'

            const tabs = [
                { name: 'Images', type: 'image', icon: '🖼️' },
                { name: 'Videos', type: 'video', icon: '📼' },
                { name: 'Audio', type: 'audio', icon: '🔊' }
            ]

            let activeTab = nodeType || 'image'
            const tabElements = []

            // Create main content container (holds both content area and edit panel)
            const mainContainer = document.createElement('div')
            mainContainer.className = 'asset-main-container'

            // Create content area
            const contentArea = document.createElement('div')
            contentArea.className = 'asset-content-area'

            // Create edit panel (initially hidden)
            const editPanel = document.createElement('div')
            editPanel.className = 'asset-edit-panel'

            mainContainer.appendChild(contentArea)
            mainContainer.appendChild(editPanel)

            tabs.forEach((tab, index) => {
                const tabElement = document.createElement('button')
                tabElement.className = 'asset-tab'

                const isActiveTab = tab.type === activeTab
                const isDisabled = nodeType && tab.type !== nodeType

                if (isActiveTab) tabElement.classList.add('asset-tab-active')
                if (isDisabled) tabElement.classList.add('asset-tab-disabled')

                tabElement.innerHTML = `${tab.icon} ${tab.name}`

                tabElement.addEventListener('click', async () => {
                    if (isDisabled) return // Don't allow clicking disabled tabs

                    // Update tab appearances
                    tabElements.forEach((el) => {
                        el.classList.remove('asset-tab-active')
                    })
                    tabElement.classList.add('asset-tab-active')

                    activeTab = tab.type
                    await loadTabContent(tab.type)
                })

                tabElements.push(tabElement)
                tabBar.appendChild(tabElement)
            })

            // Create filter bar
            const filterBar = document.createElement('div')
            filterBar.className = 'asset-filter-bar'

            const filterLabel = document.createElement('label')
            filterLabel.textContent = 'Filter by tags:'
            filterLabel.className = 'asset-filter-label'

            const filterContainer = document.createElement('div')
            filterContainer.className = 'asset-filter-tags-container'

            const filterInput = document.createElement('input')
            filterInput.type = 'text'
            filterInput.placeholder = 'Add tag filter...'
            filterInput.className = 'asset-filter-tag-input'
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

                const textSpan = document.createElement('span')
                textSpan.textContent = tagText

                const removeBtn = document.createElement('button')
                removeBtn.textContent = '×'

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
                    <div class="asset-edit-panel-content">
                        <div class="asset-edit-panel-header">
                            <h3>Edit Asset</h3>
                            <button id="close-edit-panel" class="asset-edit-panel-close">✕</button>
                        </div>

                        <div class="asset-edit-preview-container">
                            <div class="asset-edit-preview" id="edit-preview"></div>
                        </div>

                        <div class="asset-edit-field">
                            <label class="asset-edit-label">Display Name</label>
                            <input type="text" id="asset-name-input" value="${asset.originalName}" class="asset-edit-input">
                        </div>

                        <div class="asset-edit-field">
                            <label class="asset-edit-label">Tags</label>
                            <div id="tags-container" class="asset-edit-tags-container">
                                <input type="text" id="tag-input" placeholder="Add tag..." class="asset-edit-tag-input" maxlength="20">
                            </div>
                            <div class="asset-edit-tag-hint">Press Enter to add tag, click × to remove</div>
                        </div>

                        <div class="asset-edit-field">
                            <label class="asset-edit-label">File Path</label>
                            <div class="asset-edit-filepath">${asset.path}</div>
                        </div>

                        <div class="asset-edit-actions">
                            <button id="save-asset-changes" class="asset-edit-save-btn">Save Changes</button>
                            <button id="cancel-edit" class="asset-edit-cancel-btn">Cancel</button>
                        </div>
                    </div>
                `

                // Set up preview
                const editPreview = editPanel.querySelector('#edit-preview')
                if (asset.type === 'image') {
                    this.getLoadableUrl(asset.path).then(loadableUrl => {
                        const img = document.createElement('img')
                        img.src = loadableUrl
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

                    const textSpan = document.createElement('span')
                    textSpan.textContent = tagText

                    const removeBtn = document.createElement('button')
                    removeBtn.textContent = '×'

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
                                <div class="asset-empty-state">
                                    <div class="asset-empty-state-icon">🔍</div>
                                    <h3>No ${type}s match filters</h3>
                                    <p>No ${type}s found with tags: <strong style="color: var(--success-color);">${filterList}</strong></p>
                                    <p style="color: var(--text-muted); margin: 8px 0 0 0; font-size: 12px;">Try removing some filters to see more results.</p>
                                </div>
                            `
                        } else {
                            // Create empty state with upload button (only in Global Mode)
                            const emptyStateContainer = document.createElement('div')
                            emptyStateContainer.className = 'asset-empty-state'

                            emptyStateContainer.innerHTML = `
                                <div class="asset-empty-state-icon">${type === 'image' ? '🖼️' : type === 'video' ? '📼' : '🔊'}</div>
                                <h3>No ${type}s found</h3>
                                <p>Import some ${type}s using the media nodes to see them here.</p>
                            `

                            // Add upload button
                            const uploadEmptyBtn = document.createElement('button')
                            uploadEmptyBtn.textContent = `➕ Upload ${type.charAt(0).toUpperCase() + type.slice(1)}s`
                            uploadEmptyBtn.className = 'asset-empty-upload-btn'
                            uploadEmptyBtn.onclick = () => {
                                fileInput.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*'
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
                    grid.className = 'asset-grid'

                    for (const asset of assets) {
                        const assetCard = document.createElement('div')
                        assetCard.className = 'asset-card'

                        // Preview area
                        const preview = document.createElement('div')
                        preview.className = 'asset-card-preview'

                        if (type === 'image') {
                            const img = document.createElement('img')
                            try {
                                const loadableUrl = await this.getLoadableUrl(asset.path)
                                img.src = loadableUrl
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
                        nameEl.className = 'asset-card-name'
                        nameEl.textContent = asset.originalName.length > 15 ? asset.originalName.substring(0, 12) + '...' : asset.originalName

                        assetCard.appendChild(preview)
                        assetCard.appendChild(nameEl)

                        // Delete button (only in global manager)
                        const deleteBtn = document.createElement('button')
                        deleteBtn.textContent = '🗑️'
                        deleteBtn.className = 'asset-card-delete-btn'

                        // Delete button functionality
                        deleteBtn.onclick = async (e) => {
                            e.stopPropagation()
                            const success = await this.deleteAssetWithConfirmation(asset.path, asset)
                            if (success) {
                                assetCard.remove()

                                // Close edit panel if this asset is currently being edited
                                if (editPanel.style.width !== '0' && editPanel.style.width !== '0px') {
                                    editPanel.style.width = '0'
                                }

                                // Check if this was the last asset and show empty state
                                const remainingCards = grid.querySelectorAll('.asset-card')
                                if (remainingCards.length === 0) {
                                    // Create empty state with upload button (only in Global Mode)
                                    const emptyStateContainer = document.createElement('div')
                                    emptyStateContainer.className = 'asset-empty-state'

                                    emptyStateContainer.innerHTML = `
                                        <div class="asset-empty-state-icon">${type === 'image' ? '🖼️' : type === 'video' ? '📼' : '🔊'}</div>
                                        <h3>No ${type}s found</h3>
                                        <p>Import some ${type}s using the media nodes to see them here.</p>
                                    `

                                    // Add upload button
                                    const uploadEmptyBtn = document.createElement('button')
                                    uploadEmptyBtn.textContent = `➕ Upload ${type.charAt(0).toUpperCase() + type.slice(1)}s`
                                    uploadEmptyBtn.className = 'asset-empty-upload-btn'
                                    uploadEmptyBtn.onclick = () => {
                                        fileInput.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*'
                                        fileInput.click()
                                    }
                                    emptyStateContainer.appendChild(uploadEmptyBtn)

                                    contentArea.innerHTML = ''
                                    contentArea.appendChild(emptyStateContainer)
                                }
                            }
                        }

                        assetCard.appendChild(deleteBtn)

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
                        <div class="asset-empty-state">
                            <div class="asset-empty-state-icon">❌</div>
                            <h3>Failed to load assets</h3>
                            <p>Check the console for more details.</p>
                        </div>
                    `
                }
            }

            // Assemble the window
            windowEl.appendChild(header)
            windowEl.appendChild(tabBar)
            windowEl.appendChild(filterBar)
            windowEl.appendChild(mainContainer)
            overlay.appendChild(windowEl)
            document.body.appendChild(overlay)

            // Load initial content
            await loadTabContent(activeTab)

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove()
                }
            })

        } catch (error) {
            console.error('Failed to show global asset manager:', error)
            alert('Failed to open asset manager. Check console for details.')
        }
    }
}