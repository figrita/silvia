/**
 * Centralized version tracking for the Silvia .svs file format.
 *
 * PATCH_VERSION = the .svs file format version.
 * "Patch" here means the serialized file format, not a UI concept.
 * The user-facing term is "workspace".
 */

/**
 * Current patch format version
 *
 * Version History:
 * - 0.1: Initial patch format
 * - 0.2: Added control ranges and asset references
 * - 0.6.0: Flat workspace system (development)
 * - 0.7-beta: Flat workspace system with multi-workspace node visibility
 */
export const PATCH_VERSION = '0.7-beta'

/**
 * Get the current patch format version
 * @returns {string} The current patch version
 */
export function getCurrentVersion() {
    return PATCH_VERSION
}

/**
 * Add version to a patch object
 * @param {Object} patch - The patch object to add version to
 * @returns {Object} The patch object with version added
 */
export function addVersionToPatch(patch) {
    patch.version = PATCH_VERSION
    return patch
}