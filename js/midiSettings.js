// midiSettings.js - MIDI devices, mappings, and monitor modal

import {autowire, StringToFragment, navigateToNode} from './utils.js'
import {midiManager} from './midiManager.js'
import {SNode} from './snode.js'
import {WorkspaceManager} from './workspaceManager.js'

let midiModal
let devicesListEl, mappingsListEl, monitorLogEl

function findNodeForElement(el){
    const nodeEl = el.closest('.node')
    if(!nodeEl) return null
    for(const node of SNode.nodes){
        if(node.nodeEl === nodeEl) return node
    }
    return null
}

function getNodeWorkspaceLabel(node){
    if(!node || !node.workspaceVisibility) return null
    // Pick the first workspace this node is on
    for(const wsId of node.workspaceVisibility){
        const ws = WorkspaceManager.workspaces.get(wsId)
        if(ws) return {id: wsId, name: ws.name}
    }
    return null
}

function navigateToNodeAndClose(node){
    if(!node) return
    if(midiModal) midiModal.style.display = 'none'
    navigateToNode(node, {SNode, WorkspaceManager})
}
function updateValueBars(){
    if(!mappingsListEl) return
    const now = performance.now()
    mappingsListEl.querySelectorAll('.midi-value-bar[data-cc]').forEach(bar => {
        const cc = parseInt(bar.dataset.cc)
        const val = midiManager.lastCCValues.get(cc)
        const pct = val != null ? Math.round(val / 127 * 100) : 0
        bar.firstElementChild.style.width = pct + '%'
    })
    mappingsListEl.querySelectorAll('.midi-note-flash[data-note]').forEach(el => {
        const note = parseInt(el.dataset.note)
        const t = midiManager.lastNoteOnTimes.get(note)
        const active = t != null && (now - t) < 200
        el.classList.toggle('active', active)
    })
}

let valueBarsRaf = null

function startValueBarsLoop(){
    if(valueBarsRaf) return
    function tick(){
        updateValueBars()
        valueBarsRaf = requestAnimationFrame(tick)
    }
    valueBarsRaf = requestAnimationFrame(tick)
}

function stopValueBarsLoop(){
    if(valueBarsRaf){
        cancelAnimationFrame(valueBarsRaf)
        valueBarsRaf = null
    }
}

let monitorEnabled = false
let originalHandleMidiMessage = null

function createMidiModal(){
    const html = `
    <div class="modal-overlay" style="display: none;" data-el="midiModal">
        <div class="midi-window">
            <div class="midi-header">
                <h2>MIDI</h2>
                <span class="midi-help-text">Alt/Option+Click any knob or button to assign</span>
                <button class="cancel-btn" data-el="closeBtn">Close</button>
            </div>

            <div class="midi-body">
                <div class="midi-section">
                    <div class="midi-section-header">
                        <span>Devices</span>
                        <button class="midi-section-btn" data-el="refreshBtn">Refresh</button>
                    </div>
                    <div class="midi-section-content midi-devices-list" data-el="devicesListEl"></div>
                </div>

                <div class="midi-section midi-section-grow">
                    <div class="midi-section-header">
                        <span>Mappings</span>
                        <button class="midi-section-btn midi-section-btn-danger" data-el="clearAllBtn">Clear All</button>
                    </div>
                    <div class="midi-section-content midi-mappings-list" data-el="mappingsListEl"></div>
                </div>

                <div class="midi-section midi-section-monitor">
                    <div class="midi-section-header">
                        <label class="midi-monitor-toggle">
                            <input type="checkbox" data-el="monitorToggle">
                            <span>Monitor</span>
                        </label>
                        <button class="midi-section-btn" data-el="clearLogBtn">Clear</button>
                    </div>
                    <div class="midi-section-content midi-monitor-log" data-el="monitorLogEl"></div>
                </div>
            </div>
        </div>
    </div>`

    const fragment = StringToFragment(html)
    const elements = autowire(fragment)
    document.getElementById('modal-container').appendChild(fragment)
    return elements
}

function updateDevicesList(){
    if(!devicesListEl) return

    if(midiManager.midiDisabled){
        devicesListEl.innerHTML = `<div class="midi-empty-state">MIDI not available in this browser.${midiManager.isFirefox ? '<br>Install the Jazz-MIDI add-on for Firefox.' : ''}</div>`
        return
    }

    const devices = Array.from(midiManager.inputs.values())

    if(devices.length === 0){
        devicesListEl.innerHTML = '<div class="midi-empty-state">No MIDI devices connected</div>'
    } else {
        devicesListEl.innerHTML = devices.map(device =>
            `<div class="midi-device-row">+ ${device.name}${device.manufacturer ? ` (${device.manufacturer})` : ''}</div>`
        ).join('')
    }
}

function updateMappingsList(){
    if(!mappingsListEl) return

    const rows = []

    // Gather CC mappings
    for(const [ccNumber, elements] of midiManager.ccMappings){
        for(const el of elements){
            if(!el.isConnected) continue
            const node = findNodeForElement(el)
            const nodeName = node?.label || el.closest('.node')?.querySelector('.node-label')?.textContent || '?'
            const nodeIcon = node?.icon || ''
            const ws = node ? getNodeWorkspaceLabel(node) : null
            const controlName = el.dataset.inputEl || '?'
            const lastVal = midiManager.lastCCValues.get(ccNumber)
            const pct = lastVal != null ? Math.round(lastVal / 127 * 100) : 0
            rows.push({node, nodeName, nodeIcon, wsName: ws?.name || '', controlName, mapping: `CC ${ccNumber}`, ccNumber, pct, type: 'cc', element: el})
        }
    }

    // Gather note mappings
    for(const [note, buttons] of midiManager.noteMappings){
        for(const btn of buttons){
            if(!btn.isConnected) continue
            const node = findNodeForElement(btn)
            const nodeName = node?.label || btn.closest('.node')?.querySelector('.node-label')?.textContent || '?'
            const nodeIcon = node?.icon || ''
            const ws = node ? getNodeWorkspaceLabel(node) : null
            const controlName = btn.dataset.inputEl || btn.textContent.trim() || '?'
            rows.push({node, nodeName, nodeIcon, wsName: ws?.name || '', controlName, mapping: `Note ${midiManager.noteToName(note)}`, noteNumber: note, type: 'note', element: btn})
        }
    }

    if(rows.length === 0){
        mappingsListEl.innerHTML = '<div class="midi-empty-state">No mappings -- Alt+Click any knob or button to assign MIDI</div>'
        return
    }

    // Sort by node name, then control name
    rows.sort((a, b) => a.nodeName.localeCompare(b.nodeName) || a.controlName.localeCompare(b.controlName))

    const wsName = (name) => name.length > 12 ? name.slice(0, 11) + '\u2026' : name

    mappingsListEl.innerHTML = `
        <table class="midi-mappings-table">
            <thead><tr><th>Node</th><th>Control</th><th>Mapping</th><th>Value</th><th></th></tr></thead>
            <tbody>${rows.map((r, i) => `
                <tr>
                    <td><span class="midi-node-tag" data-nav-index="${i}" title="${r.wsName} \u2192 ${r.nodeName}">${r.nodeIcon ? `<span class="midi-node-tag-icon">${r.nodeIcon}</span>` : ''}${r.wsName ? `<span class="midi-node-tag-ws">${wsName(r.wsName)}</span>` : ''}${r.nodeName}</span></td>
                    <td>${r.controlName}</td>
                    <td>${r.mapping}</td>
                    <td>${r.ccNumber != null ? `<div class="midi-value-bar" data-cc="${r.ccNumber}"><div class="midi-value-fill" style="width:${r.pct}%"></div></div>` : `<div class="midi-note-flash" data-note="${r.noteNumber}"></div>`}</td>
                    <td><button class="midi-unmap-btn" data-unmap-index="${i}">x</button></td>
                </tr>`).join('')}
            </tbody>
        </table>`

    // Wire navigate-to-node tags
    mappingsListEl.querySelectorAll('.midi-node-tag').forEach(tag => {
        const idx = parseInt(tag.dataset.navIndex)
        const row = rows[idx]
        if(row.node){
            tag.addEventListener('click', () => navigateToNodeAndClose(row.node))
        }
    })

    // Wire unmap buttons
    mappingsListEl.querySelectorAll('.midi-unmap-btn').forEach(btn => {
        const idx = parseInt(btn.dataset.unmapIndex)
        const row = rows[idx]
        btn.addEventListener('click', () => {
            midiManager.unmapElement(row.element, row.type)
            updateMappingsList()
        })
    })
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function formatMidiMessage(data){
    const [status, data1, data2] = data
    const command = status >> 4
    const ch = (status & 0xF) + 1

    if(command === 11) return `ch${ch}  CC ${data1} = ${data2}`
    if(command === 9 && data2 > 0){
        const name = NOTE_NAMES[data1 % 12] + (Math.floor(data1 / 12) - 1)
        return `ch${ch}  Note On  ${name}  vel=${data2}`
    }
    if(command === 8 || (command === 9 && data2 === 0)){
        const name = NOTE_NAMES[data1 % 12] + (Math.floor(data1 / 12) - 1)
        return `ch${ch}  Note Off ${name}`
    }
    return `ch${ch}  ${status.toString(16)}h  ${data1}  ${data2}`
}

function appendMonitorLine(text){
    if(!monitorLogEl) return
    const line = document.createElement('div')
    line.className = 'midi-monitor-line'
    line.textContent = text
    monitorLogEl.appendChild(line)

    // Keep last 30 lines
    while(monitorLogEl.children.length > 30){
        monitorLogEl.removeChild(monitorLogEl.firstChild)
    }

    monitorLogEl.scrollTop = monitorLogEl.scrollHeight
}

function enableMonitor(){
    if(monitorEnabled) return
    monitorEnabled = true

    // Wrap handleMidiMessage to tap into the stream
    originalHandleMidiMessage = midiManager.handleMidiMessage.bind(midiManager)
    midiManager.handleMidiMessage = function(event){
        appendMonitorLine(formatMidiMessage(event.data))
        originalHandleMidiMessage(event)
    }
}

function disableMonitor(){
    if(!monitorEnabled) return
    monitorEnabled = false

    // Restore original handler
    if(originalHandleMidiMessage){
        midiManager.handleMidiMessage = originalHandleMidiMessage
        originalHandleMidiMessage = null
    }
}

export function initMidiSettings(){
    let closeBtn, refreshBtn, clearAllBtn, monitorToggle, clearLogBtn;
    ({midiModal, devicesListEl, mappingsListEl, monitorLogEl, closeBtn, refreshBtn, clearAllBtn, monitorToggle, clearLogBtn} = createMidiModal())

    const monitorSection = monitorLogEl.closest('.midi-section-monitor')

    const openBtn = document.getElementById('midi-btn')
    if(!openBtn){
        console.error('Could not find #midi-btn to attach listener.')
        return
    }

    function openModal(){
        updateDevicesList()
        updateMappingsList()
        midiModal.style.display = 'flex'
        startValueBarsLoop()
    }

    function closeModal(){
        midiModal.style.display = 'none'
        stopValueBarsLoop()
    }

    openBtn.addEventListener('click', openModal)

    closeBtn.addEventListener('click', closeModal)

    midiModal.addEventListener('click', (e) => {
        if(e.target === midiModal) closeModal()
    })

    document.addEventListener('escape-pressed', () => {
        if(midiModal.style.display === 'flex') closeModal()
    })

    refreshBtn.addEventListener('click', () => updateDevicesList())

    clearAllBtn.addEventListener('click', () => {
        if(confirm('Clear all MIDI mappings? This cannot be undone.')){
            midiManager.clearAllMappings()
            updateMappingsList()
        }
    })

    monitorToggle.addEventListener('change', () => {
        if(monitorToggle.checked){
            enableMonitor()
            monitorSection.classList.add('active')
        } else {
            disableMonitor()
            monitorSection.classList.remove('active')
        }
    })

    clearLogBtn.addEventListener('click', () => {
        monitorLogEl.innerHTML = ''
    })
}
