/**
 * PhaseAccumulator - Provides smooth phase accumulation with speed transitions
 * 
 * Solves the discontinuity problem when speed parameters change by maintaining
 * accumulated phase instead of using raw time * speed calculations.
 * 
 * Features:
 * - Smooth speed interpolation over configurable transition time
 * - High precision timing using performance.now()
 * - Configurable speed limits and transition curves
 * - Support for pause/resume functionality
 * - Memory-efficient state management
 */
export class PhaseAccumulator {
    constructor(options = {}) {
        this.phase = options.initialPhase || 0.0
        this.speed = options.initialSpeed || 1.0
        this.lastUpdateTime = performance.now() / 1000
        
        // Speed transition configuration
        this.transitionDuration = options.transitionDuration || 0.1 // 100ms default
        this.minSpeed = options.minSpeed !== undefined ? options.minSpeed : -10.0
        this.maxSpeed = options.maxSpeed !== undefined ? options.maxSpeed : 10.0
        
        // Current speed transition state
        this.targetSpeed = this.speed
        this.transitionStartTime = -1
        this.transitionStartSpeed = this.speed
        
        // Pause state
        this.isPaused = false
        this.pauseStartTime = 0
        this.pausedPhase = 0
        
        // Curve function for speed transitions (smoothstep by default)
        this.transitionCurve = options.transitionCurve || this._smoothstep
    }
    
    /**
     * Update phase accumulation and return current phase
     * @param {number} newSpeed - Target speed (will be smoothly interpolated)
     * @returns {number} Current accumulated phase
     */
    update(newSpeed = null) {
        const currentTime = performance.now() / 1000
        
        // If paused, return frozen phase
        if (this.isPaused) {
            return this.pausedPhase
        }
        
        // Handle new speed changes
        if (newSpeed !== null && Math.abs(newSpeed - this.targetSpeed) > 0.001) {
            this._startSpeedTransition(newSpeed, currentTime)
        }
        
        // Calculate current interpolated speed
        const currentSpeed = this._getCurrentSpeed(currentTime)
        
        // Accumulate phase using delta time
        const deltaTime = currentTime - this.lastUpdateTime
        this.phase += deltaTime * currentSpeed
        this.lastUpdateTime = currentTime
        
        return this.phase
    }
    
    /**
     * Get current accumulated phase without updating
     * @returns {number} Current phase value
     */
    getPhase() {
        return this.isPaused ? this.pausedPhase : this.phase
    }
    
    /**
     * Get current interpolated speed
     * @returns {number} Current speed value
     */
    getCurrentSpeed() {
        return this._getCurrentSpeed(performance.now() / 1000)
    }
    
    /**
     * Reset phase to specified value
     * @param {number} newPhase - New phase value (default: 0)
     */
    resetPhase(newPhase = 0.0) {
        this.phase = newPhase
        this.pausedPhase = newPhase
        this.lastUpdateTime = performance.now() / 1000
    }
    
    /**
     * Set speed instantly without interpolation
     * @param {number} newSpeed - New speed value
     */
    setSpeedImmediate(newSpeed) {
        this.speed = Math.max(this.minSpeed, Math.min(this.maxSpeed, newSpeed))
        this.targetSpeed = this.speed
        this.transitionStartTime = -1
    }
    
    /**
     * Pause phase accumulation
     */
    pause() {
        if (!this.isPaused) {
            this.isPaused = true
            this.pauseStartTime = performance.now() / 1000
            this.pausedPhase = this.phase
        }
    }
    
    /**
     * Resume phase accumulation
     */
    resume() {
        if (this.isPaused) {
            this.isPaused = false
            this.phase = this.pausedPhase
            this.lastUpdateTime = performance.now() / 1000
        }
    }
    
    /**
     * Check if currently transitioning between speeds
     * @returns {boolean} True if speed is transitioning
     */
    isTransitioning() {
        if (this.transitionStartTime < 0) return false
        const currentTime = performance.now() / 1000
        return (currentTime - this.transitionStartTime) < this.transitionDuration
    }
    
    // Private methods
    
    _startSpeedTransition(newSpeed, currentTime) {
        // Clamp speed to limits
        newSpeed = Math.max(this.minSpeed, Math.min(this.maxSpeed, newSpeed))
        
        this.targetSpeed = newSpeed
        this.transitionStartTime = currentTime
        this.transitionStartSpeed = this._getCurrentSpeed(currentTime)
    }
    
    _getCurrentSpeed(currentTime) {
        // No transition active, return current speed
        if (this.transitionStartTime < 0) {
            return this.speed
        }
        
        const elapsed = currentTime - this.transitionStartTime
        
        // Transition complete
        if (elapsed >= this.transitionDuration) {
            this.speed = this.targetSpeed
            this.transitionStartTime = -1
            return this.speed
        }
        
        // Interpolate between start and target speed
        const t = elapsed / this.transitionDuration
        const curvedT = this.transitionCurve(t)
        return this.transitionStartSpeed + (this.targetSpeed - this.transitionStartSpeed) * curvedT
    }
    
    // Default transition curve (smoothstep)
    _smoothstep(t) {
        return t * t * (3.0 - 2.0 * t)
    }
    
    /**
     * Serialize state for saving
     * @returns {Object} Serializable state
     */
    serialize() {
        return {
            phase: this.phase,
            speed: this.speed,
            isPaused: this.isPaused,
            pausedPhase: this.pausedPhase
        }
    }
    
    /**
     * Restore state from serialized data
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        if (data.phase !== undefined) this.phase = data.phase
        if (data.speed !== undefined) {
            this.speed = data.speed
            this.targetSpeed = data.speed
        }
        if (data.isPaused !== undefined) this.isPaused = data.isPaused
        if (data.pausedPhase !== undefined) this.pausedPhase = data.pausedPhase
        
        this.lastUpdateTime = performance.now() / 1000
        this.transitionStartTime = -1
    }
}

/**
 * Global phase accumulator manager for nodes that need coordinated timing
 */
export class GlobalPhaseManager {
    constructor() {
        this.accumulators = new Map()
    }
    
    /**
     * Get or create a phase accumulator for a node
     * @param {string} nodeId - Unique identifier for the node
     * @param {Object} options - PhaseAccumulator options
     * @returns {PhaseAccumulator} Phase accumulator instance
     */
    getAccumulator(nodeId, options = {}) {
        if (!this.accumulators.has(nodeId)) {
            this.accumulators.set(nodeId, new PhaseAccumulator(options))
        }
        return this.accumulators.get(nodeId)
    }
    
    /**
     * Remove phase accumulator for a node (cleanup)
     * @param {string} nodeId - Node identifier
     */
    removeAccumulator(nodeId) {
        this.accumulators.delete(nodeId)
    }
    
    /**
     * Update all managed accumulators
     */
    updateAll() {
        for (const accumulator of this.accumulators.values()) {
            accumulator.update()
        }
    }
    
    /**
     * Serialize all accumulators for saving
     * @returns {Object} Serialized state
     */
    serialize() {
        const state = {}
        for (const [nodeId, accumulator] of this.accumulators.entries()) {
            state[nodeId] = accumulator.serialize()
        }
        return state
    }
    
    /**
     * Restore all accumulators from serialized data
     * @param {Object} data - Serialized state
     */
    deserialize(data) {
        for (const [nodeId, accumulatorData] of Object.entries(data)) {
            if (this.accumulators.has(nodeId)) {
                this.accumulators.get(nodeId).deserialize(accumulatorData)
            }
        }
    }
}

// Global instance for coordinated timing across nodes
export const globalPhaseManager = new GlobalPhaseManager()