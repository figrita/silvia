// howto.js
import {autowire, StringToFragment} from './utils.js'

let howtoModal
let closeBtn

function createHowtoModal(){
    const html = `
    <div class="modal-overlay" style="display: none;" data-el="howtoModal">
        <div class="modal-content" style="width: 65rem;">
            <h2>📘 How To Use Silvia</h2>

            <div class="howto-section">
                <h3>Core Concepts</h3>
                <ul>
                    <li><span><strong>Nodes:</strong> Each box is a "node" that performs a specific task, like generating a pattern, applying a filter, or getting input from a webcam.</span></li>
                    <li><span><strong>Ports:</strong> The dots on the sides of nodes are ports. Outputs are on the right, inputs are on the left. You connect them to build your visual "patch".</span></li>
                    <li><span><strong>Connections:</strong> Click and drag from a port to another compatible port to create a connection.</span></li>
                    <li><span><strong>The Output Node 📺:</strong> This is the most important node! It takes a color connection and runs everything on your GPU! Happy hacking :^)</span></li>
                    <li><span><strong>Coordinate System:</strong> Silvia uses a square coordinate system centered at (0,0). The edges extend from -1 to +1 in both X and Y directions. Think of it like a graph where the center is the origin, left edge is X=-1, right edge is X=+1, bottom is Y=-1, and top is Y=+1. This consistent coordinate system ensures patterns look the same regardless of your screen size.</span></li>
                </ul>
            </div>
            
            <div class="howto-section">
                <h3>🌐 Global Controls</h3>
                <div class="howto-controls-grid">
                    <div><strong>Right-Click (workspace)</strong></div>
                    <div>Open the Quick Menu at cursor position with fuzzy search.</div>
                    
                    <div><strong>\` (Backtick) Key</strong></div>
                    <div>Open the Quick Menu centered on screen with search focused.</div>
                    
                    <div><strong>'N' Key</strong></div>
                    <div>Open/close the Nodes Menu (categorized node browser).</div>
                    
                    <div><strong>'H' Key</strong></div>
                    <div>Toggle the visibility of the entire editor UI (for a clean view of the background).</div>
                    
                    <div><strong>'F' Key</strong></div>
                    <div>Toggle fullscreen mode for the entire page.</div>
                    
                    <div><strong>Escape Key</strong></div>
                    <div>Cancel current operation (connection dragging, node moving, close modals).</div>
                    
                    <div><strong>'P' Key</strong></div>
                    <div>Put down a dragging node in-place (useful when mouse is in a weird state).</div>
                    
                    <div><strong>Scroll Wheel (on editor)</strong></div>
                    <div>Scroll the workspace horizontally.</div>
                </div>
            </div>

            <div class="howto-section">
                <h3>📦 Node Controls</h3>
                <div class="howto-controls-grid">
                    <div><strong>Click & Drag Header</strong></div>
                    <div>Move a node around the workspace.</div>
                    
                    <div><strong>Right-Click Header</strong></div>
                    <div>Open context menu with Delete Connections or Duplicate options.</div>
                    
                    <div><strong>Click 'x' Button</strong></div>
                    <div>Delete the node and all its connections.</div>
                    
                    <div><strong>Click 'show' Button</strong></div>
                    <div>(Output nodes only) Set as background rendering.</div>
                </div>
            </div>

            <div class="howto-section">
                <h3>🔌 Port & Connection Controls</h3>
                <div class="howto-controls-grid">
                    <div><strong>Click & Drag Port</strong></div>
                    <div>Start creating a connection to another compatible port.</div>
                    
                    <div><strong>Right-Click Port</strong></div>
                    <div>Disconnect all connections to that port.</div>
                    
                    <div><strong>Release Connection on Empty</strong></div>
                    <div>Cancel connection creation.</div>
                    
                    <div><strong>Escape While Dragging</strong></div>
                    <div>Cancel connection creation.</div>
                </div>
            </div>

            <div class="howto-section">
                <h3>🔢 Number Input Controls</h3>
                <div class="howto-controls-grid">
                    <div><strong>Click & Drag Value</strong></div>
                    <div>Scrub to adjust value. Hold Shift for fine control (0.1x).</div>

                    <div><strong>Scroll Wheel</strong></div>
                    <div>Adjust value. Shift = fine (0.1x), Ctrl = coarse (10x).</div>

                    <div><strong>Arrow Up/Down Keys</strong></div>
                    <div>Step value up/down by current step amount.</div>

                    <div><strong>+/- Buttons</strong></div>
                    <div>Increment/decrement by step. Ctrl+click adjusts step size (10x/0.1x).</div>

                    <div><strong>Ctrl+Hover</strong></div>
                    <div>Show min/max/step editors. Click to edit values.</div>

                    <div><strong>'d' Key</strong></div>
                    <div>Reset to default value.</div>

                    <div><strong>'r' Key</strong></div>
                    <div>Reset value AND min/max/step to original node definition.</div>

                    <div><strong>Alt+Click</strong></div>
                    <div>MIDI learn mode for CC mapping.</div>
                </div>
            </div>

            <div class="howto-section">
                <h3>🎨 Color Input Controls</h3>
                <div class="howto-controls-grid">
                    <div><strong>Click Color Swatch</strong></div>
                    <div>Open HSL color picker with sliders and hex input.</div>

                    <div><strong>Escape / Click Outside</strong></div>
                    <div>Close color picker.</div>
                </div>
            </div>

            <div class="howto-section">
                <h3>🎬 Action Button Controls</h3>
                <div class="howto-controls-grid">
                    <div><strong>Click Button</strong></div>
                    <div>Trigger the action.</div>
                    
                    <div><strong>Alt/Option+Click</strong></div>
                    <div>MIDI learn mode for note mapping.</div>
                </div>
            </div>

            <div class="howto-section">
                <h3>📋 Node Menu Controls</h3>
                <div class="howto-controls-grid">
                    <div><strong>Quick Menu (Right-click/\`)</strong></div>
                    <div>Searchable list of all nodes with fuzzy filtering.</div>
                    
                    <div><strong>Nodes Menu (Button/N key)</strong></div>
                    <div>Categorized node browser with hover/click navigation.</div>
                    
                    <div><strong>Type to Search</strong></div>
                    <div>Fuzzy search filters nodes in real-time (e.g., "img" finds "image").</div>
                    
                    <div><strong>Arrow Up/Down</strong></div>
                    <div>Navigate through filtered results in Quick Menu.</div>
                    
                    <div><strong>Enter Key</strong></div>
                    <div>Create the selected node at cursor/center position.</div>
                    
                    <div><strong>Hover Category</strong></div>
                    <div>Opens submenu after brief delay (Start Menu).</div>
                    
                    <div><strong>Click Category</strong></div>
                    <div>Opens submenu immediately (Start Menu).</div>
                    
                    <div><strong>Click Node</strong></div>
                    <div>Create that node immediately.</div>
                    
                    <div><strong>Escape Key</strong></div>
                    <div>Close any open menu.</div>
                    
                    <div><strong>Click Outside</strong></div>
                    <div>Close any open menu.</div>
                </div>
            </div>
            
            <div class="howto-section">
                <h3>🎹 MIDI Control</h3>
                <ul>
                    <li><span><strong>MIDI Learn:</strong> Hold <strong>Alt</strong> (Windows/Linux) or <strong>Option</strong> (Mac) and click any number control or action button to enter MIDI learn mode.</span></li>
                    <li><span><strong>CC Mapping:</strong> Number controls can be mapped to MIDI CC (continuous controller) messages from knobs and faders.</span></li>
                    <li><span><strong>Note Mapping:</strong> Action buttons can be mapped to MIDI notes from keys or pads.</span></li>
                    <li><span><strong>Visual Feedback:</strong> Mapped controls show a dot indicator. Controls flash when triggered via MIDI.</span></li>
                    <li><span><strong>Persistence:</strong> MIDI mappings are saved automatically and restore when you reload patches.</span></li>
                    <li><span><strong>Settings:</strong> View connected MIDI devices and clear mappings in the Settings panel.</span></li>
                </ul>
            </div>

            <div class="howto-section">
                <h3>⚡ Performance Tips</h3>
                <ul>
                    <li><span><strong>Video Optimization:</strong> For best performance and seamless looping, encode videos at your monitor's refresh rate (60fps, 120fps, etc.) with exact integer durations. Videos with fractional frame rates like 59.926fps may stutter at loop points, especially when sped up.</span></li>
                </ul>
            </div>

            <div class="howto-section">
                <h3>✨ Tips & Tricks</h3>
                <ul>
                    <li><span><strong>Background Rendering:</strong> On an <strong>Output</strong> node, click the <code class="howto-code">show</code> button in its header to make its result the live background for the whole application.</span></li>
                    <li><span><strong>Projector Window:</strong> After showing an output on the background, click the <strong>Projector</strong> button in the bottom-left to open a clean, fullscreen version of your output on a second monitor (if you have one). Great for VJing!</span></li>
                    <li><span><strong>Saving & Loading:</strong> Use the <strong>Save</strong> and <strong>Load</strong> buttons to manage your patches. You can save to your browser's local storage or download a <code>.svs</code> file to share.</span></li>
                </ul>
            </div>
            
            <div class="modal-actions">
                <button class="cancel-btn" data-el="closeBtn">✔ Got it</button>
            </div>
        </div>
    </div>
    <style>
        .howto-section {
            border-top: 1px solid rgba(255, 255, 255, 0.15);
            padding-top: 15px;
            margin-top: 5px;
            max-width: 60rem;
        }
        .howto-section h3 {
            margin: 0 0 10px 0;
            color: #ccc;
        }
        .howto-section ul {
            list-style-type: none;
            padding-left: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .howto-controls-grid {
            display: grid;
            grid-template-columns: 200px 1fr;
            gap: 10px 15px;
            align-items: center;
        }
        .howto-controls-grid div:nth-child(odd) {
            font-weight: bold;
            text-align: right;
            color: #ddd;
        }
        .howto-controls-grid div:nth-child(even) {
            color: #bbb;
        }
        .howto-code {
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            padding: 2px 5px;
            border-radius: 4px;
            font-family: monospace;
        }
    </style>
    `

    const fragment = StringToFragment(html)
    const elements = autowire(fragment)
    document.getElementById('modal-container').appendChild(fragment)
    return elements
}

/**
 * Initializes the "How To" guide system.
 */
export function initHowto(){
    ({howtoModal, closeBtn} = createHowtoModal())

    const openBtn = document.getElementById('howto-btn')
    if(!openBtn){
        console.error('Could not find #howto-btn to attach listener.')
        return
    }

    openBtn.addEventListener('click', () => {
        howtoModal.style.display = 'flex'
    })

    closeBtn.addEventListener('click', () => {
        howtoModal.style.display = 'none'
    })

    howtoModal.addEventListener('click', (e) => {
        if(e.target === howtoModal){
            howtoModal.style.display = 'none'
        }
    })
    
    // Close on escape
    document.addEventListener('escape-pressed', () => {
        if(howtoModal.style.display === 'flex'){
            howtoModal.style.display = 'none'
        }
    })
}