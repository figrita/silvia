// themeManager.js - Complete rewrite for multi-color theme system

import {hexToRgba, rgbaToHsla} from './utils.js'

/**
 * Multi-Color Theme Manager
 * Handles a 4-color theming system where users can customize:
 * - Main UI color (general interface elements)
 * - Number color (number ports and connections)
 * - Color color (color ports and connections)
 * - Event color (action/event ports and connections)
 */

export class ThemeManager {
    static instance = null
    
    constructor() {
        if (ThemeManager.instance) {
            return ThemeManager.instance
        }
        
        // Default theme colors
        this.colors = {
            main: '#f52fbcff',    // Pink - for main UI elements
            number: '#10b981ff',  // Green - for number ports
            color: '#f59e0bff',   // Orange - for color ports  
            event: '#8b5cf6ff'    // Purple - for action/event ports
        }
        
        this.rootElement = document.documentElement
        
        // Load saved theme from localStorage
        this.loadTheme()
        
        // Apply the initial theme
        this.applyTheme()
        
        ThemeManager.instance = this
    }
    
    /**
     * Sets a specific theme color
     * @param {string} colorType - One of: 'main', 'number', 'color', 'event'
     * @param {string} hexValue - 8-digit hex color string (e.g., '#ff0000ff')
     */
    setColor(colorType, hexValue) {
        if (!['main', 'number', 'color', 'event'].includes(colorType)) {
            console.warn(`Invalid color type: ${colorType}`)
            return
        }
        
        // Validate hex string
        const rgba = hexToRgba(hexValue)
        if (!rgba) {
            console.warn(`Invalid hex color: ${hexValue}`)
            return
        }
        
        this.colors[colorType] = hexValue
        this.applyTheme()
        this.saveTheme()
    }
    
    /**
     * Gets a specific theme color
     * @param {string} colorType - One of: 'main', 'number', 'color', 'event'
     * @returns {string} The hex color string
     */
    getColor(colorType) {
        return this.colors[colorType] || '#000000ff'
    }
    
    /**
     * Gets all theme colors
     * @returns {object} Copy of the entire colors object
     */
    getAllColors() {
        return {...this.colors}
    }
    
    /**
     * Applies the current theme by updating CSS custom properties
     */
    applyTheme() {
        // Process each color and extract HSL values
        Object.entries(this.colors).forEach(([type, hexColor]) => {
            const rgba = hexToRgba(hexColor)
            if (rgba) {
                const hsla = rgbaToHsla(rgba.r, rgba.g, rgba.b, rgba.a)
                
                // Set CSS variables for each color type
                if (type === 'main') {
                    // Main color also sets the legacy --theme-* variables
                    this.rootElement.style.setProperty('--theme-hue', hsla.h.toString())
                    this.rootElement.style.setProperty('--theme-sat', `${hsla.s * 100}%`)
                    this.rootElement.style.setProperty('--theme-light', `${hsla.l * 100}%`)
                }
                
                // Set type-specific variables
                this.rootElement.style.setProperty(`--${type}-hue`, hsla.h.toString())
                this.rootElement.style.setProperty(`--${type}-sat`, `${hsla.s * 100}%`)
                this.rootElement.style.setProperty(`--${type}-light`, `${hsla.l * 100}%`)
            }
        })
        
        // Dispatch a custom event for other parts of the app that might need to respond
        const event = new CustomEvent('themeChanged', {
            detail: { colors: this.getAllColors() }
        })
        document.dispatchEvent(event)
    }
    
    /**
     * Saves the current theme to localStorage
     */
    saveTheme() {
        try {
            localStorage.setItem('silvia_theme_colors', JSON.stringify(this.colors))
        } catch (e) {
            console.warn('Could not save theme to localStorage:', e)
        }
    }
    
    /**
     * Loads the theme from localStorage
     */
    loadTheme() {
        try {
            const savedColors = localStorage.getItem('silvia_theme_colors')
            if (savedColors !== null) {
                const parsed = JSON.parse(savedColors)
                
                // Validate that all required color types exist and are valid hex strings
                const validTypes = ['main', 'number', 'color', 'event']
                let isValid = true
                
                for (const type of validTypes) {
                    if (!parsed[type] || !hexToRgba(parsed[type])) {
                        isValid = false
                        break
                    }
                }
                
                if (isValid) {
                    this.colors = parsed
                } else {
                    console.warn('Invalid saved theme colors, using defaults')
                }
            }
        } catch (e) {
            console.warn('Could not load theme from localStorage:', e)
        }
    }
    
    /**
     * Resets all colors to defaults
     */
    resetToDefaults() {
        this.colors = {
            main: '#f52fbcff',    // Pink
            number: '#10b981ff',  // Green  
            color: '#f59e0bff',   // Orange
            event: '#8b5cf6ff'    // Purple
        }
        this.applyTheme()
        this.saveTheme()
    }
}

// Create and export a singleton instance
export const themeManager = new ThemeManager()