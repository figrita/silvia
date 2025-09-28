// scolor.js - Enhanced with noalpha attribute and white color bug fix

import {hexToRgba, hslaToRgba, rgbaToHex, rgbaToHsla} from './utils.js'

class SColor extends HTMLElement{
    static observedAttributes = ['value', 'default', 'disabled', 'noalpha']

    // HSLA is the internal source of truth to preserve hue/saturation at extremes.
    _hsla = {h: 0, s: 0, l: 0, a: 1}
    _rgba = {r: 0, g: 0, b: 0, a: 1} // Kept as a derived value for convenience

    constructor(){
        super()
        this.innerHTML = `
            <div class="s-color-swatch" data-el="swatch">
                <div class="s-color-checkerboard"></div>
                <div class="s-color-value" data-el="swatchValue"></div>
            </div>
            <div class="s-color-popup hidden" data-el="popup">
                <div class="s-color-slider-group">
                    <label>Hue</label>
                    <input type="range" min="0" max="360" step="0.1" class="s-color-slider" data-el="hueSlider">
                </div>
                <div class="s-color-slider-group">
                    <label>Saturation</label>
                    <input type="range" min="0" max="100" step="0.1" class="s-color-slider" data-el="satSlider">
                </div>
                <div class="s-color-slider-group">
                    <label>Lightness</label>
                    <input type="range" min="0" max="100" step="0.1" class="s-color-slider" data-el="lightSlider">
                </div>
                <div class="s-color-slider-group alpha-group" data-el="alphaGroup">
                    <label>Alpha</label>
                    <div style="position:relative;">
                    <div class="s-color-checkerboard" style="height: 18px;"></div>
                    <input type="range" min="0" max="100" step="0.1" class="s-color-slider" data-el="alphaSlider" />
                    </div>
                </div>
                <input type="text" class="s-color-hex-input" data-el="hexInput" spellcheck="false">
            </div>
        `
        // Autowire elements
        this.elements = Object.fromEntries(
            Array.from(this.querySelectorAll('[data-el]'))
                .map(el => [el.dataset.el, el])
        )
    }

    disconnectedCallback(){
        // Clean up escape listener when element is removed
        if(this._escapeHandler){
            document.removeEventListener('escape-pressed', this._escapeHandler)
        }
        // Clean up resize listener
        if(this._resizeHandler){
            window.removeEventListener('resize', this._resizeHandler)
        }
    }
    
    connectedCallback(){
        this._upgradeProperty('value')
        this._upgradeProperty('default')
        this._upgradeProperty('disabled')
        this._upgradeProperty('noalpha')

        let initialValue = this.getAttribute('value')
        if(!initialValue || hexToRgba(initialValue) === null){
            initialValue = this.getAttribute('default') || '#000000ff'
        }

        // --- INITIALIZATION LOGIC ---
        // 1. Directly parse the initial string and set internal state.
        // This bypasses the public setter's guards, which are meant for
        // external interactions, not initialization.
        const initialRgba = hexToRgba(initialValue)
        if(initialRgba){
            this._hsla = rgbaToHsla(initialRgba.r, initialRgba.g, initialRgba.b, initialRgba.a)
        }

        // Handle noalpha attribute
        if(this.noalpha){
            this._hsla.a = 1
        }

        // 2. Force an update of all UI and derived values from the internal state.
        this._updateAll()
        this._updateAlphaVisibility()

        // 3. Commit the canonical value to the attribute. Does not dispatch an event
        // on initialization, as no user interaction has occurred.
        
        // Close popup on escape
        this._escapeHandler = () => {
            if(!this.elements.popup.classList.contains('hidden')){
                this.elements.popup.classList.add('hidden')
            }
        }
        document.addEventListener('escape-pressed', this._escapeHandler)

        // Reposition popup on window resize
        this._resizeHandler = () => {
            if(!this.elements.popup.classList.contains('hidden')){
                this._positionPopup()
            }
        }
        window.addEventListener('resize', this._resizeHandler)
        this.setAttribute('value', this.value)

        // 4. Add event listeners for subsequent user interactions.
        this._addEventListeners()
    }

    _upgradeProperty(prop){
        if(Object.hasOwn(this, prop)){
            const value = this[prop]
            delete this[prop]
            this[prop] = value
        }
    }

    attributeChangedCallback(name, oldValue, newValue){
        if(oldValue === newValue){return}
        
        switch(name){
            case 'value':
                this.value = newValue
                break
            case 'noalpha':
                this._updateAlphaVisibility()
                if(this.noalpha && this._hsla.a !== 1){
                    this._hsla.a = 1
                    this._updateAll()
                    this.setAttribute('value', this.value)
                }
                break
        }
    }

    // --- Properties ---
    get value(){
        return rgbaToHex(this._rgba)
    }
    set value(hexString){
        if(this.disabled || hexString === this.value){return}

        const newRgba = hexToRgba(hexString)
        if(newRgba){
            // Force alpha to 1 if noalpha is set
            if(this.noalpha){
                newRgba.a = 1
            }
            
            const newHsla = rgbaToHsla(newRgba.r, newRgba.g, newRgba.b, newRgba.a)

            // **FIXED STATE PRESERVATION LOGIC**
            if(newHsla.l <= 0.001){
                // Pure black: preserve hue, set saturation to 0, lightness to 0
                this._hsla.s = 0
                this._hsla.l = 0
                this._hsla.a = newHsla.a
            } else if(newHsla.l >= 0.999 && newHsla.s <= 0.001){
                // Pure white: preserve hue, set saturation to 0, lightness to 1
                this._hsla.s = 0
                this._hsla.l = 1
                this._hsla.a = newHsla.a
            } else if(newHsla.s <= 0.001){
                // Grayscale: update saturation and lightness, preserve hue
                this._hsla.s = newHsla.s
                this._hsla.l = newHsla.l
                this._hsla.a = newHsla.a
            } else {
                // All other colors: adopt new HSLA completely
                this._hsla = newHsla
            }

            // Force alpha to 1 if noalpha is set
            if(this.noalpha){
                this._hsla.a = 1
            }

            this._updateAll()
        }
    }

    get disabled(){return this.hasAttribute('disabled')}
    set disabled(val){
        if(val){this.setAttribute('disabled', '')}
        else {this.removeAttribute('disabled')}
        this.elements.popup.classList.add('hidden')
    }

    get noalpha(){return this.hasAttribute('noalpha')}
    set noalpha(val){
        if(val){this.setAttribute('noalpha', '')}
        else {this.removeAttribute('noalpha')}
    }

    // --- Update Logic ---
    _updateAll(){
        this._rgba = hslaToRgba(this._hsla.h, this._hsla.s, this._hsla.l, this._hsla.a)
        this._updateUI()
    }

    _updateUI(){
        const {h, s, l, a} = this._hsla
        const {hueSlider, satSlider, lightSlider, alphaSlider, swatchValue, hexInput} = this.elements

        swatchValue.style.backgroundColor = `rgba(${this._rgba.r}, ${this._rgba.g}, ${this._rgba.b}, ${this._rgba.a})`

        hueSlider.value = h
        satSlider.value = s * 100
        lightSlider.value = l * 100
        
        if(!this.noalpha){
            alphaSlider.value = a * 100
        }

        // Hue slider
        hueSlider.style.background = `
        linear-gradient(to right, hsl(0, ${s*100}%, ${l*100}%), hsl(60, ${s*100}%, ${l*100}%), hsl(120, ${s*100}%, ${l*100}%), hsl(180, ${s*100}%, ${l*100}%), hsl(240, ${s*100}%, ${l*100}%), hsl(300, ${s*100}%, ${l*100}%), hsl(360, ${s*100}%, ${l*100}%)),
        linear-gradient(to right, hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%), hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%))
        `
        hueSlider.style.backgroundSize = '100% 75%, 100% 100%'
        hueSlider.style.backgroundPosition = '0 0, 0 25%'
        hueSlider.style.backgroundRepeat = 'no-repeat, no-repeat'

        // Saturation slider
        satSlider.style.background = `
        linear-gradient(to right, hsl(${h}, 0%, ${l*100}%), hsl(${h}, 100%, ${l*100}%)),
        linear-gradient(to right, hsl(${h}, 0%, 50%), hsl(${h}, 100%, 50%))
        `
        satSlider.style.backgroundSize = '100% 75%, 100% 100%'
        satSlider.style.backgroundPosition = '0 0, 0 25%'
        satSlider.style.backgroundRepeat = 'no-repeat, no-repeat'

        lightSlider.style.background = `linear-gradient(to right, hsl(${h}, ${s*100}%, 0%), hsl(${h}, ${s*100}%, 50%), hsl(${h}, ${s*100}%, 100%))`
        
        if(!this.noalpha){
            alphaSlider.style.background = `linear-gradient(to right, hsla(${h}, ${s*100}%, ${l*100}%, 0), hsla(${h}, ${s*100}%, ${l*100}%, 1))`
        }

        if(document.activeElement !== hexInput){
            hexInput.value = this.value
        }
    }

    _updateAlphaVisibility(){
        if(this.elements && this.elements.alphaGroup){
            this.elements.alphaGroup.style.display = this.noalpha ? 'none' : 'block'
        }
    }

    _commit(){
        // Only set attribute and dispatch event when an action is complete.
        this.setAttribute('value', this.value)
        this.dispatchEvent(new Event('change', {bubbles: true, composed: true}))
    }

    // --- Event Handling ---
    _handleSliderInput = () => {
        // Live-update the internal state and UI while dragging.
        this._hsla.h = parseFloat(this.elements.hueSlider.value)
        this._hsla.s = parseFloat(this.elements.satSlider.value) / 100
        this._hsla.l = parseFloat(this.elements.lightSlider.value) / 100
        if(!this.noalpha){
            this._hsla.a = parseFloat(this.elements.alphaSlider.value) / 100
        }
        this._updateAll()
    }

    _handleHexChange = () => {
        // Use the main setter when the hex input value changes.
        this.value = this.elements.hexInput.value
        // Reformat the input to the canonical 8-digit hex.
        this.elements.hexInput.value = this.value
        this._commit()
    }

    _togglePopup = (e) => {
        if(this.disabled){return}
        e.stopPropagation()
        const isHidden = this.elements.popup.classList.toggle('hidden')
        if(!isHidden){
            this._positionPopup()
            document.addEventListener('click', this._closePopup, {capture: true, once: true})
        }
    }

    _positionPopup = () => {
        const popup = this.elements.popup
        const swatchRect = this.elements.swatch.getBoundingClientRect()
        const viewportHeight = window.innerHeight

        // First, position normally to measure popup height
        popup.style.top = 'calc(100% + 5px)'
        popup.classList.remove('popup-above')

        // Now get the actual popup dimensions
        const popupRect = popup.getBoundingClientRect()
        const popupHeight = popupRect.height

        // Calculate space above and below the swatch
        const spaceBelow = viewportHeight - swatchRect.bottom - 10 // 10px buffer
        const spaceAbove = swatchRect.top - 10 // 10px buffer

        // Position popup above if there's not enough space below and enough space above
        if (spaceBelow < popupHeight && spaceAbove >= popupHeight) {
            popup.style.top = `${-popupHeight - 5}px`
            popup.classList.add('popup-above')
        }
    }

    _closePopup = (e) => {
        if(!this.contains(e.target)){
            this.elements.popup.classList.add('hidden')
        } else {
            // If a click happens inside the popup, re-register the listener to close it on the *next* outside click.
            document.addEventListener('click', this._closePopup, {capture: true, once: true})
        }
    }

    _addEventListeners(){
        const {hueSlider, satSlider, lightSlider, alphaSlider, hexInput, swatch} = this.elements

        swatch.addEventListener('click', this._togglePopup)

        // Update UI live on 'input'
        hueSlider.addEventListener('input', (e) => {
            e.stopPropagation()
            this._handleSliderInput()
        })
        satSlider.addEventListener('input', (e) => {
            e.stopPropagation()
            this._handleSliderInput()
        })
        lightSlider.addEventListener('input', (e) => {
            e.stopPropagation()
            this._handleSliderInput()
        })
        if(!this.noalpha){
            alphaSlider.addEventListener('input', (e) => {
                e.stopPropagation()
                this._handleSliderInput()
            })
        }

        // Commit final value on 'change' (mouse up)
        hueSlider.addEventListener('change', (e) => {
            e.stopPropagation()
            this._commit()
        })
        satSlider.addEventListener('change', (e) => {
            e.stopPropagation()
            this._commit()
        })
        lightSlider.addEventListener('change', (e) => {
            e.stopPropagation()
            this._commit()
        })
        if(!this.noalpha){
            alphaSlider.addEventListener('change', (e) => {
                e.stopPropagation()
                this._commit()
            })
        }

        hexInput.addEventListener('change', this._handleHexChange)
        hexInput.addEventListener('keydown', (e) => {
            if(e.key === 'Enter'){
                e.target.blur() // Triggers the 'change' event
            }
        })
    }

}

customElements.define('s-color', SColor)