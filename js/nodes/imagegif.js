import {registerNode} from '../registry.js'
import {Connection} from '../connections.js'
import {formatFloatGLSL} from '../utils.js'
import {SNode} from '../snode.js'
import {AssetManager} from '../assetManager.js'

registerNode({
    slug: 'imagegif',
    icon: '🖼️',
    label: 'Image/GIF',
    tooltip: 'Loads static images or animated GIFs. Drag and drop files or click to browse. Automatically handles aspect ratio and animation.',
    elements: {
        previewCanvas: null,
        imageLoader: null
    },
    fileSelectors: {
        input: null
    },
    runtimeState: {
        aspect: 1.0,
        animator: null, // To hold the gifler instance
        currentAssetPath: null // Track current asset for cleanup
    },
    values: {
        assetPath: null // Persistent asset reference for serialization
    },

    input: {},
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName){
                return `vec4 ${funcName}(vec2 uv) {
    float aspect = ${formatFloatGLSL(this.runtimeState.aspect)};
    uv.x = (uv.x / aspect + 1.0) * 0.5;  // [-imageAspectRatio, imageAspectRatio] -> [0,1]
    uv.y = (uv.y + 1.0) * 0.5;                     // [-1, 1] -> [0,1]
    return texture(${uniformName}, vec2(uv.x, 1.0 - uv.y));
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
                if(this.isDestroyed){return}

                const {previewCanvas} = this.elements

                if(previewCanvas && previewCanvas.width > 0 && previewCanvas.height > 0){
                    let texture = textureMap.get(this)
                    if(!texture){
                        texture = gl.createTexture()
                        textureMap.set(this, texture)
                        gl.bindTexture(gl.TEXTURE_2D, texture)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                    }

                    gl.activeTexture(gl.TEXTURE0 + textureUnit)
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, previewCanvas)

                    const location = gl.getUniformLocation(program, uniformName)
                    gl.uniform1i(location, textureUnit)
                }
            }
        }
    },

    onCreate(){
        if(!this.customArea){return}

        // Create drop zone container
        const dropZone = document.createElement('div')
        dropZone.className = 'drop-zone'
        dropZone.style.cssText = `
            border: 2px dashed var(--color-border);
            border-radius: 8px;
            min-height: 120px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            transition: opacity 0.3s ease;
            margin: 8px;
            position: relative;
            overflow: hidden;
        `
        
        // Create placeholder text
        const placeholder = document.createElement('div')
        placeholder.className = 'drop-zone-placeholder'
        placeholder.style.cssText = `
            color: var(--color-text-secondary);
            font-size: 14px;
            text-align: center;
            padding: 20px;
            pointer-events: none;
        `
        placeholder.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 8px;">🖼️</div>
            <div>Drop image here</div>
            <div style="font-size: 12px; opacity: 0.7; margin-top: 4px;">or click to browse</div>
        `
        
        // Hidden file input
        this.fileSelectors.input = document.createElement('input')
        this.fileSelectors.input.type = 'file'
        this.fileSelectors.input.accept = 'image/*'
        this.fileSelectors.input.style.display = 'none'

        // Preview canvas
        this.elements.previewCanvas = document.createElement('canvas')
        this.elements.previewCanvas.style.cssText = `
            width: 100%;
            max-width: 320px;
            max-height:200px;
            height: auto;
            display: none;
            border-radius: 4px;
        `

        // Hidden image element for loading static images
        this.elements.imageLoader = document.createElement('img')
        
        // Create control buttons container
        const buttonContainer = document.createElement('div')
        buttonContainer.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            display: ${AssetManager.isElectronMode() ? 'flex' : 'none'};
            flex-direction: column;
            gap: 4px;
            z-index: 10;
            opacity: 0;
            transition: opacity 0.2s ease;
        `

        // Create replace button (shown when image is loaded)
        const replaceBtn = document.createElement('button')
        replaceBtn.className = 'replace-media-btn'
        replaceBtn.style.cssText = `
            padding: 4px 8px;
            background: var(--bg-interactive);
            border: 1px solid var(--border-normal);
            border-radius: 4px;
            color: var(--text-secondary);
            font-size: 11px;
            cursor: pointer;
            font-family: monospace;
        `
        replaceBtn.textContent = AssetManager.isElectronMode() ? '📁 Upload' : '↻ Replace'
        replaceBtn.onclick = (e) => {
            e.stopPropagation()
            this.fileSelectors.input.click()
        }
        replaceBtn.addEventListener('mouseenter', () => {
            replaceBtn.style.background = 'var(--bg-hover)'
            replaceBtn.style.borderColor = 'var(--primary-muted)'
        })
        replaceBtn.addEventListener('mouseleave', () => {
            replaceBtn.style.background = 'var(--bg-interactive)'
            replaceBtn.style.borderColor = 'var(--border-normal)'
        })

        // Create asset browser button (Electron only)
        const assetBrowserBtn = document.createElement('button')
        assetBrowserBtn.className = 'asset-browser-btn'
        assetBrowserBtn.style.cssText = `
            padding: 4px 8px;
            background: var(--bg-interactive);
            border: 1px solid var(--border-normal);
            border-radius: 4px;
            color: var(--text-secondary);
            font-size: 11px;
            cursor: pointer;
            font-family: monospace;
            display: ${AssetManager.isElectronMode() ? 'block' : 'none'};
        `
        assetBrowserBtn.textContent = '📂 Assets'
        assetBrowserBtn.onclick = async (e) => {
            e.stopPropagation()
            AssetManager.showGlobalAssetManager({
                nodeType: 'image',
                onSelect: (assetPath, assetInfo) => {
                    console.log('Selected image asset:', assetPath, assetInfo)
                    this.values.assetPath = assetPath // Asset browser is Electron-only
                    this._loadFromAssetPath(assetPath)
                }
            })
        }
        assetBrowserBtn.addEventListener('mouseenter', () => {
            assetBrowserBtn.style.background = 'var(--bg-hover)'
            assetBrowserBtn.style.borderColor = 'var(--primary-muted)'
        })
        assetBrowserBtn.addEventListener('mouseleave', () => {
            assetBrowserBtn.style.background = 'var(--bg-interactive)'
            assetBrowserBtn.style.borderColor = 'var(--border-normal)'
        })

        buttonContainer.appendChild(replaceBtn)
        buttonContainer.appendChild(assetBrowserBtn)
        
        // Store references
        this.elements.dropZone = dropZone
        this.elements.placeholder = placeholder
        this.elements.buttonContainer = buttonContainer
        this.elements.replaceBtn = replaceBtn
        this.elements.assetBrowserBtn = assetBrowserBtn

        // Click to open file dialog (always works for images since they don't have play controls)
        dropZone.addEventListener('click', () => {
            this.fileSelectors.input.click()
        })
        
        // Hover functionality for buttons
        dropZone.addEventListener('mouseenter', () => {
            buttonContainer.style.opacity = '1'
        })
        dropZone.addEventListener('mouseleave', () => {
            buttonContainer.style.opacity = '0'
        })
        
        // Drag and drop events
        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dropZone.style.background = 'rgba(255, 255, 255, 0.05)'
            dropZone.style.borderColor = 'var(--color-accent)'
        })
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault()
            e.stopPropagation()
        })
        
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dropZone.style.background = ''
            dropZone.style.borderColor = 'var(--color-border)'
        })
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dropZone.style.background = ''
            dropZone.style.borderColor = 'var(--color-border)'
            
            const files = e.dataTransfer.files
            if(files.length > 0 && files[0].type.startsWith('image/')){
                this._handleFile(files[0])
            }
        })
        
        // File input change
        this.fileSelectors.input.addEventListener('change', (e) => {
            if(e.target.files.length > 0){
                this._handleFile(e.target.files[0])
            }
        })

        // Assemble UI
        dropZone.appendChild(placeholder)
        dropZone.appendChild(this.elements.previewCanvas)
        dropZone.appendChild(buttonContainer)
        this.customArea.appendChild(dropZone)
        this.customArea.appendChild(this.fileSelectors.input)

        // Load asset if one is already set in values (Electron only)
        if (this.values.assetPath && AssetManager.isElectronMode()) {
            this._loadFromAssetPath(this.values.assetPath)
        }
    },

    onDestroy(){
        // Stop any running gif animation
        this.runtimeState.animator?.stop()
        this.runtimeState.animator = null

        // Clean up asset references
        if (this.runtimeState.currentAssetPath && !this.runtimeState.currentAssetPath.startsWith('asset://')) {
            // Only revoke blob URLs, not asset:// paths
            URL.revokeObjectURL(this.runtimeState.currentAssetPath)
        }

        // Clean up the object URL to prevent memory leaks
        if(this.elements.imageLoader && this.elements.imageLoader.src){
            URL.revokeObjectURL(this.elements.imageLoader.src)
        }
    },

    async _handleFile(file){
        if(!file){ return }

        // Cleanup previous state
        this.runtimeState.animator?.stop()
        this.runtimeState.animator = null
        if(this.elements.imageLoader.src){
            URL.revokeObjectURL(this.elements.imageLoader.src)
        }

        try {
            // Copy file to assets (Electron) or create blob URL (web)
            const assetPath = await AssetManager.copyToAssets({
                name: file.name,
                size: file.size,
                type: file.type,
                data: await file.arrayBuffer()
            }, 'image')

            // Store asset path for serialization (Electron only)
            if (AssetManager.isElectronMode()) {
                this.values.assetPath = assetPath
            }
            this.runtimeState.currentAssetPath = assetPath

            // Load the asset
            await this._loadFromAssetPath(assetPath)
            
            console.log(`Image asset stored: ${assetPath}`)
        } catch (error) {
            console.error('Failed to handle image file:', error)
            // Fallback to old blob URL method
            if(file.type === 'image/gif'){
                this._handleGif(file)
            } else {
                this._handleStaticImage(file)
            }
        }
    },

    async _loadFromAssetPath(assetPath) {
        try {
            const resolvedPath = await AssetManager.loadAsset(assetPath)
            if (!resolvedPath) {
                console.error('Failed to resolve asset path:', assetPath)
                return
            }

            this.runtimeState.currentAssetPath = assetPath

            // Determine if it's a GIF by checking the resolved path or original filename
            const isGif = resolvedPath.toLowerCase().includes('.gif') || 
                         (assetPath.includes('.gif'))

            if (isGif) {
                await this._loadGifFromPath(resolvedPath)
            } else {
                await this._loadImageFromPath(resolvedPath)
            }

            // Update UI
            this.elements.previewCanvas.style.display = 'block'
            this.elements.placeholder.style.display = 'none'
            this.elements.buttonContainer.style.display = 'flex'
            this.elements.buttonContainer.style.opacity = '1'

            // Update layout and downstream nodes
            this.updatePortPoints()
            Connection.redrawAllConnections()
            SNode.refreshDownstreamOutputs(this)
        } catch (error) {
            console.error('Failed to load asset:', error)
        }
    },

    async _loadImageFromPath(imagePath) {
        return new Promise((resolve, reject) => {
            this.elements.imageLoader.onload = () => {
                const {naturalWidth, naturalHeight} = this.elements.imageLoader
                this.runtimeState.aspect = naturalWidth / naturalHeight

                this.elements.previewCanvas.width = naturalWidth
                this.elements.previewCanvas.height = naturalHeight
                
                const ctx = this.elements.previewCanvas.getContext('2d')
                ctx.drawImage(this.elements.imageLoader, 0, 0)
                
                resolve()
            }

            this.elements.imageLoader.onerror = () => {
                console.error('Failed to load image from path:', imagePath)
                reject(new Error('Image load failed'))
            }

            this.elements.imageLoader.src = imagePath
        })
    },

    async _loadGifFromPath(gifPath) {
        // For GIFs, we need to handle them specially
        // First try to load as regular image for dimensions, then use gifler for animation
        try {
            // Create a temporary image to get dimensions
            const tempImg = new Image()
            tempImg.src = gifPath
            
            await new Promise((resolve, reject) => {
                tempImg.onload = resolve
                tempImg.onerror = reject
            })

            this.runtimeState.aspect = tempImg.naturalWidth / tempImg.naturalHeight
            
            // Use gifler for animation if available
            if (window.gifler) {
                const animator = await new Promise((resolve, reject) => {
                    // @ts-ignore
                    window.gifler(gifPath)
                        .animate(this.elements.previewCanvas)
                        .then(resolve)
                        .catch(reject)
                })
                this.runtimeState.animator = animator
            } else {
                // Fallback to static image
                await this._loadImageFromPath(gifPath)
            }
        } catch (error) {
            console.error('Failed to load GIF:', error)
            // Final fallback
            await this._loadImageFromPath(gifPath)
        }
    },


    _handleGif(file){
        const reader = new FileReader()
        reader.onload = (e) => {
            // The main gifler() function expects a URL. To load from an ArrayBuffer,
            // we must manually create a resolved promise and pass it to the Gif constructor.
            // @ts-ignore
            const gifPromise = Promise.resolve(e.target.result);
            // @ts-ignore
            new window.gifler.Gif(gifPromise)
                .animate(this.elements.previewCanvas)
                .then(animator => {
                    this.runtimeState.animator = animator
                    
                    const {width, height} = animator
                    this.runtimeState.aspect = width / height

                    this.elements.previewCanvas.style.display = 'block'
                    this.elements.placeholder.style.display = 'none'
                    this.elements.replaceBtn.style.display = 'block'
                    
                    // Update layout and downstream nodes
                    this.updatePortPoints()
                    Connection.redrawAllConnections()
                    SNode.refreshDownstreamOutputs(this)
                }).catch(err => {
                    console.error('Gifler failed to animate:', err)
                    this.elements.previewCanvas.style.display = 'none'
                })
        }
        reader.onerror = () => {
            console.error('Failed to read GIF file as ArrayBuffer.')
            this.elements.previewCanvas.style.display = 'none'
        }
        reader.readAsArrayBuffer(file)
    },

    _handleStaticImage(file){
        const url = URL.createObjectURL(file)
        this.elements.imageLoader.src = url

        this.elements.imageLoader.onload = () => {
            const {naturalWidth, naturalHeight} = this.elements.imageLoader
            this.runtimeState.aspect = naturalWidth / naturalHeight

            this.elements.previewCanvas.width = naturalWidth
            this.elements.previewCanvas.height = naturalHeight
            
            const ctx = this.elements.previewCanvas.getContext('2d')
            ctx.drawImage(this.elements.imageLoader, 0, 0)
            
            this.elements.previewCanvas.style.display = 'block'
            this.elements.placeholder.style.display = 'none'
            this.elements.replaceBtn.style.display = 'block'

            // Update layout and downstream nodes
            this.updatePortPoints()
            Connection.redrawAllConnections()
            SNode.refreshDownstreamOutputs(this)
        }

        this.elements.imageLoader.onerror = () => {
            console.error('Failed to load image:', file.name)
            this.elements.previewCanvas.style.display = 'none'
        }
    }
})