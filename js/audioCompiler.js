/**
 * audioCompiler.js — compile a graph of audio nodes into a single
 * AudioWorkletProcessor source string.
 *
 * Each audio node declares:
 *   audioState: {...}            per-instance persistent fields (phase, env level, etc.)
 *   genAudio(ctx)                emits DSP statements; returns { outputKey: expressionString }
 *
 * The compiler walks upstream from the provided sink, topo-sorts the
 * reachable nodes, calls each node's genAudio, and assembles one worklet
 * source where every sample is computed by a single inlined loop body.
 *
 * ctx surface exposed to genAudio:
 *   ctx.in(key)         expression for the input's current sample. Connected
 *                       inputs resolve to the upstream output's generated
 *                       variable; unconnected float inputs with a control
 *                       resolve to a per-sample param variable; audio
 *                       inputs left unconnected resolve to 0.
 *   ctx.state(field)    expression for a persistent state slot (s.n7.phase).
 *   ctx.line(stmt)      append a statement to this node's block inside the
 *                       sample loop. Block-scoped — local `const`/`let`
 *                       declarations are safe and cannot collide with
 *                       other nodes.
 *   ctx.init(stmt)      append a statement to the processor constructor.
 *   ctx.option(key)     literal value for a node option (baked in; the
 *                       runtime recompiles when an option changes).
 *   ctx.tmp()           fresh unique temp variable name.
 *   ctx.micIdx          on mic nodes, the index into the worklet's input list.
 *   ctx.sr              'sampleRate' literal.
 *   ctx.i               'i' — the sample index within the block.
 *
 * Output expression constraint: the string returned for each output must be
 * computable from state (s.nN.x), inputs (ctx.in results), and constants.
 * It MUST NOT reference names declared inside ctx.line statements, because
 * those live inside a block and the output const is declared after the
 * block closes.
 */

import {deepClone} from './utils.js'

let processorCounter = 0

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

/**
 * Build a AudioParamDescriptor-safe triple from a port's control. The
 * AudioWorklet spec rejects a descriptor if defaultValue falls outside
 * [minValue, maxValue], so clamp here rather than trust the saved UI
 * value — a patch loaded from disk can carry out-of-range state.
 */
function buildParamBounds(node, inputKey, port){
    const min = Number.isFinite(port.control.min) ? port.control.min : -3.4028235e38
    const max = Number.isFinite(port.control.max) ? port.control.max :  3.4028235e38
    const lo = Math.min(min, max)
    const hi = Math.max(min, max)
    let def = currentControlValue(node, inputKey)
    if(!Number.isFinite(def)) def = port.control.default ?? lo
    if(def < lo) def = lo
    if(def > hi) def = hi
    return {minValue: lo, maxValue: hi, defaultValue: def}
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

/**
 * Build ctx + emit for one node. Returns an object with:
 *   paramReads       strings — `const _v_nX_y = ...;`, emitted outside block
 *   bodyLines        strings — emitted inside a `{ ... }` block
 *   outputConsts     strings — `const nX_key = expr;`, emitted after block
 *   outputVars       map outputKey → generated var name (for downstream)
 *   initLines        strings — once-per-construction in worklet constructor
 *   paramDescriptors [ {name,defaultValue,minValue,maxValue,automationRate} ]
 *   gateKeys         [key] — action inputs that need state slots
 */
function emitNode(node, nodeOutputs, micIndex){
    const nid = `n${node.id}`
    const bodyLines = []
    const initLines = []
    const outputConsts = []
    const outputVars = {}
    const paramReads = []
    const paramDescriptors = []
    const gateKeys = []
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
        init(stmt){ initLines.push(stmt) },
        tmp(){ return `_t_${nid}_${tmpCounter++}` }
    }

    const outs = (typeof node.genAudio === 'function')
        ? (node.genAudio.call(node, ctx) || {})
        : {}

    // Params for unconnected float inputs with a control
    for(const key in (node.input || {})){
        const port = node.input[key]
        if(port?.type !== 'float') continue
        if(!port.control) continue
        if(port.connection) continue
        const pname = `${nid}_${key}`
        paramDescriptors.push({
            name: pname,
            ...buildParamBounds(node, key, port),
            automationRate: 'a-rate'
        })
        paramReads.push(
            `const _v_${pname} = _ar_${pname} ? _arr_${pname}[i] : _arr_${pname}[0];`
        )
    }

    // Action inputs become state slots
    for(const key in (node.input || {})){
        const port = node.input[key]
        if(port?.type === 'action' && node.audioState && key in node.audioState){
            gateKeys.push(key)
        }
    }

    // Output consts — after the block closes
    for(const [key, expr] of Object.entries(outs)){
        const v = `${nid}_${key}`
        outputConsts.push(`const ${v} = ${expr};`)
        outputVars[key] = v
    }

    return {paramReads, bodyLines, outputConsts, outputVars, initLines, paramDescriptors, gateKeys}
}

/**
 * Compile the audio graph feeding `sinkNode.input[sinkInputKey]`. Returns
 * { source, processorName, paramDescriptors, stateInit, micNodes, gateMap }
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

    // Per-node emitted pieces, in topo order
    const paramDescriptors = []
    const stateInit = {}
    const gateMap = {}
    const perNodePreLoop = []
    const perNodeConstruct = []
    const perNodeLoop = []
    const nodeOutputs = new Map()

    for(const node of nodes){
        const nid = `n${node.id}`
        stateInit[nid] = deepClone(node.audioState || {})

        const emitted = emitNode(node, nodeOutputs, micIndex)

        if(emitted.gateKeys.length){
            gateMap[nid] = {}
            for(const k of emitted.gateKeys){
                gateMap[nid][k] = stateInit[nid][k] ?? 0
            }
        }

        for(const d of emitted.paramDescriptors){
            paramDescriptors.push(d)
            perNodePreLoop.push(
                `const _arr_${d.name} = parameters.${d.name};`,
                `const _ar_${d.name} = _arr_${d.name}.length > 1;`
            )
        }

        if(emitted.initLines.length){
            perNodeConstruct.push(`// ${node.slug} ${nid}`, ...emitted.initLines)
        }

        perNodeLoop.push(`// ${node.slug} ${nid}`)
        perNodeLoop.push(...emitted.paramReads)
        perNodeLoop.push(`{`)
        perNodeLoop.push(...emitted.bodyLines)
        perNodeLoop.push(`}`)
        perNodeLoop.push(...emitted.outputConsts)

        nodeOutputs.set(node, emitted.outputVars)
    }

    // Final sample expression: the upstream output feeding the sink's audio input.
    const sinkOuts = nodeOutputs.get(srcPort.parent)
    let finalExpr = sinkOuts?.[srcPort.key] ?? '0'

    // Sink hook: lets SynthOut register a level param and wrap the final sample.
    if(typeof sinkNode.genSinkAudio === 'function'){
        const sinkNid = `n${sinkNode.id}`
        stateInit[sinkNid] = deepClone(sinkNode.audioState || {})

        const sinkEmit = emitSinkNode(sinkNode, finalExpr, nodeOutputs, micIndex)

        for(const d of sinkEmit.paramDescriptors){
            paramDescriptors.push(d)
            perNodePreLoop.push(
                `const _arr_${d.name} = parameters.${d.name};`,
                `const _ar_${d.name} = _arr_${d.name}.length > 1;`
            )
        }
        if(sinkEmit.initLines.length){
            perNodeConstruct.push(`// sink ${sinkNode.slug} ${sinkNid}`, ...sinkEmit.initLines)
        }
        perNodeLoop.push(`// sink ${sinkNode.slug} ${sinkNid}`)
        perNodeLoop.push(...sinkEmit.paramReads)
        perNodeLoop.push(`{`)
        perNodeLoop.push(...sinkEmit.bodyLines)
        perNodeLoop.push(`}`)
        finalExpr = sinkEmit.finalExpr
    }

    const processorName = `silvia-audio-${++processorCounter}`
    const source = assembleWorklet({
        processorName, paramDescriptors, stateInit, gateMap,
        perNodeConstruct, perNodeLoop, perNodePreLoop, finalExpr
    })

    return {
        source, processorName, paramDescriptors,
        stateInit, gateMap, micNodes, sinkNode
    }
}

function emitSinkNode(sinkNode, upstreamExpr, nodeOutputs, micIndex){
    const nid = `n${sinkNode.id}`
    const bodyLines = []
    const initLines = []
    const paramReads = []
    const paramDescriptors = []
    let tmpCounter = 0

    const ctx = {
        sr: 'sampleRate', i: 'i', nid,
        upstream: upstreamExpr,
        in(inputKey){
            const port = sinkNode.input?.[inputKey]
            if(!port) return '0'
            if(port.type === 'audio') return upstreamExpr
            if(port.type === 'float' && port.control && !port.connection){
                return `_v_${nid}_${inputKey}`
            }
            if(port.connection){
                const src = port.connection
                const outs = nodeOutputs.get(src.parent)
                if(outs && outs[src.key] !== undefined) return outs[src.key]
            }
            return '0'
        },
        state(f){ return `s.${nid}.${f}` },
        option(k){ return sinkNode.optionValues?.[k] ?? sinkNode.options?.[k]?.default },
        line(s){ bodyLines.push(s) },
        init(s){ initLines.push(s) },
        tmp(){ return `_t_${nid}_${tmpCounter++}` }
    }

    const finalExpr = sinkNode.genSinkAudio(ctx) || upstreamExpr

    for(const key in (sinkNode.input || {})){
        const port = sinkNode.input[key]
        if(port?.type !== 'float') continue
        if(!port.control) continue
        if(port.connection) continue
        const pname = `${nid}_${key}`
        paramDescriptors.push({
            name: pname,
            ...buildParamBounds(sinkNode, key, port),
            automationRate: 'a-rate'
        })
        paramReads.push(
            `const _v_${pname} = _ar_${pname} ? _arr_${pname}[i] : _arr_${pname}[0];`
        )
    }

    return {paramReads, bodyLines, paramDescriptors, initLines, finalExpr}
}

function assembleWorklet(args){
    const {
        processorName, paramDescriptors, stateInit, gateMap,
        perNodeConstruct, perNodeLoop, perNodePreLoop, finalExpr
    } = args

    const descriptorsJson = JSON.stringify(paramDescriptors)
    const stateJson       = JSON.stringify(stateInit)
    const gateJson        = JSON.stringify(gateMap)

    return `
class P extends AudioWorkletProcessor {
    static get parameterDescriptors(){ return ${descriptorsJson}; }

    constructor(options){
        super(options);
        this.state = ${stateJson};
        this._gateMap = ${gateJson};
        this.port.onmessage = (e) => {
            const m = e.data;
            if(!m) return;
            if(m.type === 'gate'){
                const slot = this.state[m.nid];
                if(slot && m.key in slot) slot[m.key] = m.value;
            } else if(m.type === 'dump'){
                this.port.postMessage({type: 'state-dump', state: this.state});
            } else if(m.type === 'state'){
                for(const nid in m.state){
                    if(!this.state[nid]) continue;
                    for(const field in m.state[nid]){
                        if(field in this.state[nid]){
                            this.state[nid][field] = m.state[nid][field];
                        }
                    }
                }
            }
        };
        ${perNodeConstruct.join('\n        ')}
    }

    process(inputs, outputs, parameters){
        const s = this.state;
        const out0 = outputs[0];
        if(!out0 || !out0[0]) return true;
        const ch = out0[0];
        const blockSize = ch.length;
        const has1 = out0.length > 1;
        const ch1 = has1 ? out0[1] : null;

        ${perNodePreLoop.join('\n        ')}

        for(let i = 0; i < blockSize; i++){
            ${perNodeLoop.join('\n            ')}
            const _y = ${finalExpr};
            ch[i] = _y;
            if(has1) ch1[i] = _y;
        }
        return true;
    }
}
registerProcessor(${JSON.stringify(processorName)}, P);
`
}
