/**
 * audioCompiler.js — compile a graph of audio nodes into a single DSP
 * function body that the persistent worklet engine can evaluate per block.
 *
 * Each audio node declares:
 *   audioState: {...}            per-instance persistent fields (phase,
 *                                envelope level, filter memory, etc.)
 *   genAudio(ctx)                emits DSP statements; returns
 *                                { outputKey: expressionString }
 *
 * The compiler walks upstream from the provided sink, topo-sorts the
 * reachable nodes, calls each node's genAudio, and assembles a single
 * function body that writes one audio block at a time. Param reads are
 * hoisted above the sample loop (the engine smooths them per block, so
 * they are constant across a block).
 *
 * ctx surface exposed to genAudio:
 *   ctx.in(key)         expression for the input's current sample.
 *                       Connected inputs resolve to the upstream output
 *                       variable; unconnected float inputs with a control
 *                       resolve to a hoisted per-block param local; audio
 *                       inputs left unconnected resolve to 0.
 *   ctx.state(field)    expression for a persistent state slot
 *                       (e.g. `s.n7.phase`).
 *   ctx.line(stmt)      append a statement to this node's block inside
 *                       the per-sample loop. The block is brace-scoped, so
 *                       local `const`/`let` names cannot collide with
 *                       other nodes' blocks.
 *   ctx.option(key)     literal value for a node option (baked in; the
 *                       runtime recompiles when an option changes).
 *   ctx.tmp()           fresh unique temp variable name.
 *   ctx.micIdx          on mic nodes, the index into the engine's input list.
 *   ctx.sr              'sampleRate' literal (function arg name).
 *   ctx.i               'i' — the sample index within the block.
 *
 * Output expression constraint: the string returned for each output must
 * be computable from state (s.nN.x), inputs (ctx.in results) and constants.
 * It MUST NOT reference names declared inside ctx.line statements — those
 * live inside a brace block and the output const is declared after the
 * block closes.
 */

import {deepClone} from './utils.js'

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

function topoCollect(startNode){
    const out = []
    const visited = new Set()
    const visit = (node) => {
        if(visited.has(node)) return
        visited.add(node)
        for(const key in (node.input || {})){
            const port = node.input[key]
            if(port?.connection){
                visit(port.connection.parent)
            }
        }
        out.push(node)
    }
    visit(startNode)
    return out
}

function emitNode(node, nid, nodeOutputs, micIndex){
    const bodyLines = []
    const outputVars = {}
    const outputConsts = []
    const paramKeys = []
    let tmpCounter = 0

    const ctx = {
        sr: 'sampleRate',
        i: 'i',
        nid,
        micIdx: micIndex.has(node) ? micIndex.get(node) : -1,

        in(inputKey){
            const port = node.input?.[inputKey]
            if(!port) return '0'
            if(port.connection){
                const src = port.connection
                const outs = nodeOutputs.get(src.parent)
                if(outs && outs[src.key] !== undefined) return outs[src.key]
                return '0'
            }
            if(port.type === 'float' && port.control){
                return `_v_${nid}_${inputKey}`
            }
            return '0'
        },

        state(field){ return `s.${nid}.${field}` },
        option(key){ return node.optionValues?.[key] ?? node.options?.[key]?.default },
        line(stmt){ bodyLines.push(stmt) },
        tmp(){ return `_t_${nid}_${tmpCounter++}` }
    }

    const outs = (typeof node.genAudio === 'function')
        ? (node.genAudio.call(node, ctx) || {})
        : {}

    for(const key in (node.input || {})){
        const port = node.input[key]
        if(port?.type !== 'float' || !port.control || port.connection) continue
        paramKeys.push(key)
    }

    for(const [key, expr] of Object.entries(outs)){
        const v = `${nid}_${key}`
        outputConsts.push(`const ${v} = ${expr};`)
        outputVars[key] = v
    }

    return {bodyLines, outputVars, outputConsts, paramKeys}
}

function emitSinkNode(sinkNode, nid, upstreamExpr, nodeOutputs, micIndex){
    const bodyLines = []
    const paramKeys = []
    let tmpCounter = 0

    const ctx = {
        sr: 'sampleRate',
        i: 'i',
        nid,
        upstream: upstreamExpr,
        micIdx: -1,

        in(inputKey){
            const port = sinkNode.input?.[inputKey]
            if(!port) return '0'
            if(port.type === 'audio') return upstreamExpr
            if(port.connection){
                const src = port.connection
                const outs = nodeOutputs.get(src.parent)
                if(outs && outs[src.key] !== undefined) return outs[src.key]
                return '0'
            }
            if(port.type === 'float' && port.control){
                return `_v_${nid}_${inputKey}`
            }
            return '0'
        },

        state(f){ return `s.${nid}.${f}` },
        option(k){ return sinkNode.optionValues?.[k] ?? sinkNode.options?.[k]?.default },
        line(stmt){ bodyLines.push(stmt) },
        tmp(){ return `_t_${nid}_${tmpCounter++}` }
    }

    const finalExpr = sinkNode.genSinkAudio(ctx) || upstreamExpr

    for(const key in (sinkNode.input || {})){
        const port = sinkNode.input[key]
        if(port?.type !== 'float' || !port.control || port.connection) continue
        paramKeys.push(key)
    }

    return {bodyLines, paramKeys, finalExpr}
}

/**
 * Compile the audio graph feeding `sinkNode.input[sinkInputKey]`. Returns
 * { body, stateInit, paramNames, paramInit, gateMap, micNodes, sinkNode }
 * or null if nothing is connected to the sink.
 */
export function compileGraph(sinkNode, sinkInputKey = 'audio'){
    const sinkPort = sinkNode.input?.[sinkInputKey]
    const srcPort = sinkPort?.connection
    if(!srcPort) return null

    const nodes = topoCollect(srcPort.parent)
    const micNodes = nodes.filter(n => n.slug === 'audio-mic')
    const micIndex = new Map()
    micNodes.forEach((n, i) => micIndex.set(n, i))

    const stateInit = {}
    const paramNames = []
    const paramInit = {}
    const paramReads = []
    const sampleBlocks = []
    const nodeOutputs = new Map()

    const registerParam = (node, key) => {
        const pname = `n${node.id}_${key}`
        paramNames.push(pname)
        paramInit[pname] = currentControlValue(node, key)
        paramReads.push(`const _v_${pname} = p.${pname};`)
    }

    for(const node of nodes){
        const nid = `n${node.id}`
        stateInit[nid] = deepClone(node.audioState || {})

        const piece = emitNode(node, nid, nodeOutputs, micIndex)
        for(const k of piece.paramKeys) registerParam(node, k)

        sampleBlocks.push(
            `    // ${node.slug} ${nid}`,
            `    {`,
            ...piece.bodyLines.map(s => `        ${s}`),
            `    }`,
            ...piece.outputConsts.map(s => `    ${s}`)
        )
        nodeOutputs.set(node, piece.outputVars)
    }

    const sinkOuts = nodeOutputs.get(srcPort.parent)
    let finalExpr = sinkOuts?.[srcPort.key] ?? '0'

    if(typeof sinkNode.genSinkAudio === 'function'){
        const sinkNid = `n${sinkNode.id}`
        stateInit[sinkNid] = deepClone(sinkNode.audioState || {})
        const sinkPiece = emitSinkNode(sinkNode, sinkNid, finalExpr, nodeOutputs, micIndex)
        for(const k of sinkPiece.paramKeys) registerParam(sinkNode, k)

        sampleBlocks.push(
            `    // sink ${sinkNode.slug} ${sinkNid}`,
            `    {`,
            ...sinkPiece.bodyLines.map(s => `        ${s}`),
            `    }`
        )
        finalExpr = sinkPiece.finalExpr
    }

    const gateMap = {}
    const allNodes = typeof sinkNode.genSinkAudio === 'function' ? [...nodes, sinkNode] : nodes
    for(const node of allNodes){
        const nid = `n${node.id}`
        const slot = stateInit[nid]
        if(!slot) continue
        for(const key in (node.input || {})){
            const port = node.input[key]
            if(port?.type === 'action' && key in slot){
                gateMap[nid] = gateMap[nid] || {}
                gateMap[nid][key] = slot[key] ?? 0
            }
        }
    }

    const body = [
        ...paramReads,
        ``,
        `for(let i = 0; i < blockSize; i++){`,
        ...sampleBlocks,
        `    const _y = ${finalExpr};`,
        `    ch0[i] = _y;`,
        `    if(ch1) ch1[i] = _y;`,
        `}`
    ].join('\n')

    return {body, stateInit, paramNames, paramInit, gateMap, micNodes, sinkNode}
}
