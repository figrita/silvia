// assetConstants.js - Single source of truth for asset-related constants

/**
 * Asset folder names (singular for audio, plural for others)
 */
export const ASSET_FOLDERS = {
    image: 'images',
    video: 'videos',
    audio: 'audio'
}

/**
 * Allowed file extensions for each asset type
 */
export const ALLOWED_EXTENSIONS = {
    image: [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp',
        '.ico', '.tiff', '.tif', '.avif', '.apng'
    ],
    video: [
        '.mp4', '.webm', '.ogv', '.mov', '.avi', '.mkv', '.m4v',
        '.mpg', '.mpeg', '.wmv', '.flv', '.3gp', '.mts', '.m2ts'
    ],
    audio: [
        '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma',
        '.opus', '.oga', '.webm', '.aiff', '.ape', '.alac', '.ac3',
        '.dts', '.amr', '.mid', '.midi', '.mka'
    ]
}

/**
 * Get all allowed extensions as a flat array
 */
export function getAllowedExtensions(type) {
    return ALLOWED_EXTENSIONS[type] || []
}

/**
 * Get all allowed extensions as a regex pattern
 */
export function getExtensionPattern(type) {
    const exts = getAllowedExtensions(type)
    if (exts.length === 0) return '[a-zA-Z0-9]+'

    // Escape dots and join with OR: (jpg|jpeg|png|...)
    const pattern = exts.map(ext => ext.replace('.', '')).join('|')
    return `(${pattern})`
}

/**
 * Build asset path regex for validation
 */
export function buildAssetPathRegex() {
    // asset://(images|videos|audio)/[16 hex chars].(allowed extensions)
    const folders = Object.values(ASSET_FOLDERS).join('|')

    // Get all extensions from all types
    const allExts = [
        ...ALLOWED_EXTENSIONS.image,
        ...ALLOWED_EXTENSIONS.video,
        ...ALLOWED_EXTENSIONS.audio
    ].map(ext => ext.replace('.', '')).join('|')

    return new RegExp(`^asset://(${folders})/[a-f0-9]{16}\\.(${allExts})$`, 'i')
}

/**
 * Validate if an extension is allowed for a given type
 */
export function isValidExtension(extension, type) {
    const allowed = ALLOWED_EXTENSIONS[type]
    if (!allowed) return false

    const ext = extension.toLowerCase()
    return allowed.includes(ext)
}
