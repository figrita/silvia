// patchValidator.js - Security validation for untrusted .svs patch files

/**
 * Validates and sanitizes patch data to prevent security vulnerabilities
 * when loading untrusted .svs files
 */
export class PatchValidator {
    // Maximum allowed values to prevent resource exhaustion
    static MAX_NODES = 1000
    static MAX_CONNECTIONS = 5000
    static MAX_STRING_LENGTH = 100000
    static MAX_ARRAY_LENGTH = 1000
    static MAX_OBJECT_DEPTH = 10
    static MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

    // Allowed node slugs (whitelist approach)
    static ALLOWED_NODE_TYPES = new Set()  // Will be populated from registry

    // Dangerous patterns in strings
    static DANGEROUS_PATTERNS = [
        /<script/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,  // Event handlers
        /data:text\/html/gi,
        /vbscript:/gi,
        /file:\/\//gi,
        /\\x[0-9a-f]{2}/gi,  // Hex escapes
        /\\u[0-9a-f]{4}/gi,  // Unicode escapes that could hide malicious content
    ]

    // Validate asset paths
    static ASSET_PATH_REGEX = /^asset:\/\/(images|videos|audio)\/[a-f0-9]{16}\.[a-z0-9]+$/i
    static BLOB_URL_REGEX = /^blob:[a-z]+:\/\/[a-f0-9-]+$/i

    /**
     * Initialize validator with allowed node types from registry
     */
    static initialize(nodeRegistry) {
        this.ALLOWED_NODE_TYPES.clear()
        for (const slug in nodeRegistry) {
            this.ALLOWED_NODE_TYPES.add(slug)
        }
    }

    /**
     * Main validation function
     * @param {*} patchData - The patch data to validate
     * @returns {{valid: boolean, errors: string[], sanitized: object|null}}
     */
    static validate(patchData) {
        const errors = []

        try {
            // Check if patch data is an object
            if (!patchData || typeof patchData !== 'object' || Array.isArray(patchData)) {
                errors.push('Patch data must be a non-null object')
                return { valid: false, errors, sanitized: null }
            }

            // Deep clone to avoid modifying original
            const sanitized = this.deepClone(patchData, 0, errors)
            if (errors.length > 0) {
                return { valid: false, errors, sanitized: null }
            }

            // Validate structure
            if (!Array.isArray(sanitized.nodes)) {
                errors.push('Patch must contain a "nodes" array')
                return { valid: false, errors, sanitized: null }
            }

            // Validate node count
            if (sanitized.nodes.length > this.MAX_NODES) {
                errors.push(`Too many nodes (${sanitized.nodes.length} > ${this.MAX_NODES})`)
                return { valid: false, errors, sanitized: null }
            }

            // Validate connections if present
            if (sanitized.connections) {
                if (!Array.isArray(sanitized.connections)) {
                    errors.push('Connections must be an array')
                    return { valid: false, errors, sanitized: null }
                }
                if (sanitized.connections.length > this.MAX_CONNECTIONS) {
                    errors.push(`Too many connections (${sanitized.connections.length} > ${this.MAX_CONNECTIONS})`)
                    return { valid: false, errors, sanitized: null }
                }
            }

            // Validate each node
            const nodeIds = new Set()
            for (let i = 0; i < sanitized.nodes.length; i++) {
                const node = sanitized.nodes[i]

                // Validate node structure
                if (!node || typeof node !== 'object') {
                    errors.push(`Node ${i} is not an object`)
                    continue
                }

                // Validate required fields
                if (typeof node.id !== 'number' || !isFinite(node.id)) {
                    errors.push(`Node ${i} has invalid ID`)
                    continue
                }

                if (nodeIds.has(node.id)) {
                    errors.push(`Duplicate node ID: ${node.id}`)
                    continue
                }
                nodeIds.add(node.id)

                // Validate node slug against whitelist
                if (!node.slug || !this.ALLOWED_NODE_TYPES.has(node.slug)) {
                    errors.push(`Node ${node.id} has unknown or dangerous type: ${node.slug}`)
                    sanitized.nodes[i] = null  // Mark for removal
                    continue
                }

                // Validate coordinates
                if (typeof node.x !== 'number' || !isFinite(node.x) ||
                    typeof node.y !== 'number' || !isFinite(node.y)) {
                    errors.push(`Node ${node.id} has invalid coordinates`)
                    node.x = 0
                    node.y = 0
                }

                // Sanitize control values
                if (node.controls) {
                    node.controls = this.sanitizeControls(node.controls, errors, `Node ${node.id}`)
                }

                // Sanitize option values
                if (node.optionValues) {
                    node.optionValues = this.sanitizeOptions(node.optionValues, errors, `Node ${node.id}`)
                }

                // Sanitize custom values object - most dangerous!
                if (node.values) {
                    node.values = this.sanitizeValues(node.values, errors, `Node ${node.id}`)
                }

                // Sanitize MIDI mappings
                if (node.midiMappings) {
                    node.midiMappings = this.sanitizeMidiMappings(node.midiMappings, errors, `Node ${node.id}`)
                }
            }

            // Remove invalid nodes
            sanitized.nodes = sanitized.nodes.filter(n => n !== null)

            // Validate connections reference valid nodes
            if (sanitized.connections) {
                sanitized.connections = sanitized.connections.filter(conn => {
                    if (!nodeIds.has(conn.fromNode) || !nodeIds.has(conn.toNode)) {
                        // Silently remove connections to non-existent nodes
                        return false
                    }
                    // Validate port names are simple strings
                    if (!this.isSimpleString(conn.fromPort) || !this.isSimpleString(conn.toPort)) {
                        errors.push(`Invalid port names in connection`)
                        return false
                    }
                    return true
                })
            }

            // Sanitize metadata
            if (sanitized.meta) {
                sanitized.meta = this.sanitizeMetadata(sanitized.meta, errors)
            }

            return {
                valid: errors.length === 0,
                errors,
                sanitized: errors.length === 0 ? sanitized : null
            }

        } catch (e) {
            errors.push(`Validation error: ${e.message}`)
            return { valid: false, errors, sanitized: null }
        }
    }

    /**
     * Deep clone with depth limit and validation
     */
    static deepClone(obj, depth, errors) {
        if (depth > this.MAX_OBJECT_DEPTH) {
            errors.push(`Object depth exceeds maximum (${this.MAX_OBJECT_DEPTH})`)
            return null
        }

        if (obj === null || obj === undefined) {
            return obj
        }

        // Primitives
        if (typeof obj !== 'object') {
            if (typeof obj === 'string') {
                return this.sanitizeString(obj, errors)
            }
            if (typeof obj === 'number' && !isFinite(obj)) {
                errors.push('Invalid number (NaN or Infinity)')
                return 0
            }
            return obj
        }

        // Arrays
        if (Array.isArray(obj)) {
            if (obj.length > this.MAX_ARRAY_LENGTH) {
                errors.push(`Array length exceeds maximum (${this.MAX_ARRAY_LENGTH})`)
                return []
            }
            return obj.map(item => this.deepClone(item, depth + 1, errors))
        }

        // Objects
        const cloned = {}
        const keys = Object.keys(obj)
        if (keys.length > this.MAX_ARRAY_LENGTH) {
            errors.push(`Object has too many keys (${keys.length})`)
            return {}
        }

        for (const key of keys) {
            // Validate key is safe
            if (!this.isSimpleString(key)) {
                errors.push(`Dangerous object key detected: ${key}`)
                continue
            }
            cloned[key] = this.deepClone(obj[key], depth + 1, errors)
        }

        return cloned
    }

    /**
     * Check if string is simple (alphanumeric, underscore, dash)
     */
    static isSimpleString(str) {
        return typeof str === 'string' && /^[a-zA-Z0-9_-]+$/.test(str)
    }

    /**
     * Sanitize string values
     */
    static sanitizeString(str, errors) {
        if (typeof str !== 'string') {
            return String(str)
        }

        if (str.length > this.MAX_STRING_LENGTH) {
            errors.push(`String too long (${str.length} > ${this.MAX_STRING_LENGTH})`)
            return str.substring(0, this.MAX_STRING_LENGTH)
        }

        // Check for dangerous patterns
        for (const pattern of this.DANGEROUS_PATTERNS) {
            if (pattern.test(str)) {
                errors.push(`Dangerous pattern detected in string`)
                // Remove the dangerous content
                str = str.replace(pattern, '')
            }
        }

        return str
    }

    /**
     * Sanitize control values (should be numbers or colors)
     */
    static sanitizeControls(controls, errors, context) {
        const sanitized = {}

        for (const key in controls) {
            const value = controls[key]

            // Numbers
            if (typeof value === 'number') {
                if (!isFinite(value)) {
                    errors.push(`${context}: Invalid control value for ${key}`)
                    sanitized[key] = 0
                } else {
                    sanitized[key] = value
                }
            }
            // Colors (hex strings)
            else if (typeof value === 'string' && /^#[0-9a-f]{6,8}$/i.test(value)) {
                sanitized[key] = value
            }
            // Empty string for action buttons
            else if (value === '') {
                sanitized[key] = value
            }
            else {
                errors.push(`${context}: Invalid control type for ${key}`)
            }
        }

        return sanitized
    }

    /**
     * Sanitize option values
     */
    static sanitizeOptions(options, errors, context) {
        const sanitized = {}

        for (const key in options) {
            const value = options[key]

            // Options are typically simple strings or numbers
            if (typeof value === 'string') {
                sanitized[key] = this.sanitizeString(value, errors)
            } else if (typeof value === 'number' && isFinite(value)) {
                sanitized[key] = value
            } else if (typeof value === 'boolean') {
                sanitized[key] = value
            } else {
                errors.push(`${context}: Invalid option type for ${key}`)
            }
        }

        return sanitized
    }

    /**
     * Sanitize custom values object - MOST DANGEROUS
     * This is where nodes store arbitrary data
     */
    static sanitizeValues(values, errors, context) {
        const sanitized = {}

        for (const key in values) {
            const value = values[key]

            // Special handling for asset paths
            if (key === 'assetPath') {
                if (value === null || value === undefined) {
                    // null/undefined are safe - just means no asset selected
                    sanitized[key] = value
                } else if (typeof value === 'string') {
                    // Explicitly block file:// protocol in asset paths
                    if (value.toLowerCase().includes('file://')) {
                        errors.push(`${context}: file:// protocol not allowed in asset paths`)
                    } else if (typeof window !== 'undefined' && window.electronAPI) {
                        // In Electron mode: only allow asset:// URLs or empty strings
                        if (this.ASSET_PATH_REGEX.test(value) || value === '') {
                            sanitized[key] = value
                        } else {
                            errors.push(`${context}: Invalid asset path for Electron mode`)
                        }
                    } else {
                        // In web mode: ignore asset paths completely (they're from Electron saves)
                        // Just sanitize as a regular string but don't validate format
                        sanitized[key] = this.sanitizeString(value, errors)
                    }
                } else {
                    errors.push(`${context}: Asset path must be string, null, or undefined`)
                }
            }
            // Numbers
            else if (typeof value === 'number' && isFinite(value)) {
                sanitized[key] = value
            }
            // Booleans
            else if (typeof value === 'boolean') {
                sanitized[key] = value
            }
            // Simple strings
            else if (typeof value === 'string') {
                sanitized[key] = this.sanitizeString(value, errors)
            }
            // Arrays of numbers (for sequencers, etc)
            else if (Array.isArray(value) && value.every(v => typeof v === 'number')) {
                if (value.length <= this.MAX_ARRAY_LENGTH) {
                    sanitized[key] = value.filter(v => isFinite(v))
                } else {
                    errors.push(`${context}: Array too long in values.${key}`)
                }
            }
            // Nested objects (with depth check)
            else if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Limited recursion for nested objects
                sanitized[key] = this.deepClone(value, 7, errors)  // Start at depth 7 since we're already nested
            }
            else {
                errors.push(`${context}: Unsupported value type for ${key}`)
            }
        }

        return sanitized
    }

    /**
     * Sanitize MIDI mappings
     */
    static sanitizeMidiMappings(mappings, errors, context) {
        const sanitized = {}

        for (const key in mappings) {
            const mapping = mappings[key]

            if (mapping && typeof mapping === 'object') {
                // Validate MIDI mapping structure: {type: 'cc'|'note', value: number}
                if (typeof mapping.type === 'string' && typeof mapping.value === 'number') {
                    if (mapping.type === 'cc' && mapping.value >= 0 && mapping.value <= 127) {
                        sanitized[key] = { type: 'cc', value: mapping.value }
                    } else if (mapping.type === 'note' && mapping.value >= 0 && mapping.value <= 127) {
                        sanitized[key] = { type: 'note', value: mapping.value }
                    } else {
                        errors.push(`${context}: Invalid MIDI mapping type or value for ${key}`)
                    }
                } else {
                    errors.push(`${context}: Invalid MIDI mapping structure for ${key}`)
                }
            } else {
                errors.push(`${context}: MIDI mapping must be an object for ${key}`)
            }
        }

        return sanitized
    }

    /**
     * Sanitize metadata
     */
    static sanitizeMetadata(meta, errors) {
        const sanitized = {}

        // Whitelist of allowed metadata fields
        const allowedFields = ['name', 'author', 'description', 'version', 'timestamp', 'workspace']

        for (const field of allowedFields) {
            if (field in meta) {
                if (typeof meta[field] === 'string') {
                    sanitized[field] = this.sanitizeString(meta[field], errors)
                } else if (typeof meta[field] === 'number' && isFinite(meta[field])) {
                    sanitized[field] = meta[field]
                }
            }
        }

        // Skip thumbnail data - could be large and dangerous
        // Thumbnails should be regenerated, not loaded from untrusted sources

        return sanitized
    }
}