/**
 * audioCompiler.js — visited-recursive, pull-based audio compiler.
 *
 * Pass 1 walks upstream from the sink, recording which (node, outputKey)
 * pairs are referenced anywhere downstream. Pass 2 emits in topological
 * order: optional node-level setup (genAudioSetup) followed by `const`
 * declarations for each *requested* output, in declaration order. Outputs
 * that aren't referenced are never evaluated — their genAudio is not
 * called and no code is emitted for them.
 *
 * Per-output genAudio mirrors the video compiler's per-output genCode:
 * each output port owns its own expression generator.
 *
 * Output shape:
 *   {
 *     body:       string,   // for new Function(s, p, inputs, ch0, ch1,
 *                            //                 blockSize, sampleRate, body)
 *     stateInit:  object,   // per-nid initial state, plus reserved `_psmooth`
 *     params:     Map,      // name → {node, inputKey, init, min, max}
 *     gateMap:    object,   // nid → {actionKey: initialValue}
 *     micNodes:   Node[],   // discovery order; defines engine input slots
 *     sinkNode:   Node
 *   }
 *
 * Node authoring:
 *   output[k].genAudio(ctx)
 *     Required for every declared output. Returns the expression string
 *     used wherever this output is referenced. Called only for outputs
 *     that are actually used downstream.
 *
 *   node.genAudioSetup(ctx)
 *     Optional. Runs once per sample, before any of this node's outputs
 *     are evaluated. Use it for shared state updates that multiple
 *     outputs read from. Emit lines via ctx.line(); they're wrapped in
 *     a scoping block so local const/let declarations don't leak across
 *     nodes. Outputs read state via ctx.state(), not setup-locals.
 *
 *   node.genSinkAudio(ctx)
 *     Sink-only. Receives `ctx.upstream` (the pre-sink expression) and
 *     returns the final-sample expression assigned to ch0[i].
 *
 * ctx surface:
 *   ctx.in(key)      Connected → upstream output var (`_out_n<id>_<key>`).
 *                    Unconnected float w/ control → smoothed param ref
 *                    (`_v_n<id>_<key>`). Else → '0'.
 *   ctx.state(f)     `s.n<id>.<f>`.
 *   ctx.option(k)    Option value baked at compile time (literal).
 *   ctx.line(stmt)   Append a statement at this point in the loop body.
 *   ctx.tmp()        Fresh globally-unique temp name.
 *   ctx.upstream     (sink only) the expression for the pre-sink sample.
 *   ctx.micIdx       (mic nodes) the engine-input slot index assigned.
 *   ctx.sr / ctx.i   Literals 'sampleRate' / 'i'.
 */

import {deepClone} from './utils.js'

export class AudioCompileError extends Error {
    constructor(message){
        super(message)
        this.name = 'AudioCompileError'
    }
}

function currentControlValue(node, inputKey){
    const port = node.input?.[inputKey]
    if(!port?.control) return 0
    const ctrlEl = node.nodeEl?.querySelector(`[data-input-el="${inputKey}"]`)
    if(ctrlEl){
        const v = parseFloat(ctrlEl.value)
        if(Number.isFinite(v)) return v
    }
    return port.control.default ?? 0
}

class CompileContext {
    constructor(){
        this.params = new Map()
        this.stateInit = Object.create(null)
        this.gateMap = Object.create(null)
        this.micNodes = []
        this.tmpCounter = 0

        // Pass 1 — usage collection.
        this.usage = new Map()    // nodeId → {node, usedOutputs: Set<outKey>}
        this.order = []           // nodeIds in post-order (topological)
        this.visiting = new Set()

        // Pass 2 — emission. Lines accumulated here become the loop body.
        this.lines = []
    }

    registerParam(node, inputKey){
        const name = `n${node.id}_${inputKey}`
        if(!this.params.has(name)){
            const port = node.input[inputKey]
            this.params.set(name, {
                node, inputKey,
                init: currentControlValue(node, inputKey),
                min: port.control?.min,
                max: port.control?.max
            })
        }
        return `_v_${name}`
    }

    collectGates(node){
        const nid = `n${node.id}`
        const slot = this.stateInit[nid]
        if(!slot) return
        for(const key in (node.input || {})){
            const port = node.input[key]
            if(port?.type === 'action' && key in slot){
                this.gateMap[nid] = this.gateMap[nid] || {}
                this.gateMap[nid][key] = slot[key] ?? 0
            }
        }
    }

    // --- Pass 1: usage collection ---

    /** Walk every connected input of the sink. The sink itself isn't a
     *  producing node, but goes into `visiting` so any back-edge that
     *  references it as an output source is caught as a cycle. */
    markSinkInputs(sinkNode){
        this.visiting.add(sinkNode.id)
        try {
            this._recurseInputs(sinkNode)
        } finally {
            this.visiting.delete(sinkNode.id)
        }
    }

    markUsedOutput(node, outputKey){
        if(this.visiting.has(node.id)){
            throw new AudioCompileError(
                `Feedback cycle at node ${node.slug}#${node.id}. ` +
                `Audio feedback is not yet supported — break the cycle with an explicit delay.`
            )
        }
        if(!(outputKey in (node.output || {}))){
            throw new AudioCompileError(
                `Node ${node.slug}#${node.id} has no output named '${outputKey}'.`
            )
        }
        const existing = this.usage.get(node.id)
        if(existing){
            existing.usedOutputs.add(outputKey)
            return
        }
        this.visiting.add(node.id)
        const entry = {node, usedOutputs: new Set([outputKey])}
        this.usage.set(node.id, entry)
        try {
            // Mic slot index is assigned by discovery order in pass 1.
            if(node.slug === 'audio-mic' && !this.micNodes.includes(node)){
                this.micNodes.push(node)
            }
            this._recurseInputs(node)
        } finally {
            this.visiting.delete(node.id)
        }
        this.order.push(node.id)
    }

    _recurseInputs(node){
        for(const key in (node.input || {})){
            const port = node.input[key]
            if(port?.connection){
                this.markUsedOutput(port.connection.parent, port.connection.key)
            }
        }
    }

    // --- Pass 2: emission ---

    _makeCtx(node, {sinkUpstreamExpr = null} = {}){
        const nid = `n${node.id}`
        const micIdx = node.slug === 'audio-mic' ? this.micNodes.indexOf(node) : -1
        const cc = this

        const ctx = {
            sr: 'sampleRate',
            i: 'i',
            nid,
            micIdx,

            in(inputKey){
                const port = node.input?.[inputKey]
                if(!port) return '0'
                if(port.connection){
                    const upNid = `n${port.connection.parent.id}`
                    return `_out_${upNid}_${port.connection.key}`
                }
                if(port.type === 'float' && port.control){
                    return cc.registerParam(node, inputKey)
                }
                return '0'
            },

            state(f){ return `s.${nid}.${f}` },
            option(k){ return node.optionValues?.[k] ?? node.options?.[k]?.default },
            line(stmt){ cc.lines.push(stmt) },
            tmp(){ return `_t_${nid}_${cc.tmpCounter++}` }
        }
        if(sinkUpstreamExpr !== null){
            ctx.upstream = sinkUpstreamExpr
        }
        return ctx
    }

    /** Wrap setup output in a block so any const/let it declares is
     *  scoped to this node and can't collide with another instance of
     *  the same node type. If the setup emitted no lines, drop the
     *  empty block to keep the body tidy. */
    _withSetupBlock(setupFn){
        const before = this.lines.length
        this.lines.push(`{`)
        setupFn()
        if(this.lines.length === before + 1){
            this.lines.pop()
        } else {
            this.lines.push(`}`)
        }
    }

    emitNode(node, usedOutputs){
        const nid = `n${node.id}`
        this.stateInit[nid] = deepClone(node.audioState || {})
        this.collectGates(node)

        const ctx = this._makeCtx(node)

        if(typeof node.genAudioSetup === 'function'){
            this._withSetupBlock(() => node.genAudioSetup.call(node, ctx))
        }

        // Emit only requested outputs, in declaration order. Output
        // expressions read state and outer-scope params/upstream vars,
        // so the per-node setup block scope above doesn't restrict them.
        for(const outKey in (node.output || {})){
            if(!usedOutputs.has(outKey)) continue
            const outPort = node.output[outKey]
            if(typeof outPort.genAudio !== 'function'){
                throw new AudioCompileError(
                    `Output '${outKey}' on ${node.slug}#${node.id} is missing genAudio.`
                )
            }
            const expr = outPort.genAudio.call(node, ctx)
            if(typeof expr !== 'string'){
                throw new AudioCompileError(
                    `Output '${outKey}' on ${node.slug}#${node.id} genAudio must return an expression string.`
                )
            }
            this.lines.push(`const _out_${nid}_${outKey} = ${expr};`)
        }
    }

    emitSink(sinkNode, upstreamExpr){
        const nid = `n${sinkNode.id}`
        this.stateInit[nid] = deepClone(sinkNode.audioState || {})
        this.collectGates(sinkNode)

        const ctx = this._makeCtx(sinkNode, {sinkUpstreamExpr: upstreamExpr})

        if(typeof sinkNode.genAudioSetup === 'function'){
            this._withSetupBlock(() => sinkNode.genAudioSetup.call(sinkNode, ctx))
        }

        let finalExpr = upstreamExpr
        if(typeof sinkNode.genSinkAudio === 'function'){
            const result = sinkNode.genSinkAudio.call(sinkNode, ctx)
            if(typeof result === 'string') finalExpr = result
        }
        return finalExpr
    }
}

function assembleBody(cc, finalExpr){
    const names = [...cc.params.keys()]
    const hoists  = names.map(n => `let _v_${n} = s._psmooth.${n};`)
    const updates = names.map(n => `    _v_${n} += (p.${n} - _v_${n}) * K_SMOOTH;`)
    const writes  = names.map(n => `s._psmooth.${n} = _v_${n};`)

    const lines = [
        `'use strict';`,
        `const K_SMOOTH = 1 - Math.exp(-1 / (sampleRate * 0.005));`,
        ``
    ]
    if(hoists.length){
        lines.push(...hoists, ``)
    }
    lines.push(`for(let i = 0; i < blockSize; i++){`)
    if(updates.length) lines.push(...updates)
    lines.push(...cc.lines.map(s => `    ${s}`))
    lines.push(
        `    const _y = ${finalExpr};`,
        `    ch0[i] = _y;`,
        `    if(ch1) ch1[i] = _y;`,
        `}`
    )
    if(writes.length){
        lines.push(``, ...writes)
    }
    return lines.join('\n')
}

export function compileGraph(sinkNode, sinkInputKey = 'audio'){
    const sinkPort = sinkNode.input?.[sinkInputKey]
    const srcPort = sinkPort?.connection
    if(!srcPort) return null

    const cc = new CompileContext()

    // Pass 1 — walk every connected input of the sink so any node that
    // contributes (audio path, modulated knobs) becomes part of the
    // compile and gets its outputs marked as used.
    cc.markSinkInputs(sinkNode)

    // Pass 2 — emit traversed nodes in topological order, then the sink.
    for(const nid of cc.order){
        const {node, usedOutputs} = cc.usage.get(nid)
        cc.emitNode(node, usedOutputs)
    }

    const upstreamExpr = `_out_n${srcPort.parent.id}_${srcPort.key}`
    const finalExpr = cc.emitSink(sinkNode, upstreamExpr)

    // Reserved nid holds the per-param smoother carry-over. The engine's
    // state-merge logic preserves it across recompiles just like any
    // other state slot, so sweeps through a graph edit stay zipper-free.
    const psmoothInit = {}
    for(const [name, spec] of cc.params){
        psmoothInit[name] = spec.init
    }
    cc.stateInit._psmooth = psmoothInit

    const body = assembleBody(cc, finalExpr)

    return {
        body,
        stateInit: cc.stateInit,
        params: cc.params,
        gateMap: cc.gateMap,
        micNodes: cc.micNodes,
        sinkNode
    }
}
