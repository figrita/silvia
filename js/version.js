/**
 * Centralized version tracking for Silvia patch format
 *
 * This module provides a single source of truth for the patch format version
 * used in serialization and deserialization across the application.
 */

/**
 * Current patch format version
 *
 * Version History:
 * - 0.1: Initial patch format
 * - 0.2: Added control ranges and asset references
 * - 0.6.0: Flat workspace system (development)
 * - 0.7.0: Flat workspace system with multi-workspace node visibility
 */
export const PATCH_VERSION = '0.7.0'

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