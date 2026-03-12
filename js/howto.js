// howto.js
import {autowire, StringToFragment} from './utils.js'

let howtoModal
let closeBtn
let howtoBody
let isMac = /macOS|Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.userAgent)

const MOD = {ctrl: () => isMac ? 'Cmd' : 'Ctrl', alt: () => isMac ? 'Option' : 'Alt'}

function applyPlatform(root){
    root.querySelectorAll('kbd[data-mod]').forEach(el => {
        el.textContent = MOD[el.dataset.mod]()
    })
}

function createHowtoModal(){
    const html = `
    <div class="modal-overlay" style="display: none;" data-el="howtoModal">
        <div class="howto-window">
            <div class="howto-header">
                <h2>How To Use Silvia</h2>
                <button class="howto-platform-toggle" data-el="platformToggle"></button>
            </div>

            <div class="howto-layout">
                <nav class="howto-toc" data-el="howtoToc"></nav>

                <div class="howto-body" data-el="howtoBody">

                    <img class="howto-hero" src="./assets/images/howto/hero.png" alt="Silvia workspace overview">

                    <h2 id="howto-concepts">Core Concepts</h2>
                    <div class="howto-figure">
                        <img src="./assets/images/howto/patch-example.png" alt="A simple patch" style="max-width: 520px;">
                        <span class="howto-figure-caption">A simple patch: nodes wired into an Output.</span>
                    </div>
                    <ul>
                        <li><strong>Nodes</strong> -- Each box does one thing: generate a pattern, apply a filter, grab a webcam, etc.</li>
                        <li><strong>Ports</strong> -- The dots on the sides. Outputs on the right, inputs on the left. Drag between them to connect.</li>
                        <li><strong>Connections</strong> -- Drag from one port to a compatible port to wire them together.</li>
                        <li><strong>Output Node</strong> -- The final destination. It takes a color input and renders everything to the GPU.</li>
                        <li><strong>Coordinates</strong> -- Centered at (0,0), extending from -1 to +1 in X and Y. Patterns look the same on any screen size.</li>
                    </ul>

                    <h2 id="howto-global">Global Shortcuts</h2>
                    <div class="howto-shortcut-grid">
                        <div class="howto-shortcut-key"><kbd>\`</kbd></div>
                        <div class="howto-shortcut-desc">Open the Quick Menu (fuzzy search for any node).</div>

                        <div class="howto-shortcut-key"><kbd>N</kbd></div>
                        <div class="howto-shortcut-desc">Toggle the Nodes Menu (browse by category).</div>

                        <div class="howto-shortcut-key"><kbd>H</kbd></div>
                        <div class="howto-shortcut-desc">Hide the editor. Shows just the output.</div>

                        <div class="howto-shortcut-key"><kbd>F</kbd></div>
                        <div class="howto-shortcut-desc">Toggle fullscreen.</div>

                        <div class="howto-shortcut-key"><kbd>Escape</kbd></div>
                        <div class="howto-shortcut-desc">Cancel, close modals, unfocus inputs.</div>

                        <div class="howto-shortcut-key"><kbd>P</kbd></div>
                        <div class="howto-shortcut-desc">Drop a dragged node in place.</div>

                        <div class="howto-shortcut-key"><strong>Scroll Wheel</strong></div>
                        <div class="howto-shortcut-desc">Scroll the workspace.</div>

                        <div class="howto-shortcut-key"><strong>Right-Click</strong></div>
                        <div class="howto-shortcut-desc">Quick Menu at cursor.</div>
                    </div>

                    <h2 id="howto-workspace">Workspaces</h2>
                    <div class="howto-shortcut-grid">
                        <div class="howto-shortcut-key"><kbd data-mod="ctrl">Ctrl</kbd> + <kbd>T</kbd></div>
                        <div class="howto-shortcut-desc">New workspace tab.</div>

                        <div class="howto-shortcut-key"><kbd data-mod="ctrl">Ctrl</kbd> + <kbd>1</kbd>-<kbd>9</kbd></div>
                        <div class="howto-shortcut-desc">Jump to workspace 1-9.</div>

                        <div class="howto-shortcut-key"><kbd data-mod="ctrl">Ctrl</kbd> + <kbd>S</kbd></div>
                        <div class="howto-shortcut-desc">Quick save. Overwrites the file, or opens Save dialog if new.</div>

                        <div class="howto-shortcut-key"><kbd data-mod="ctrl">Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd></div>
                        <div class="howto-shortcut-desc">Save As. Always opens the Save dialog.</div>

                        <div class="howto-shortcut-key"><strong>Double-click Tab</strong></div>
                        <div class="howto-shortcut-desc">Rename.</div>

                        <div class="howto-shortcut-key"><strong>Right-click Tab</strong></div>
                        <div class="howto-shortcut-desc">Tab menu (rename, properties, close).</div>
                    </div>
                    <div class="howto-figure">
                        <img src="./assets/images/howto/tab-context.png" alt="Tab context menu" style="max-width: 240px;">
                        <span class="howto-figure-caption">Tab context menu.</span>
                    </div>

                    <h2 id="howto-nodes">Nodes</h2>
                    <div class="howto-shortcut-grid">
                        <div class="howto-shortcut-key"><strong>Drag Header</strong></div>
                        <div class="howto-shortcut-desc">Move the node.</div>

                        <div class="howto-shortcut-key"><strong>Right-click Header</strong></div>
                        <div class="howto-shortcut-desc">Node context menu.</div>

                        <div class="howto-shortcut-key"><strong>Click</strong> <code>x</code></div>
                        <div class="howto-shortcut-desc">Delete the node.</div>

                        <div class="howto-shortcut-key"><strong>Click</strong> <code>show</code></div>
                        <div class="howto-shortcut-desc">Show this Output on the background.</div>
                    </div>
                    <div class="howto-figure">
                        <img src="./assets/images/howto/node-context.png" alt="Node context menu" style="max-width: 280px;">
                        <span class="howto-figure-caption">Node context menu.</span>
                    </div>

                    <h2 id="howto-ports">Ports & Connections</h2>
                    <div class="howto-shortcut-grid">
                        <div class="howto-shortcut-key"><strong>Drag Port</strong></div>
                        <div class="howto-shortcut-desc">Start a connection.</div>

                        <div class="howto-shortcut-key"><strong>Right-click Port</strong></div>
                        <div class="howto-shortcut-desc">Disconnect that port.</div>

                        <div class="howto-shortcut-key"><strong>Release on Empty</strong></div>
                        <div class="howto-shortcut-desc">Cancel the connection.</div>

                        <div class="howto-shortcut-key"><kbd>Escape</kbd></div>
                        <div class="howto-shortcut-desc">Cancel while dragging.</div>
                    </div>

                    <h2 id="howto-numbers">Number Inputs</h2>
                    <div class="howto-shortcut-grid">
                        <div class="howto-shortcut-key"><strong>Click + Drag</strong></div>
                        <div class="howto-shortcut-desc">Scrub the value. <kbd>Shift</kbd> = fine (0.1x).</div>

                        <div class="howto-shortcut-key"><strong>Scroll Wheel</strong></div>
                        <div class="howto-shortcut-desc">Adjust. <kbd>Shift</kbd> = fine (0.1x), <kbd data-mod="ctrl">Ctrl</kbd> = coarse (10x).</div>

                        <div class="howto-shortcut-key"><kbd>Up</kbd> / <kbd>Down</kbd></div>
                        <div class="howto-shortcut-desc">Step up / down.</div>

                        <div class="howto-shortcut-key"><strong>+/- Buttons</strong></div>
                        <div class="howto-shortcut-desc">Step by one. <kbd data-mod="ctrl">Ctrl</kbd>+click changes step size (10x / 0.1x).</div>

                        <div class="howto-shortcut-key"><kbd data-mod="ctrl">Ctrl</kbd> + <strong>Hover</strong></div>
                        <div class="howto-shortcut-desc">Show min/max/step editors.
                            <div class="howto-figure-inline"><img src="./assets/images/howto/number-minmax.png" alt="Min/max/step editors"></div>
                        </div>

                        <div class="howto-shortcut-key"><kbd>[</kbd> / <kbd>]</kbd></div>
                        <div class="howto-shortcut-desc">Jump to min / max.</div>

                        <div class="howto-shortcut-key"><kbd>D</kbd></div>
                        <div class="howto-shortcut-desc">Reset to default.</div>

                        <div class="howto-shortcut-key"><kbd>R</kbd></div>
                        <div class="howto-shortcut-desc">Full reset (value, min, max, and step).</div>

                        <div class="howto-shortcut-key"><kbd data-mod="alt">Alt</kbd> + <strong>Click</strong></div>
                        <div class="howto-shortcut-desc">MIDI learn -- map a CC knob or fader.</div>
                    </div>

                    <h2 id="howto-colors">Color Inputs</h2>
                    <div class="howto-shortcut-grid">
                        <div class="howto-shortcut-key"><strong>Click Swatch</strong></div>
                        <div class="howto-shortcut-desc">Open the color picker.</div>

                        <div class="howto-shortcut-key"><kbd>Escape</kbd> / <strong>Click Outside</strong></div>
                        <div class="howto-shortcut-desc">Close it.</div>
                    </div>
                    <div class="howto-figure">
                        <img src="./assets/images/howto/color-picker.png" alt="HSL color picker" style="max-width: 220px;">
                        <span class="howto-figure-caption">Color picker with HSL sliders and hex input.</span>
                    </div>

                    <h2 id="howto-actions">Action Buttons</h2>
                    <div class="howto-shortcut-grid">
                        <div class="howto-shortcut-key"><strong>Click</strong></div>
                        <div class="howto-shortcut-desc">Fire the action.</div>

                        <div class="howto-shortcut-key"><kbd data-mod="alt">Alt</kbd> + <strong>Click</strong></div>
                        <div class="howto-shortcut-desc">MIDI learn -- map a note or pad.</div>
                    </div>

                    <h2 id="howto-menus">Node Menus</h2>

                    <h3>Quick Menu</h3>
                    <p>Press <kbd>\`</kbd> or right-click the workspace. Type to search, arrow keys to navigate.</p>
                    <div class="howto-shortcut-grid">
                        <div class="howto-shortcut-key"><strong>Type</strong></div>
                        <div class="howto-shortcut-desc">Fuzzy search.</div>

                        <div class="howto-shortcut-key"><kbd>Up</kbd> / <kbd>Down</kbd></div>
                        <div class="howto-shortcut-desc">Navigate results.</div>

                        <div class="howto-shortcut-key"><kbd>Enter</kbd></div>
                        <div class="howto-shortcut-desc">Create the node.</div>

                        <div class="howto-shortcut-key"><kbd>Escape</kbd></div>
                        <div class="howto-shortcut-desc">Close.</div>
                    </div>

                    <h3>Nodes Menu</h3>
                    <p>Press <kbd>N</kbd> or click the Nodes button. Browse nodes by category.</p>
                    <div class="howto-shortcut-grid">
                        <div class="howto-shortcut-key"><strong>Hover / Click Category</strong></div>
                        <div class="howto-shortcut-desc">Open its submenu.</div>

                        <div class="howto-shortcut-key"><strong>Click Node</strong></div>
                        <div class="howto-shortcut-desc">Create it.</div>

                        <div class="howto-shortcut-key"><kbd>Arrow Keys</kbd></div>
                        <div class="howto-shortcut-desc">Navigate.</div>

                        <div class="howto-shortcut-key"><kbd>Enter</kbd></div>
                        <div class="howto-shortcut-desc">Select.</div>

                        <div class="howto-shortcut-key"><kbd>Escape</kbd></div>
                        <div class="howto-shortcut-desc">Back / close.</div>
                    </div>

                    <div class="howto-figure-row">
                        <div class="howto-figure">
                            <img src="./assets/images/howto/quick-menu.png" alt="Quick Menu" style="max-width: 260px;">
                            <span class="howto-figure-caption">Quick Menu.</span>
                        </div>
                        <div class="howto-figure">
                            <img src="./assets/images/howto/nodes-menu.png" alt="Nodes Menu" style="max-width: 400px;">
                            <span class="howto-figure-caption">Nodes Menu.</span>
                        </div>
                    </div>

                    <h2 id="howto-midi">MIDI</h2>
                    <ul>
                        <li><strong>MIDI Learn</strong> -- <kbd data-mod="alt">Alt</kbd>+click any number input or action button. Then move a knob/fader or press a key to assign it.</li>
                        <li><strong>Knobs & Faders</strong> -- Map to number inputs via CC.</li>
                        <li><strong>Keys & Pads</strong> -- Map to action buttons via Note.</li>
                        <li><strong>Indicator</strong> -- Mapped controls show a dot. They flash when triggered.
                            <div class="howto-figure-inline"><img src="./assets/images/howto/midi-dot.png" alt="MIDI mapped indicator dot"></div>
                        </li>
                        <li><strong>Auto-saved</strong> -- Mappings persist across sessions.</li>
                        <li><strong>Settings</strong> -- See connected devices and clear mappings.</li>
                    </ul>

                    <h2 id="howto-maininput">Main Input</h2>
                    <p>The left panel. Sets up video and audio sources for Main Input nodes.</p>
                    <ul>
                        <li><strong>Video</strong> -- File, webcam, or screen capture.</li>
                        <li><strong>Audio</strong> -- File, mic, or the video's audio track.</li>
                        <li>Click the arrow to collapse / expand.</li>
                    </ul>
                    <div class="howto-figure">
                        <img src="./assets/images/howto/main-input.png" alt="Main Input panel" style="max-width: 240px;">
                        <span class="howto-figure-caption">Main Input panel.</span>
                    </div>

                    <h2 id="howto-tips">Tips</h2>
                    <ul>
                        <li><strong>Background</strong> -- Click <code>show</code> on an Output node to display it behind the editor.</li>
                        <li><strong>Projection</strong> -- Open a fullscreen projector window from the Mixer panel (right side). Great for second monitors.</li>
                        <li><strong>Save / Open</strong> -- Save stores to local storage or a <code>.svs</code> file. Open loads a patch into a new tab.</li>
                        <li><strong>Tabs</strong> -- Each workspace tab is a separate scene. Switch tabs to swap between setups during a performance.</li>
                        <li><strong>Node Visibility</strong> -- Right-click a node header to choose which workspaces show it. One node can appear on multiple tabs.</li>
                    </ul>
                    <div class="howto-figure-row">
                        <div class="howto-figure">
                            <img src="./assets/images/howto/output-show.png" alt="Output showing on background" style="max-width: 280px;">
                            <span class="howto-figure-caption">Output on background.</span>
                        </div>
                        <div class="howto-figure">
                            <img src="./assets/images/howto/projection.png" alt="Projection panel" style="max-width: 280px;">
                            <span class="howto-figure-caption">Projection controls.</span>
                        </div>
                    </div>

                    <h2 id="howto-feedback">Feedback</h2>
                    <p>Each Output node stores its previous frames in a ring buffer on the GPU (1-120 frames, set via <strong>Frame History</strong> on the Output). Feedback nodes read from this buffer, letting you blend past frames back into the current one -- trails, echoes, warps, time displacement.</p>

                    <h3>Basic Setup</h3>
                    <div class="howto-shortcut-grid">
                        <div class="howto-shortcut-key"><strong>1.</strong></div>
                        <div class="howto-shortcut-desc">Create any source node.</div>

                        <div class="howto-shortcut-key"><strong>2.</strong></div>
                        <div class="howto-shortcut-desc">Add a blend node (Mix, Add, Screen, etc.).</div>

                        <div class="howto-shortcut-key"><strong>3.</strong></div>
                        <div class="howto-shortcut-desc">Add a <strong>Feedback</strong> node.</div>

                        <div class="howto-shortcut-key"><strong>4.</strong></div>
                        <div class="howto-shortcut-desc">Wire source into one blend input, Feedback into the other.</div>

                        <div class="howto-shortcut-key"><strong>5.</strong></div>
                        <div class="howto-shortcut-desc">Wire the blend into your Output.</div>
                    </div>
                    <p>The Feedback node outputs the previous frame from <em>this</em> Output's buffer. The blend mixes it with fresh content each frame, creating persistence. Without fresh content, feedback fades to black.</p>

                    <h3>Feedback Nodes</h3>
                    <div class="howto-shortcut-grid">
                        <div class="howto-shortcut-key"><strong>Feedback</strong></div>
                        <div class="howto-shortcut-desc">Previous frame. Wire into a blend node for trails.</div>

                        <div class="howto-shortcut-key"><strong>Variable-Time Feedback</strong></div>
                        <div class="howto-shortcut-desc">Any frame from history. Delay 0 = last frame, 1 = oldest stored frame.</div>

                        <div class="howto-shortcut-key"><strong>Feedback Mix</strong></div>
                        <div class="howto-shortcut-desc">Built-in blend: mixes live input with a delayed frame. No extra blend node needed.</div>

                        <div class="howto-shortcut-key"><strong>Geiss Flow</strong></div>
                        <div class="howto-shortcut-desc">Warps previous frame through swirling flow fields, blends in new content. Has its own fade.</div>

                        <div class="howto-shortcut-key"><strong>Star Gate</strong></div>
                        <div class="howto-shortcut-desc">Slit-scan: a narrow stripe captures the current frame, everything else smears from the previous frame.</div>
                    </div>

                    <h3>Frame Out</h3>
                    <p>Every Output has a <strong>Frame Out</strong> port on its right side. It outputs the rendered image as a texture.</p>
                    <ul>
                        <li><strong>Chain Outputs</strong> -- Feed Output A's Frame Out through effects into Output B. Each Output renders independently.</li>
                        <li><strong>Performance</strong> -- Nodes like Blur re-run the entire upstream graph per sample. Placing an Output before the Blur rasterizes it to a texture first. The Blur then reads cheap pixels instead of re-computing the graph 9+ times per pixel.</li>
                        <li><strong>Cross-Output loops</strong> -- Wire A's Frame Out into B, and B's Frame Out into A. Each reads the other's previous frame, creating a ping-pong between two render chains. Works with 2, 3, or more Outputs in a ring.</li>
                    </ul>

                    <h3>Notes</h3>
                    <ul>
                        <li><strong>Memory</strong> -- Frame History uses GPU memory. 1-2 frames is enough for trails; increase only for Variable-Time or Star Gate.</li>
                        <li><strong>One-frame delay</strong> -- Feedback reads the previous frame, never the current one. At 60fps that's ~16ms.</li>
                        <li><strong>Buffer resets</strong> -- Changing resolution or history size clears the buffer (brief flash).</li>
                        <li><strong>Geiss Flow and Star Gate</strong> have built-in fade and blending -- they don't need a separate blend node and won't go black on their own.</li>
                    </ul>

                    <h2 id="howto-performance">Performance</h2>
                    <ul>
                        <li><strong>Video loops</strong> -- For smooth looping, encode at your monitor's refresh rate (60fps, 120fps) with exact integer durations. Fractional rates like 59.926fps may stutter at loop points.</li>
                    </ul>

                </div>
            </div>

            <div class="howto-footer">
                <div class="modal-actions">
                    <button class="cancel-btn" data-el="closeBtn">Close</button>
                </div>
            </div>
        </div>
    </div>
    `

    const fragment = StringToFragment(html)
    const elements = autowire(fragment)

    // Build TOC from section headers
    const tocNav = fragment.querySelector('.howto-toc')
    const body = fragment.querySelector('.howto-body')
    const sections = body.querySelectorAll('h2[id]')
    sections.forEach(h2 => {
        const item = document.createElement('div')
        item.className = 'howto-toc-item'
        item.textContent = h2.textContent
        item.dataset.target = h2.id
        tocNav.appendChild(item)
    })

    document.getElementById('modal-container').appendChild(fragment)
    return elements
}

function updatePlatformToggle(btn){
    btn.textContent = isMac ? 'Keys: macOS' : 'Keys: Win/Linux'
    btn.title = 'Click to show shortcuts for ' + (isMac ? 'Windows/Linux' : 'macOS')
}

function setupScrollSpy(body, toc){
    const tocItems = toc.querySelectorAll('.howto-toc-item')
    const sectionEls = body.querySelectorAll('h2[id]')

    // Click-to-scroll
    tocItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = body.querySelector('#' + item.dataset.target)
            if(target) target.scrollIntoView({behavior: 'smooth', block: 'start'})
        })
    })

    // Scroll-spy via IntersectionObserver
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if(entry.isIntersecting){
                const id = entry.target.id
                tocItems.forEach(item => {
                    item.classList.toggle('active', item.dataset.target === id)
                })
            }
        })
    }, {
        root: body,
        rootMargin: '0px 0px -80% 0px',
        threshold: 0
    })

    sectionEls.forEach(el => observer.observe(el))

    return () => {
        // Reset to first item active
        tocItems.forEach((item, i) => item.classList.toggle('active', i === 0))
    }
}

/**
 * Shows the howto modal
 */
export function showHowto(){
    if(howtoModal){
        howtoModal.style.display = 'flex'
        howtoBody.scrollTop = 0
    }
}

/**
 * Initializes the "How To" guide system.
 */
export function initHowto(){
    ({howtoModal, closeBtn, howtoBody} = createHowtoModal())

    const toc = howtoModal.querySelector('.howto-toc')
    const resetToc = setupScrollSpy(howtoBody, toc)
    const platformToggle = howtoModal.querySelector('[data-el="platformToggle"]')

    // Apply detected platform and wire toggle
    applyPlatform(howtoModal)
    updatePlatformToggle(platformToggle)

    platformToggle.addEventListener('click', () => {
        isMac = !isMac
        applyPlatform(howtoModal)
        updatePlatformToggle(platformToggle)
    })

    const openBtn = document.getElementById('howto-btn')
    if(!openBtn){
        console.error('Could not find #howto-btn to attach listener.')
        return
    }

    openBtn.addEventListener('click', () => {
        howtoModal.style.display = 'flex'
        howtoBody.scrollTop = 0
        resetToc()
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
