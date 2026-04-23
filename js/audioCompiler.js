/**
 * audioCompiler.js — visited-recursive, pull-based audio compiler.
 *
 * Mirrors js/compiler.js (video side). Starts from the sink's audio input,
 * recurses upstream via `cc.getOutput(node, outputKey)`, caches by nodeId so
 * each node emits exactly one function no matter how many downstream nodes
 * reference it. Control-knob reads on unconnected float inputs are funneled
 * through `cc.registerParam` into a central registry (the video side's
 * `uniforms` analogue).
 *
 * Output shape:
 *   {
 *     body:       string,   // DSP body for new Function(s, p, inputs, ch0, ch1, blockSize, sampleRate, body)
 *     stateInit:  object,   // per-nid initial state, plus a reserved `_psmooth` slot
 *     params:     Map,      // name → {node, inputKey, init, min, max}; main-thread only
 *     gateMap:    object,   // nid → {actionKey: initialValue}
 *     micNodes:   Node[],   // in discovery order; defines engine input slot indices
 *     sinkNode:   Node
 *   }
 *
 * ctx surface in genAudio / genSinkAudio:
 *   ctx.in(key)      connected → arg name (`_in_<key>`) passed into the
 *                    node's function by the call site; unconnected float
 *                    with a control → `_v_<nid>_<key>` (outer-scope let,
 *                    accessed via closure); else → '0'.
 *   ctx.upstream     (sink only) the arg name receiving the graph's
 *                    pre-sink audio sample.
 *   ctx.state(f)     `s.<nid>.<f>`.
 *   ctx.option(k)    option value baked as a literal at compile time.
 *   ctx.line(stmt)   append a statement into this node's function body.
 *   ctx.tmp()        fresh globally-unique temp name.
 *   ctx.micIdx       mic nodes: the engine-input index assigned.
 *   ctx.sr / ctx.i   literals 'sampleRate' / 'i'.
 *
 * genAudio must return exactly one output `{key: expr}`. Multi-output is
 * a follow-up — it throws AudioCompileError if a node returns more/less.
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

function collectGates(cc, node){
    const nid = `n${node.id}`
    const slot = cc.stateInit[nid]
    if(!slot) return
    for(const key in (node.input || {})){
        const port = node.input[key]
        if(port?.type === 'action' && key in slot){
            cc.gateMap[nid] = cc.gateMap[nid] || {}
            cc.gateMap[nid][key] = slot[key] ?? 0
        }
    }
}

class CompileContext {
    constructor(){
        this.functions = []
        this.callSites = []
        this.visited = new Map()
        this.visiting = new Set()
        this.params = new Map()
        this.stateInit = {}
        this.gateMap = {}
        this.micNodes = []
        this.tmpCounter = 0
    }

    freshTmp(nid){
        return `_t_${nid}_${this.tmpCounter++}`
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

    getOutput(node, outputKey){
        if(this.visiting.has(node.id)){
            throw new AudioCompileError(
                `Feedback cycle at node ${node.slug}#${node.id}. ` +
                `Audio feedback is not yet supported — break the cycle with an explicit delay.`
            )
        }
        const cached = this.visited.get(node.id)
        if(cached){
            if(outputKey in cached) return cached[outputKey]
            throw new AudioCompileError(
                `Node ${node.slug}#${node.id} has no output named '${outputKey}'.`
            )
        }
        this.visiting.add(node.id)
        try {
            if(node.slug === 'audio-mic'){
                // Assign mic slot before emission so genAudio sees the right index.
                this.micNodes.push(node)
            }
            const emitted = emitNode(this, node)
            this.functions.push(emitted.fnSource)
            this.callSites.push(emitted.callSite)
            const nid = `n${node.id}`
            this.stateInit[nid] = deepClone(node.audioState || {})
            collectGates(this, node)
            this.visited.set(node.id, emitted.outputVars)
            return emitted.outputVars[outputKey]
        } finally {
            this.visiting.delete(node.id)
        }
    }
}

function makeNodeCtx(cc, node, nid, micIdx){
    const inputArgs = new Map()   // argName → upstream expression at outer scope
    const lines = []
    const ctx = {
        sr: 'sampleRate',
        i: 'i',
        nid,
        micIdx,

        in(inputKey){
            const port = node.input?.[inputKey]
            if(!port) return '0'
            if(port.connection){
                const argName = `_in_${inputKey}`
                if(!inputArgs.has(argName)){
                    // Recurse upstream; upstream's call site is pushed before ours
                    // (post-order), so its output var is in scope where we're called.
                    const upstreamExpr = cc.getOutput(port.connection.parent, port.connection.key)
                    inputArgs.set(argName, upstreamExpr)
                }
                return argName
            }
            if(port.type === 'float' && port.control){
                return cc.registerParam(node, inputKey)
            }
            return '0'
        },

        state(f){ return `s.${nid}.${f}` },
        option(k){ return node.optionValues?.[k] ?? node.options?.[k]?.default },
        line(stmt){ lines.push(stmt) },
        tmp(){ return cc.freshTmp(nid) }
    }
    return {ctx, inputArgs, lines}
}

function emitNode(cc, node){
    const nid = `n${node.id}`
    const micIdx = node.slug === 'audio-mic' ? (cc.micNodes.length - 1) : -1
    const {ctx, inputArgs, lines} = makeNodeCtx(cc, node, nid, micIdx)

    const outs = (typeof node.genAudio === 'function')
        ? (node.genAudio.call(node, ctx) || {})
        : {}
    const outKeys = Object.keys(outs)
    if(outKeys.length !== 1){
        throw new AudioCompileError(
            `Node ${node.slug}#${node.id} must return exactly one output from genAudio; got ${outKeys.length}.`
        )
    }
    const outKey = outKeys[0]
    const outExpr = outs[outKey]

    const fnName = `${nid}_fn`
    const callVar = `${nid}_${outKey}`
    const argNames = [...inputArgs.keys()]
    const argExprs = [...inputArgs.values()]
    const sig = ['s', 'p', 'inputs', 'i', ...argNames].join(', ')
    const fnSource = [
        `function ${fnName}(${sig}){`,
        ...lines.map(s => `    ${s}`),
        `    return ${outExpr};`,
        `}`
    ].join('\n')
    const callArgs = ['s', 'p', 'inputs', 'i', ...argExprs].join(', ')
    const callSite = `const ${callVar} = ${fnName}(${callArgs});`

    return {fnSource, callSite, outputVars: {[outKey]: callVar}}
}

function emitSinkNode(cc, sinkNode, upstreamExpr){
    const nid = `n${sinkNode.id}`
    const {ctx, inputArgs, lines} = makeNodeCtx(cc, sinkNode, nid, -1)

    // Sinks read the pre-sink sample via ctx.upstream (string). We expose it
    // as an arg so the sink function still encapsulates cleanly.
    ctx.upstream = '_in_audio'
    inputArgs.set('_in_audio', upstreamExpr)

    // Audio-typed inputs on the sink also resolve to the upstream arg.
    const baseIn = ctx.in
    ctx.in = function(inputKey){
        const port = sinkNode.input?.[inputKey]
        if(port?.type === 'audio') return ctx.upstream
        return baseIn.call(this, inputKey)
    }

    const finalExpr = (typeof sinkNode.genSinkAudio === 'function')
        ? (sinkNode.genSinkAudio.call(sinkNode, ctx) || ctx.upstream)
        : ctx.upstream

    const fnName = `${nid}_fn`
    const callVar = `${nid}_out`
    const argNames = [...inputArgs.keys()]
    const argExprs = [...inputArgs.values()]
    const sig = ['s', 'p', 'inputs', 'i', ...argNames].join(', ')
    const fnSource = [
        `function ${fnName}(${sig}){`,
        ...lines.map(s => `    ${s}`),
        `    return ${finalExpr};`,
        `}`
    ].join('\n')
    const callArgs = ['s', 'p', 'inputs', 'i', ...argExprs].join(', ')
    cc.functions.push(fnSource)
    cc.callSites.push(`const ${callVar} = ${fnName}(${callArgs});`)
    return callVar
}

function assembleBody(cc, finalExpr){
    const names = [...cc.params.keys()]
    const hoists  = names.map(n => `let _v_${n} = s._psmooth.${n};`)
    const updates = names.map(n => `    _v_${n} += (p.${n} - _v_${n}) * K_SMOOTH;`)
    const writes  = names.map(n => `s._psmooth.${n} = _v_${n};`)

    const lines = [
        `'use strict';`,
        `const K_SMOOTH = 1 - Math.exp(-1 / (sampleRate * 0.005));`,
        ``,
        ...cc.functions,
        ``
    ]
    if(hoists.length){
        lines.push(...hoists, ``)
    }
    lines.push(`for(let i = 0; i < blockSize; i++){`)
    if(updates.length) lines.push(...updates)
    lines.push(...cc.callSites.map(s => `    ${s}`))
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
    const upstreamExpr = cc.getOutput(srcPort.parent, srcPort.key)

    let finalExpr = upstreamExpr
    if(typeof sinkNode.genSinkAudio === 'function'){
        finalExpr = emitSinkNode(cc, sinkNode, upstreamExpr)
    }

    const sinkNid = `n${sinkNode.id}`
    cc.stateInit[sinkNid] = deepClone(sinkNode.audioState || {})
    collectGates(cc, sinkNode)

    // Reserved nid holds the per-param smoother carry-over. The engine's
    // state-merge logic preserves it across recompiles just like any other
    // state slot, so sweeps through a graph edit stay zipper-free.
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
