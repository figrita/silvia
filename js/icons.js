// Vendored Lucide icon SVG paths
// Source: https://github.com/lucide-icons/lucide
// License: ISC — see LICENSES/lucide.txt
// Only the icons actually used in UI chrome are included here.

const ICONS = {
    'chevron-left':       '<path d="m15 18-6-6 6-6"/>',
    'chevron-right':      '<path d="m9 18 6-6-6-6"/>',
    'chevron-up':         '<path d="m18 15-6-6-6 6"/>',
    'chevron-down':       '<path d="m6 9 6 6 6-6"/>',
    'arrow-left':         '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'arrow-right':        '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    'play':               '<polygon points="6,3 20,12 6,21"/>',
    'pause':              '<rect x="14" y="3" width="4" height="18" rx="1"/><rect x="6" y="3" width="4" height="18" rx="1"/>',
    'arrow-right-to-line':'<path d="M17 12H3"/><path d="m11 18 6-6-6-6"/><path d="M21 5v14"/>',
    'arrow-left-to-line': '<path d="M3 19V5"/><path d="m13 6-6 6 6 6"/><path d="M7 12h14"/>',
    'columns-3':          '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
    'menu':               '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
    'plus':               '<path d="M5 12h14"/><path d="M12 5v14"/>',
    'minus':              '<path d="M5 12h14"/>',
    'x':                  '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'scissors':           '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    'copy':               '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    'rotate-ccw':         '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    'music':              '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    'trash-2':            '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    'upload':             '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    'folder-open':        '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    'refresh-cw':         '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'pencil':             '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    'snowflake':          '<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>',
    'flame':              '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
    'circle-help':        '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
}

/**
 * Create an SVG icon DOM element.
 * @param {string} name - Icon name from ICONS registry
 * @param {number} [size=16] - Width and height in pixels
 * @returns {SVGSVGElement}
 */
export function icon(name, size = 16) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', size)
    svg.setAttribute('height', size)
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '2')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.innerHTML = ICONS[name] || ''
    return svg
}

/**
 * Return an SVG icon as an HTML string (for innerHTML / template literals).
 * @param {string} name - Icon name from ICONS registry
 * @param {number} [size=16] - Width and height in pixels
 * @returns {string}
 */
export function iconHtml(name, size = 16) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`
}

/**
 * Replace an element's contents with a single icon.
 * @param {HTMLElement} el
 * @param {string} name
 * @param {number} [size=16]
 */
export function setIcon(el, name, size = 16) {
    el.textContent = ''
    el.appendChild(icon(name, size))
}

/**
 * Replace an element's contents with an icon followed by a text label.
 * @param {HTMLElement} el
 * @param {string} name
 * @param {string} label
 * @param {number} [size=16]
 */
export function setIconLabel(el, name, label, size = 16) {
    el.textContent = ''
    el.appendChild(icon(name, size))
    el.append(` ${label}`)
}

/**
 * Hydrate all elements with a data-icon attribute.
 * Call once on DOMContentLoaded.
 */
export function initIcons() {
    document.querySelectorAll('[data-icon]').forEach(el => {
        const name = el.dataset.icon
        const size = parseInt(el.dataset.iconSize, 10) || 16
        el.textContent = ''
        el.appendChild(icon(name, size))
    })
}
