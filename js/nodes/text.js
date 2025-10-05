import {registerNode} from '../registry.js'
import {autowire, StringToFragment, formatFloatGLSL} from '../utils.js'
import {SNode} from '../snode.js'

registerNode({
    slug: 'text',
    icon: '✏️',
    label: 'Text',
    tooltip: 'Renders text as texture with font selection and styling options. Great for titles and dynamic text displays.',

    elements: {
        textInput: null,
        fontSizeControl: null,
        fontWeightSelect: null,
        textAlignSelect: null,
        verticalAlignSelect: null
    },
    values: {
        // These values are the source of truth for our canvas rendering
        textContent: 'This\nMachine\nKills\nFascists', // Default with a newline
        fontSize: 64,
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle'
    },
    runtimeState: {
        renderCanvas: null,
        isDirty: true, // Dirty flag to avoid re-rendering the canvas on every single frame
        aspect: 1.0
    },

    input: {
        'textColor': {
            label: 'Text Color',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'backgroundColor': {
            label: 'Background Color',
            type: 'color',
            control: {default: '#000000ff'}
        }
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName){
                const textColor = this.getInput('textColor', cc)
                const bgColor = this.getInput('backgroundColor', cc)

                return `vec4 ${funcName}(vec2 uv) {
                    vec4 bg = ${bgColor};
                    vec4 textColor = ${textColor};

                    float aspect = ${formatFloatGLSL(this.runtimeState.aspect)};

                    // Aspect-ratio correct the coordinates only for mask sampling
                    vec2 maskUV = uv;
                    maskUV.x /= aspect;

                    // Convert from world space to texture coordinates for mask
                    vec2 texCoords = vec2(maskUV.x / 2.0 + 0.5, 0.5 - maskUV.y / 2.0);

                    // The texture is white text on a black background with 1px border.
                    // The red channel serves as a perfect mask.
                    float mask = texture(${uniformName}, texCoords).r;

                    // Mix the two input colors using the mask.
                    return mix(bg, textColor, mask);
                }`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
                if(this.isDestroyed){return}

                if(this.runtimeState.isDirty){
                    this._renderTextToCanvas()
                    this.runtimeState.isDirty = false
                }

                const {renderCanvas} = this.runtimeState
                if(renderCanvas && renderCanvas.width > 0 && renderCanvas.height > 0){
                    let texture = textureMap.get(this)
                    if(!texture){
                        texture = gl.createTexture()
                        textureMap.set(this, texture)
                        gl.bindTexture(gl.TEXTURE_2D, texture)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                    }

                    gl.activeTexture(gl.TEXTURE0 + textureUnit)
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, renderCanvas)

                    const location = gl.getUniformLocation(program, uniformName)
                    gl.uniform1i(location, textureUnit)
                }
            }
        }
    },

    options: {
        'font_family': {
            label: 'Font',
            type: 'select',
            default: 'Palatino Linotype, Book Antiqua, Palatino, serif',
            choices: [
                {value: 'Arial, Helvetica, sans-serif', name: 'Arial'},
                {value: 'Verdana, Geneva, sans-serif', name: 'Verdana'},
                {value: 'Tahoma, Geneva, sans-serif', name: 'Tahoma'},
                {value: 'Trebuchet MS, Helvetica, sans-serif', name: 'Trebuchet MS'},
                {value: 'Times New Roman, Times, serif', name: 'Times New Roman'},
                {value: 'Georgia, serif', name: 'Georgia'},
                {value: 'Garamond, serif', name: 'Garamond'},
                {value: 'Courier New, Courier, monospace', name: 'Courier New'},
                {value: 'Lucida Console, Monaco, monospace', name: 'Lucida Console'},
                {value: 'Impact, Charcoal, sans-serif', name: 'Impact'},
                {value: 'Comic Sans MS, cursive, sans-serif', name: 'Comic Sans MS'},
                {value: 'Consolas, monospace', name: 'Consolas'},
                {value: 'Monaco, monospace', name: 'Monaco'},
                {value: 'Brush Script MT, cursive', name: 'Brush Script MT'},
                {value: 'Palatino Linotype, Book Antiqua, Palatino, serif', name: 'Palatino Linotype'},
                {value: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif', name: 'Segoe UI'},
                {value: 'sans-serif', name: 'Generic Sans-Serif'},
                {value: 'serif', name: 'Generic Serif'},
                {value: 'monospace', name: 'Generic Monospace'},
                {value: 'cursive', name: 'Generic Cursive'}
            ]
        },
        'canvas_res': {
            label: 'Texture Size',
            type: 'select',
            default: '1280x720',
            choices: [
                {value: '1280x720', name: '16:9 (1280x720)'},
                {value: '1920x1080', name: '16:9 (1920x1080)'},
                {value: '3440x1440', name: '21:9 (3440x1440)'},
                {value: '1024x768', name: '4:3 (1024x768)'},
                {value: '1080x1080', name: '1:1 (1080x1080)'},
                {value: '720x1280', name: '9:16 (720x1280)'},
                {value: '1080x1920', name: '9:16 (1080x1920)'}
            ]
        }
    },

    onCreate(){
        if(!this.customArea){return}

        this._createUI()

        this.runtimeState.renderCanvas = document.createElement('canvas')
        this._updateCanvasResolution()

        this.runtimeState.isDirty = true
    },

    _renderTextToCanvas(){
        const {renderCanvas} = this.runtimeState
        const ctx = renderCanvas.getContext('2d')

        const {textContent, fontSize, fontWeight, textAlign, verticalAlign} = this.values
        const fontFamily = this.getOption('font_family')

        ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height)
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
        ctx.fillStyle = 'white'
        ctx.textAlign = textAlign
        ctx.textBaseline = 'top'

        const lines = textContent.split('\n')
        const lineHeight = fontSize * 1.2
        const blockHeight = lines.length * lineHeight

        let x = renderCanvas.width / 2
        if(textAlign === 'left'){x = 10}
        if(textAlign === 'right'){x = renderCanvas.width - 10}

        let startY
        if(verticalAlign === 'middle'){
            startY = (renderCanvas.height - blockHeight) / 2
        } else if(verticalAlign === 'bottom'){
            startY = renderCanvas.height - blockHeight - 10
        } else { // 'top'
            startY = 10
        }

        for(let i = 0; i < lines.length; i++){
            const line = lines[i]
            const y = startY + (i * lineHeight)
            ctx.fillText(line, x, y)
        }

        // Draw border outline to clip text and prevent bleeding
        const borderWidth = 3
        ctx.fillStyle = 'black'
        // Top border
        ctx.fillRect(0, 0, renderCanvas.width, borderWidth)
        // Bottom border
        ctx.fillRect(0, renderCanvas.height - borderWidth, renderCanvas.width, borderWidth)
        // Left border
        ctx.fillRect(0, 0, borderWidth, renderCanvas.height)
        // Right border
        ctx.fillRect(renderCanvas.width - borderWidth, 0, borderWidth, renderCanvas.height)
    },

    _updateCanvasResolution(){
        const resolutionValue = this.getOption('canvas_res')
        const [width, height] = resolutionValue.split('x').map(Number)
        if(this.runtimeState.renderCanvas){
            this.runtimeState.renderCanvas.width = width
            this.runtimeState.renderCanvas.height = height
            this.runtimeState.aspect = width / height
            this.runtimeState.isDirty = true
        }
    },

    _createUI(){
        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <textarea data-el="textInput" rows="4" style="width:100%; box-sizing: border-box; background:#222; color:#eee; border:1px solid #555; border-radius:4px; font-family:inherit; padding: 5px; resize: vertical;">${this.values.textContent}</textarea>
                
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Size</label>
                    <s-number midi-disabled value="${this.values.fontSize}" default="${this.defaults.fontSize}" min="8" max="512" step="1" data-el="fontSizeControl"></s-number>
                </div>

                <div class="custom-control-group" style="flex-direction: row; justify-content: space-between;">
                    <label>Weight</label>
                    <select class="slct" data-el="fontWeightSelect">
                        <option value="normal" ${this.values.fontWeight === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="bold" ${this.values.fontWeight === 'bold' ? 'selected' : ''}>Bold</option>
                        <option value="lighter" ${this.values.fontWeight === 'lighter' ? 'selected' : ''}>Lighter</option>
                    </select>
                </div>
                <div class="custom-control-group" style="flex-direction: row; justify-content: space-between;">
                    <label>Align</label>
                    <select class="slct" data-el="textAlignSelect">
                        <option value="left" ${this.values.textAlign === 'left' ? 'selected' : ''}>Left</option>
                        <option value="center" ${this.values.textAlign === 'center' ? 'selected' : ''}>Center</option>
                        <option value="right" ${this.values.textAlign === 'right' ? 'selected' : ''}>Right</option>
                    </select>
                </div>
                 <div class="custom-control-group" style="flex-direction: row; justify-content: space-between;">
                    <label>Baseline</label>
                    <select class="slct" data-el="verticalAlignSelect">
                        <option value="top" ${this.values.verticalAlign === 'top' ? 'selected' : ''}>Top</option>
                        <option value="middle" ${this.values.verticalAlign === 'middle' ? 'selected' : ''}>Middle</option>
                        <option value="bottom" ${this.values.verticalAlign === 'bottom' ? 'selected' : ''}>Bottom</option>
                    </select>
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        const markDirtyAndRefresh = () => {
            this.runtimeState.isDirty = true
            if(SNode){
                SNode.refreshDownstreamOutputs(this)
            }
        }

        this.elements.textInput.addEventListener('input', (e) => {
            this.values.textContent = e.target.value
            markDirtyAndRefresh()
        })
        this.elements.fontSizeControl.addEventListener('input', (e) => {
            this.values.fontSize = parseFloat(e.target.value)
            markDirtyAndRefresh()
        })
        this.elements.fontWeightSelect.addEventListener('change', (e) => {
            this.values.fontWeight = e.target.value
            markDirtyAndRefresh()
        })
        this.elements.textAlignSelect.addEventListener('change', (e) => {
            this.values.textAlign = e.target.value
            markDirtyAndRefresh()
        })
        this.elements.verticalAlignSelect.addEventListener('change', (e) => {
            this.values.verticalAlign = e.target.value
            markDirtyAndRefresh()
        })

        const resOption = this.nodeEl.querySelector('[data-option-el="canvas_res"]')
        resOption.addEventListener('change', () => {
            this._updateCanvasResolution()
            markDirtyAndRefresh()
        })
        const fontOption = this.nodeEl.querySelector('[data-option-el="font_family"]')
        fontOption.addEventListener('change', markDirtyAndRefresh)
    }
})