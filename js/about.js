// about.js
import {autowire, StringToFragment} from './utils.js'
import {getCurrentVersion} from './version.js'
import {showHowto} from './howto.js'

let aboutModal
let closeBtn
let howtoBtn

function getPlatform() {
    return (typeof window !== 'undefined' && window.electronAPI) ? 'electron' : 'web'
}

function getVersionString() {
    return `${getCurrentVersion()}-${getPlatform()}`
}

function createAboutModal(){
    const html = `
    <div class="modal-overlay" style="display: none;" data-el="aboutModal">
        <div class="modal-content" style="align-items: center; width: 65rem;">
            <img src="./assets/icons/silvia_logo_name.png" style="height: 10rem;">
            <p style="margin: 0.5rem 0 1rem 0; font-style: italic; color: var(--text-secondary);">${getVersionString()}</p>

            <div class="about-section">
                <p>Free modular video synthesizer for live performance and creative coding.</p>
                <p><strong>No warranty. Sorry for bugs.</strong></p>
            </div>

            <div class="about-section">
                <p>Created by figrita -- <a href="https://buymeacoffee.com/figrita" data-external-link><strong>Buy me a coffee</strong></a></p>
                <p><a href="https://github.com/figrita/silvia" data-external-link><strong>Source on Github</strong></a></p>
                <p><a href="https://discord.gg/cZYa2bDjs9" data-external-link><strong>Silvia Discord</strong></a></p>
                <p><a href="https://silviahub.net/" data-external-link><strong>Silvia Hub</strong></a> -- browse and share workspaces</p>
            </div>

            <div class="about-section">
                <p>AGPL-3.0. Third-party: Lucide icons (ISC), gifler.js (Apache-2.0), modern-normalize (MIT), Shadertoy code (WTFPL/CC0).</p>
            </div>

            <div class="about-section">
                <p>Trans rights are human rights</p>
            </div>
            
            <div class="modal-actions">
                <button class="cancel-btn" data-el="howtoBtn">How To Use Silvia</button>
                <button class="cancel-btn" data-el="closeBtn">Got it</button>
            </div>
        </div>
    </div>
    `

    const fragment = StringToFragment(html)
    const elements = autowire(fragment)
    document.getElementById('modal-container').appendChild(fragment)
    return elements
}

/**
 * Shows the about modal
 */
export function showAbout(){
    if(aboutModal){
        aboutModal.style.display = 'flex'
    }
}

/**
 * Initializes the "About" guide system.
 */
export function initAbout(){
    ({aboutModal, closeBtn, howtoBtn} = createAboutModal())

    const openBtn = document.getElementById('about-btn')
    if(!openBtn){
        console.error('Could not find #about-btn to attach listener.')
        return
    }

    openBtn.addEventListener('click', () => {
        showAbout()
    })

    closeBtn.addEventListener('click', () => {
        aboutModal.style.display = 'none'
    })

    howtoBtn.addEventListener('click', () => {
        aboutModal.style.display = 'none'
        showHowto()
    })

    // Handle external links
    const externalLinks = aboutModal.querySelectorAll('[data-external-link]')
    externalLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault()
            const url = link.getAttribute('href')
            if (url && window.electronAPI && window.electronAPI.openExternal) {
                window.electronAPI.openExternal(url)
            } else if (url) {
                // Fallback for web version
                window.open(url, '_blank', 'noopener,noreferrer')
            }
        })
    })

    aboutModal.addEventListener('click', (e) => {
        if(e.target === aboutModal){
            aboutModal.style.display = 'none'
        }
    })
    
    // Close on escape
    document.addEventListener('escape-pressed', () => {
        if(aboutModal.style.display === 'flex'){
            aboutModal.style.display = 'none'
        }
    })
}