// audioSystem.js - Global singleton AudioContext manager
//
// Browsers limit the number of AudioContext instances (typically ~6).
// This module provides a shared AudioContext for all audio analysis operations.

let globalAudioContext = null

/**
 * Returns the global AudioContext instance, creating it if necessary.
 * @returns {AudioContext|null} The shared AudioContext or null on error
 */
export function getAudioContext() {
    if (!globalAudioContext || globalAudioContext.state === 'closed') {
        try {
            globalAudioContext = new (window.AudioContext || window.webkitAudioContext)()
            console.log('Global AudioContext created')
        } catch (e) {
            console.error('Could not create AudioContext:', e)
            return null
        }
    }
    return globalAudioContext
}

/**
 * Closes the global AudioContext if it exists.
 * Use with caution - this will affect all audio analyzers.
 */
export function closeAudioContext() {
    if (globalAudioContext && globalAudioContext.state !== 'closed') {
        globalAudioContext.close().catch(e => console.error('Error closing global AudioContext:', e))
        globalAudioContext = null
        console.log('Global AudioContext closed')
    }
}
