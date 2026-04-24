/**
 * audioRuntime.js — lifecycle manager for the persistent audio engine.
 *
 * One AudioWorkletNode ("engine") lives for the lifetime of each SynthOut.
 * Graph changes don't tear it down: the compiler emits a new DSP body, the
 * runtime posts it, and the engine crossfades programs click-free.
 *
 * Coordinates:
 *   • Active sinks (SynthOut nodes).
 *   • One-shot registration of the AudioWorkletProcessor per ctx.
 *   • Microtask-debounced recompile on graph changes.
 *   • Central wiring of UI knobs → engine params (replaces the old
 *     per-node bindAudioControls opt-in).
 *   • Gate/action events forwarded to every engine that tracks the nid.
 *   • Mic audio input routing (MediaStreamSource → engine input slot).
 *   • AudioCompileError caught silently; previous program keeps playing.
 */

import {getAudioContext, ensureAudioRunning} from './audioContext.js'
import {compileGraph, AudioCompileError} from './audioCompiler.js'
import {AUDIO_ENGINE_SOURCE} from './audioEngine.js'

const MAX_MIC_INPUTS = 8

class AudioRuntime {
    constructor(){
        this.sinks = new Set()
        this.engines = new Map()
        this._dirty = false
        this._scheduled = false
        this._modulePromise = null
    }

    registerSink(sinkNode){
        this.sinks.add(sinkNode)
        this.invalidate()
    }

    unregisterSink(sinkNode){
        this.sinks.delete(sinkNode)
        this._tearDown(sinkNode)
    }

    /**
     * Flag the graph dirty. A single recompile pass runs on the next
     * microtask; another invalidate while that pass is awaiting just keeps
     * the flag set so another pass follows. Compiles serialize, no edit is
     * ever dropped.
     */
    invalidate(){
        this._dirty = true
        if(this._scheduled) return
        this._scheduled = true
        queueMicrotask(async () => {
            try {
                while(this._dirty){
                    this._dirty = false
                    await this._recompileAll()
                }
            } finally {
                this._scheduled = false
            }
        })
    }

    async _recompileAll(){
        const ctx = getAudioContext()
        if(!ctx) return
        try { await this._ensureEngineModule(ctx) }
        catch(e){ console.warn('audioRuntime: engine module load failed:', e); return }
        for(const sink of this.sinks){
            try { await this._recompileOne(sink) }
            catch(e){ console.warn('audioRuntime recompile failed:', e) }
        }
    }

    _ensureEngineModule(ctx){
        if(this._modulePromise) return this._modulePromise
        const blobUrl = URL.createObjectURL(
            new Blob([AUDIO_ENGINE_SOURCE], {type: 'application/javascript'})
        )
        this._modulePromise = ctx.audioWorklet.addModule(blobUrl)
            .finally(() => setTimeout(() => URL.revokeObjectURL(blobUrl), 0))
        return this._modulePromise
    }

    async _recompileOne(sinkNode){
        const ctx = getAudioContext()
        if(!ctx) return

        let entry = this.engines.get(sinkNode)
        if(!entry){
            const engine = new AudioWorkletNode(ctx, 'silvia-audio-engine', {
                numberOfInputs: MAX_MIC_INPUTS,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            })
            engine.connect(ctx.destination)
            entry = {
                engine,
                micConnections: [],
                paramNames: new Set(),
                gateMap: {},
                paramListeners: []
            }
            this.engines.set(sinkNode, entry)
            sinkNode._onWorkletReady?.(engine)
        }

        let compiled
        try {
            compiled = compileGraph(sinkNode, 'audio', ctx.sampleRate)
        } catch(err){
            if(err instanceof AudioCompileError){
                console.warn('audio compile error:', err.message)
                // Surface the error on the sink so the user notices — the
                // previous program keeps playing, which is easy to miss.
                sinkNode._setAudioCompileError?.(err.message)
                return
            }
            throw err
        }
        sinkNode._setAudioCompileError?.(null)

        if(!compiled){
            // Normal "nothing connected" path — use a silence body so the
            // engine still crossfades from whatever was playing to zero.
            entry.engine.port.postMessage({
                type: 'program',
                body: "'use strict'; ch0.fill(0); if(ch1) ch1.fill(0);",
                stateInit: {},
                paramNames: [],
                paramInit: {},
                gateMap: {}
            })
            this._updateMicConnections(entry, [])
            entry.paramNames = new Set()
            entry.gateMap = {}
            this._clearParamListeners(entry)
            return
        }

        if(compiled.micNodes.length > MAX_MIC_INPUTS){
            console.warn(
                `audioRuntime: ${compiled.micNodes.length} mic nodes exceed ` +
                `engine cap of ${MAX_MIC_INPUTS}; extras will be silent.`
            )
        }

        const paramNames = [...compiled.params.keys()]
        const paramInit = {}
        for(const [name, spec] of compiled.params){
            paramInit[name] = spec.init
        }

        entry.engine.port.postMessage({
            type: 'program',
            body: compiled.body,
            stateInit: compiled.stateInit,
            paramNames,
            paramInit,
            gateMap: compiled.gateMap
        })
        entry.paramNames = new Set(paramNames)
        entry.gateMap = compiled.gateMap

        this._attachParamListeners(entry, compiled.params)
        this._updateMicConnections(entry, compiled.micNodes)

        ensureAudioRunning().catch(() => {})
    }

    _clearParamListeners(entry){
        for(const {el, handler} of entry.paramListeners){
            try { el.removeEventListener('input', handler) } catch(e){}
        }
        entry.paramListeners = []
    }

    /**
     * Replace this sink's knob→engine listeners. Called on every recompile.
     * Knob DOM elements are looked up per-param; connected inputs are
     * filtered at event time (the graph drives them, not the knob).
     */
    _attachParamListeners(entry, params){
        this._clearParamListeners(entry)
        for(const [, spec] of params){
            const el = spec.node.nodeEl?.querySelector(`[data-input-el="${spec.inputKey}"]`)
            if(!el) continue
            const node = spec.node
            const key = spec.inputKey
            const handler = (e) => {
                if(node.input?.[key]?.connection) return
                const v = parseFloat(e.target.value)
                if(!Number.isFinite(v)) return
                audioRuntime.setNodeParam(node.id, key, v)
            }
            el.addEventListener('input', handler)
            entry.paramListeners.push({el, handler})
        }
    }

    _updateMicConnections(entry, micNodes){
        for(const c of entry.micConnections){
            try { c.src.disconnect(c.sink, 0, c.idx) } catch(e){}
        }
        const next = []
        micNodes.forEach((micNode, idx) => {
            if(idx >= MAX_MIC_INPUTS) return
            const src = micNode.runtimeState?.outGain
            if(!src) return
            try { src.connect(entry.engine, 0, idx) } catch(e){}
            next.push({src, sink: entry.engine, idx})
        })
        entry.micConnections = next
    }

    _tearDown(sinkNode){
        const entry = this.engines.get(sinkNode)
        if(!entry) return
        this._clearParamListeners(entry)
        for(const c of entry.micConnections){
            try { c.src.disconnect(c.sink, 0, c.idx) } catch(e){}
        }
        try { entry.engine.disconnect() } catch(e){}
        this.engines.delete(sinkNode)
        sinkNode._onWorkletReady?.(null)
    }

    /**
     * Push a knob value to every engine using this param. Smoothing happens
     * inside the compiled body (per-sample one-pole), so drags are
     * zipper-free with no main-thread automation.
     *
     * NaN/Infinity are dropped at the boundary: a single poisoned value
     * (bad MIDI mapping, divide-by-zero upstream) would otherwise pin an
     * entire program until the next recompile.
     */
    setNodeParam(nodeId, inputKey, value){
        if(!Number.isFinite(value)) return
        const name = `n${nodeId}_${inputKey}`
        for(const entry of this.engines.values()){
            if(!entry.paramNames.has(name)) continue
            entry.engine.port.postMessage({type: 'param', name, value})
        }
    }

    /**
     * Forward a gate/trigger to every engine that tracks this node. During
     * a fade both programs receive the write, so the event doesn't split
     * across the crossfade boundary. Non-finite values are dropped for the
     * same reason as setNodeParam.
     */
    postGate(nodeId, inputKey, value){
        if(!Number.isFinite(value)) return
        const nid = `n${nodeId}`
        for(const entry of this.engines.values()){
            if(!entry.gateMap[nid]) continue
            if(!(inputKey in entry.gateMap[nid])) continue
            entry.engine.port.postMessage({type: 'gate', nid, key: inputKey, value})
        }
    }

    workletFor(sinkNode){
        return this.engines.get(sinkNode)?.engine || null
    }
}

export const audioRuntime = new AudioRuntime()
