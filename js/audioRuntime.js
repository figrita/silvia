/**
 * audioRuntime.js — lifecycle manager for the persistent audio engine.
 *
 * One AudioWorkletNode ("engine") lives for the lifetime of each SynthOut.
 * Graph changes don't tear it down: the compiler emits a new DSP body and
 * the runtime posts it to the engine, which swaps its `program` function
 * in place. Phase, envelope, and filter state survive the swap because
 * they live inside the engine's `this.state`.
 *
 * Coordinates:
 *   • Which sinks (SynthOut nodes) are active.
 *   • One-shot registration of the engine AudioWorkletProcessor (per ctx).
 *   • Microtask-debounced recompile on graph changes (connect/disconnect,
 *     node add/remove, audio option change).
 *   • Parameter updates from UI knobs → postMessage to the matching engine.
 *   • Gate/action events (postMessage to every engine that owns that nid).
 *   • Mic audio input routing (external MediaStreamSources → engine inputs).
 */

import {getAudioContext, ensureAudioRunning} from './audioContext.js'
import {compileGraph} from './audioCompiler.js'
import {AUDIO_ENGINE_SOURCE} from './audioEngine.js'

// Hard cap on simultaneous mic inputs per engine. numberOfInputs can't be
// changed after construction, so this needs to be set up-front. Eight is
// more than enough for live patching; exceeding it logs a warning and the
// extra mics are silent.
const MAX_MIC_INPUTS = 8

class AudioRuntime {
    constructor(){
        this.sinks = new Set()
        // sinkNode → { engine, micConnections, paramNames, gateMap }
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
     * Flag the graph as dirty. A single recompile pass runs on the next
     * microtask; if another invalidate lands while that pass is in the
     * middle of an `await` (addModule is async on first call), the flag
     * survives until the current pass completes, then another pass runs.
     * This serializes compiles and never drops an edit.
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
                gateMap: {}
            }
            this.engines.set(sinkNode, entry)
            sinkNode._onWorkletReady?.(engine)
        }

        const compiled = compileGraph(sinkNode)

        if(!compiled){
            entry.engine.port.postMessage({type: 'silence'})
            this._updateMicConnections(entry, [])
            entry.paramNames = new Set()
            entry.gateMap = {}
            return
        }

        if(compiled.micNodes.length > MAX_MIC_INPUTS){
            console.warn(
                `audioRuntime: ${compiled.micNodes.length} mic nodes exceed ` +
                `engine cap of ${MAX_MIC_INPUTS}; extras will be silent.`
            )
        }

        entry.engine.port.postMessage({
            type: 'program',
            body: compiled.body,
            stateInit: compiled.stateInit,
            paramNames: compiled.paramNames,
            paramInit: compiled.paramInit
        })
        entry.paramNames = new Set(compiled.paramNames)
        entry.gateMap = compiled.gateMap

        this._updateMicConnections(entry, compiled.micNodes)

        ensureAudioRunning().catch(() => {})
    }

    _updateMicConnections(entry, micNodes){
        // Tear down previous mic wiring. The GainNodes themselves are owned
        // by the mic nodes and persist across recompiles; we only touch
        // their connection to the engine.
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
        for(const c of entry.micConnections){
            try { c.src.disconnect(c.sink, 0, c.idx) } catch(e){}
        }
        try { entry.engine.disconnect() } catch(e){}
        this.engines.delete(sinkNode)
        sinkNode._onWorkletReady?.(null)
    }

    /**
     * Push a knob value into every engine that uses the matching param.
     * The engine smooths toward the target with τ ≈ 5 ms per block, so
     * knob drags are zipper-free without any main-thread automation.
     */
    setNodeParam(nodeId, inputKey, value){
        const name = `n${nodeId}_${inputKey}`
        for(const entry of this.engines.values()){
            if(!entry.paramNames.has(name)) continue
            entry.engine.port.postMessage({type: 'param', name, value})
        }
    }

    /**
     * Forward a gate/trigger event to every engine that tracks this node.
     */
    postGate(nodeId, inputKey, value){
        const nid = `n${nodeId}`
        for(const entry of this.engines.values()){
            if(!entry.gateMap[nid]) continue
            if(!(inputKey in entry.gateMap[nid])) continue
            entry.engine.port.postMessage({type: 'gate', nid, key: inputKey, value})
        }
    }

    /**
     * The engine node tied to a given sink (or null if none).
     */
    workletFor(sinkNode){
        return this.engines.get(sinkNode)?.engine || null
    }
}

export const audioRuntime = new AudioRuntime()

/**
 * Hook up an audio node's s-number controls so dragging a knob posts the
 * new value to the engine. Connected float inputs are driven by the graph
 * and don't need UI routing — skip them.
 *
 * Call from an audio node's onCreate.
 */
export function bindAudioControls(snode){
    if(!snode?.nodeEl) return
    for(const key in (snode.input || {})){
        const port = snode.input[key]
        if(port?.type !== 'float' || !port.control) continue
        const ctrl = snode.nodeEl.querySelector(`[data-input-el="${key}"]`)
        if(!ctrl) continue
        ctrl.addEventListener('input', (e) => {
            if(snode.input[key].connection) return
            const v = parseFloat(e.target.value)
            if(!Number.isFinite(v)) return
            audioRuntime.setNodeParam(snode.id, key, v)
        })
    }
}
