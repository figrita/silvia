/**
 * audioRuntime.js — lifecycle manager for graph-compiled AudioWorkletNodes.
 *
 * One instance (the singleton exported below) coordinates:
 *   • Which sinks (SynthOut nodes) are active.
 *   • Debounced recompile on graph changes (connection add/remove, node
 *     add/remove, audio option change).
 *   • Parameter updates from UI knobs (route to the matching worklet param).
 *   • Gate/action events (postMessage to every worklet that owns that nid).
 *   • Mic audio input routing (external MediaStreamSources → worklet inputs).
 *   • State handoff between successive worklets so oscillator phase, envelope
 *     level, etc. are preserved across recompiles.
 */

import {getAudioContext, ensureAudioRunning} from './audioContext.js'
import {compileGraph} from './audioCompiler.js'

class AudioRuntime {
    constructor(){
        this.sinks = new Set()          // SynthOut node instances
        this.worklets = new Map()       // sinkNode → { node, micConnections, paramNames, gateMap, stateInit }
        this._invalidated = false
        this._moduleCounter = 0
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
     * middle of an `await` (addModule is async), the flag survives until
     * the current pass completes, then another pass runs. This serializes
     * compiles and never drops an edit.
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
        for(const sink of this.sinks){
            try { await this._recompileOne(sink) }
            catch(e){ console.warn('audioRuntime recompile failed:', e) }
        }
    }

    async _recompileOne(sinkNode){
        const ctx = getAudioContext()
        if(!ctx) return

        const compiled = compileGraph(sinkNode)

        // If nothing feeds this sink, tear down silently.
        if(!compiled){
            this._tearDown(sinkNode)
            return
        }

        // Capture state from the currently-running worklet so the new one
        // can resume mid-phase. postMessage is async, so we race with a
        // small timeout — worst case the new worklet starts from its
        // default state and we get a tiny glitch.
        const prev = this.worklets.get(sinkNode)
        let preservedState = null
        if(prev?.node){
            preservedState = await dumpWorkletState(prev.node).catch(() => null)
        }

        const blobUrl = URL.createObjectURL(new Blob([compiled.source], {type: 'application/javascript'}))
        try {
            await ctx.audioWorklet.addModule(blobUrl)
        } finally {
            // Revoke after a microtask — Chrome needs it around long enough
            // for addModule to finish fetching, but not forever.
            setTimeout(() => URL.revokeObjectURL(blobUrl), 0)
        }

        const workletNode = new AudioWorkletNode(ctx, compiled.processorName, {
            numberOfInputs:  Math.max(1, compiled.micNodes.length),
            numberOfOutputs: 1,
            outputChannelCount: [2],
            parameterData: buildInitialParamData(compiled.paramDescriptors)
        })

        // Connect external mic sources into the worklet's input slots.
        const micConnections = []
        compiled.micNodes.forEach((micNode, idx) => {
            const out = micNode.runtimeState?.outGain
            if(out){
                try { out.connect(workletNode, 0, idx) } catch(e){}
                micConnections.push({src: out, sink: workletNode, idx})
            }
        })

        // Send preserved state so the new processor picks up where the old
        // one left off (phase, envelope stage/level, etc.).
        if(preservedState){
            workletNode.port.postMessage({type: 'state', state: preservedState})
        }

        workletNode.connect(ctx.destination)

        // Swap: disconnect old, keep new. Tiny crossfade could go here
        // later — for patch-building, a brief click on rewire is fine.
        if(prev){
            try { prev.node.disconnect() } catch(e){}
            for(const c of prev.micConnections){
                try { c.src.disconnect(c.sink, 0, c.idx) } catch(e){}
            }
        }

        this.worklets.set(sinkNode, {
            node: workletNode,
            micConnections,
            paramNames: new Set(compiled.paramDescriptors.map(p => p.name)),
            gateMap: compiled.gateMap,
            stateInit: compiled.stateInit
        })

        // Hand the worklet node to the sink for side-channel hookups (the
        // analyser tap for the oscilloscope, for instance).
        sinkNode._onWorkletReady?.(workletNode)

        ensureAudioRunning().catch(() => {})
    }

    _tearDown(sinkNode){
        const entry = this.worklets.get(sinkNode)
        if(!entry) return
        try { entry.node.disconnect() } catch(e){}
        for(const c of entry.micConnections){
            try { c.src.disconnect(c.sink, 0, c.idx) } catch(e){}
        }
        this.worklets.delete(sinkNode)
        sinkNode._onWorkletReady?.(null)
    }

    /**
     * Push a knob value into every worklet that owns the matching
     * parameter. Node-id-scoped naming means updates route unambiguously.
     */
    setNodeParam(nodeId, inputKey, value){
        const name = `n${nodeId}_${inputKey}`
        for(const entry of this.worklets.values()){
            if(!entry.paramNames.has(name)) continue
            const p = entry.node.parameters.get(name)
            if(!p) continue
            try {
                const ctx = getAudioContext()
                p.setTargetAtTime(value, ctx.currentTime, 0.005)
            } catch(e){}
        }
    }

    /**
     * Forward a gate/trigger event to every worklet that tracks this node.
     */
    postGate(nodeId, inputKey, value){
        const nid = `n${nodeId}`
        for(const entry of this.worklets.values()){
            if(!entry.gateMap[nid]) continue
            if(!(inputKey in entry.gateMap[nid])) continue
            entry.node.port.postMessage({type: 'gate', nid, key: inputKey, value})
        }
    }

    /**
     * The worklet tied to a given sink (or null if none).
     */
    workletFor(sinkNode){
        return this.worklets.get(sinkNode)?.node || null
    }
}

function buildInitialParamData(descriptors){
    const data = {}
    for(const d of descriptors){
        data[d.name] = d.defaultValue
    }
    return data
}

function dumpWorkletState(workletNode){
    return new Promise((resolve, reject) => {
        let done = false
        const timer = setTimeout(() => {
            if(done) return
            done = true
            workletNode.port.removeEventListener('message', onMsg)
            reject(new Error('state-dump timeout'))
        }, 30)
        const onMsg = (e) => {
            if(e.data?.type !== 'state-dump') return
            if(done) return
            done = true
            clearTimeout(timer)
            workletNode.port.removeEventListener('message', onMsg)
            resolve(e.data.state)
        }
        workletNode.port.addEventListener('message', onMsg)
        workletNode.port.start?.()
        workletNode.port.postMessage({type: 'dump'})
    })
}

export const audioRuntime = new AudioRuntime()

/**
 * Hook up an audio node's s-number controls so dragging a knob updates the
 * running worklet's parameter (when unconnected) and, if the control value
 * is one that changes the *topology or shape* of the compiled code (option
 * changes handled elsewhere), triggers a recompile instead.
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

