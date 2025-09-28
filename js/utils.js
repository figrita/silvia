/**
 * Autowires elements inside a container by a given attribute.
 * @param {ParentNode} container - The parent node to search inside.
 * @param {string} [attr='data-el'] - Attribute to match elements by (default is 'data-el').
 * @returns {Record<string, HTMLElement>} - Object keyed by attribute value, pointing to elements.
 */
export function autowire(container, attr = 'data-el'){
    return Object.fromEntries(
        Array.from(container.querySelectorAll(`[${attr}]`))
            .map(el => [el.getAttribute(attr), el])
    )
}

/**
 * Converts an HTML string into a DocumentFragment.
 * @param {string} string - HTML string to convert.
 * @returns {DocumentFragment} - The resulting document fragment.
 */
export function StringToFragment(string){
    const renderer = document.createElement('template')
    renderer.innerHTML = string
    return renderer.content
}

/**
 * Maps over an array or object and joins the results into a string.
 * Passes (value) if callback expects 1 argument, (value, key) if expects 2.
 * @template T, K
 * @param {Record<string, T> | T[] | null | undefined} list - The array or object to iterate.
 * @param {(value: T, key?: string|number) => string} fn - Mapping function. Gets (value) or (value, key).
 * @returns {string} - Joined string from mapped results.
 */
export function mapJoin(list, fn){
    if(!list){return ''}

    const isArray = Array.isArray(list)
    const isSet = list instanceof Set

    let entries
    if(isArray){
        entries = list.entries()
    } else if(isSet){
        // For Sets, entries() returns [value, value] pairs
        entries = list.entries()
    } else {
        entries = Object.entries(list)
    }

    const expectsKey = fn.length >= 2
    return Array.from(entries, expectsKey
        ? ([k, v]) => fn(v, k)
        : ([, v]) => fn(v)
    ).join('\n')
}

let counter = 0
export function getGoldenRatioColor(){
    const hue = (counter++ * 137.508) % 360 // 137.508° ≈ 360° / φ
    const satCycle = [45, 55, 65]
    const lightCycle = [30, 40, 50]
    const s = satCycle[counter % satCycle.length]
    const l = lightCycle[Math.floor(counter / satCycle.length) % lightCycle.length]
    return `hsl(${hue}, ${s}%, ${l}%)`
}

export function formatFloatGLSL(num){
    if(num === null || num === undefined){return '0.0'}
    const strNum = String(num)
    if(!strNum.includes('.')){return `${strNum }.0`}
    if(strNum.endsWith('.')){return `${strNum }0`}
    return strNum
}

/**
 * Performs a deep clone of a plain JavaScript object or array.
 * Now handles Map and Set instances correctly.
 * @param {any} obj The object or value to clone.
 * @returns {any} A deep copy of the input.
 */
export function deepClone(obj){
    if(obj === null || typeof obj !== 'object'){
        return obj
    }

    if(obj instanceof Map){
        const mapCopy = new Map()
        for(const [key, value] of obj.entries()){
            mapCopy.set(deepClone(key), deepClone(value))
        }
        return mapCopy
    }

    if(obj instanceof Set){
        const setCopy = new Set()
        for(const value of obj.values()){
            setCopy.add(deepClone(value))
        }
        return setCopy
    }

    if(Array.isArray(obj)){
        const arrCopy = []
        for(let i = 0; i < obj.length; i++){
            arrCopy[i] = deepClone(obj[i])
        }
        return arrCopy
    }

    const objCopy = {}
    for(const key in obj){
        if(Object.hasOwn(obj, key)){
            objCopy[key] = deepClone(obj[key])
        }
    }
    return objCopy
}

/**
 * Converts a number of bytes into a human-readable string (KB, MB, GB).
 * @param {number} bytes The number of bytes.
 * @returns {string} The formatted string.
 */
export function formatBytes(bytes){
    if(bytes === 0){return '0 Bytes'}
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}


/**
 * Converts an HSL color value to RGBA.
 * @param {number} h The hue (0-360)
 * @param {number} s The saturation (0-1)
 * @param {number} l The lightness (0-1)
 * @param {number} a The alpha (0-1)
 * @returns {{r: number, g: number, b: number, a: number}} RGBA object (0-255, 0-1)
 */
export function hslaToRgba(h, s, l, a){
    let r, g, b
    h /= 360

    if(s == 0){
        r = g = b = l // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if(t < 0){t += 1}
            if(t > 1){t -= 1}
            if(t < 1 / 6){return p + (q - p) * 6 * t}
            if(t < 1 / 2){return q}
            if(t < 2 / 3){return p + (q - p) * (2 / 3 - t) * 6}
            return p
        }

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s
        const p = 2 * l - q
        r = hue2rgb(p, q, h + 1 / 3)
        g = hue2rgb(p, q, h)
        b = hue2rgb(p, q, h - 1 / 3)
    }

    return {r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a}
}

/**
 * Converts an RGBA color value to HSLA.
 * @param {number} r The red color value (0-255)
 * @param {number} g The green color value (0-255)
 * @param {number} b The blue color value (0-255)
 * @param {number} a The alpha value (0-1)
 * @returns {{h: number, s: number, l: number, a: number}} HSLA object (0-360, 0-1, 0-1, 0-1)
 */
export function rgbaToHsla(r, g, b, a){
    r /= 255
    g /= 255
    b /= 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0
    let s = 0
    const l = (max + min) / 2

    if(max !== min){
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch(max){
            case r: h = (g - b) / d + (g < b ? 6 : 0); break
            case g: h = (b - r) / d + 2; break
            case b: h = (r - g) / d + 4; break
        }
        h /= 6
    }

    return {h: h * 360, s, l, a}
}

function componentToHex(c){
    const hex = Math.round(c).toString(16)
    return hex.length == 1 ? `0${ hex}` : hex
}

/**
 * Converts an RGBA object to an 8-digit hex string.
 * @param {{r: number, g: number, b: number, a: number}} rgba
 * @returns {string} #RRGGBBAA
 */
export function rgbaToHex({r, g, b, a}){
    const alpha = Math.round(a * 255)
    return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}${componentToHex(alpha)}`
}

/**
 * Parses a hex string (3, 4, 6, or 8 digits) into an RGBA object.
 * @param {string} hex
 * @returns {{r: number, g: number, b: number, a: number} | null}
 */
export function hexToRgba(hex){
    if(!hex){return null}
    let h = hex.startsWith('#') ? hex.slice(1) : hex

    // Expand shorthand form (e.g. "03F", "03F4")
    if(h.length === 3 || h.length === 4){
        h = [...h].map(x => x + x).join('')
    }

    if(h.length !== 6 && h.length !== 8){
        return null // Invalid length
    }

    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    const a = h.length === 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1

    if(isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)){
        return null
    }

    return {r, g, b, a}
}