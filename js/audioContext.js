/**
 * Shared Web Audio runtime.
 *
 * Browsers require an AudioContext to be created/resumed from a user gesture,
 * so the context is created lazily on first access and we install one-shot
 * listeners that `.resume()` on the next pointerdown or keydown.
 *
 * Audio nodes reach their underlying `AudioNode`s into `runtimeState` and
 * expose them on their ports (`output.audioNode` and `input.audioInput`) so
 * the Connection class can wire them together when audio-typed cables are
 * created or destroyed.
 */

let ctx = null

export function getAudioContext(){
    if(!ctx){
        const Ctor = window.AudioContext || window.webkitAudioContext
        if(!Ctor){
            console.warn('Web Audio API not available in this environment.')
            return null
        }
        ctx = new Ctor()
    }
    return ctx
}

/** Resolve once the AudioContext is actually running. Safe to call anytime. */
export function ensureAudioRunning(){
    const c = getAudioContext()
    if(!c) return Promise.reject(new Error('No AudioContext'))
    if(c.state === 'running') return Promise.resolve()
    return c.resume()
}

let userGestureArmed = false
/**
 * Install one-shot listeners so the first user interaction resumes the
 * AudioContext. Called from main.js during app init; idempotent.
 */
export function armUserGestureAutoResume(){
    if(userGestureArmed) return
    userGestureArmed = true
    const resume = () => {
        ensureAudioRunning().catch(() => {})
        document.removeEventListener('pointerdown', resume, true)
        document.removeEventListener('keydown', resume, true)
    }
    document.addEventListener('pointerdown', resume, {capture: true, once: true})
    document.addEventListener('keydown', resume, {capture: true, once: true})
}
