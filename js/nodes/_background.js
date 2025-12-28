// Multimonitor support
import {masterMixer} from '../masterMixer.js'

let projectorWindow = null
let bgVideoRef = null
let projectorVideoEl = null

/**
 * A singleton object to manage a fullscreen WebGL canvas that renders
 * a shader graph in the background of the entire application.
 */
export const BackgroundRenderer = {
    isActive: false,
    outputCanvas: null,
    stream: null,

    init(){
        const bgVideo = document.createElement('video')
        bgVideo.id = 'background-video'
        bgVideo.style.background = 'black'
        document.body.appendChild(bgVideo)
        bgVideoRef = bgVideo
        const editorRect = editor.getBoundingClientRect()
        bgVideo.width = editorRect.width
        bgVideo.height = Math.floor(editorRect.width * (9 / 16))

        window.addEventListener('resize', () => {
            const editorRect = editor.getBoundingClientRect()
            bgVideo.width = editorRect.width
            bgVideo.height = Math.floor(editorRect.width * (9 / 16))
        })

        window.addEventListener('beforeunload', () => {
            if (projectorWindow && !projectorWindow.closed) {
                projectorWindow.close();
            }
        });
    },

    setCanvas(canvas){
        console.log('BackgroundRenderer.setCanvas() disabled - using Master Mixer')
        return  // DO NOTHING - Master mixer controls background now
    },

    openProjector(){
        if(projectorWindow && !projectorWindow.closed){
            projectorWindow.focus()
            console.log('Projector window already open.')
            return
        }

        // Get dimensions from master mixer, fallback to default 1280x720
        let width = 1280
        let height = 720

        if (masterMixer.canvas && masterMixer.canvas.width > 0 && masterMixer.canvas.height > 0) {
            width = masterMixer.canvas.width
            height = masterMixer.canvas.height
            console.log(`Projector using master mixer dimensions: ${width}x${height}`)
        } else {
            console.log('Master mixer not ready, using default projector dimensions')
        }

        // Create blank window and inject content directly
        console.log('Opening blank projector window')
        projectorWindow = window.open('about:blank', 'projector', `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes`)
        if(!projectorWindow){
            alert('Popup blocker may have prevented the projector window from opening.')
            return
        }
        console.log('Projector window opened:', projectorWindow)

        // Inject HTML content directly
        const projectorHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Projector</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: black;
            overflow: hidden;
        }
        #projector-video {
            width: 100vw;
            height: 100vh;
            object-fit: cover;
        }
    </style>
</head>
<body>
    <video id="projector-video" autoplay muted></video>
    <script>
        console.log('Projector window loaded')
        console.log('electronAPI available:', !!window.electronAPI)

        // Global function for stream connection
        window.connectProjectorStream = (stream) => {
            const video = document.getElementById('projector-video')
            if (video && stream) {
                console.log('Connecting stream to projector video:', stream)
                video.srcObject = stream
                video.play().then(() => {
                    console.log('Projector video playing successfully')
                }).catch(e => {
                    console.error('Failed to play projector video:', e)
                })
            } else {
                console.error('No video element or stream:', { video, stream })
            }
        }

        console.log('Projector window ready for stream connection')
    </script>
</body>
</html>`

        // Write the content to the blank window
        projectorWindow.document.write(projectorHTML)
        projectorWindow.document.close()

        // Set up stream connection after content is injected
        setTimeout(() => {
            console.log('Setting up projector stream connection')

            // Store reference for later use
            projectorVideoEl = projectorWindow.document.getElementById('projector-video')

            // Try both connection methods for compatibility
            if (projectorVideoEl) {
                // Try masterMixer.connectProjector first (original method)
                const connected = masterMixer.connectProjector(projectorVideoEl)
                if (connected) {
                    console.log('Master mixer stream connected to projector (direct)')
                } else {
                    console.log('No master mixer stream available yet, setting up periodic check')
                    // Set up a periodic check for the stream
                    const checkStream = setInterval(() => {
                        if (masterMixer.connectProjector(projectorVideoEl)) {
                            console.log('Master mixer stream connected to projector (delayed)')
                            clearInterval(checkStream)
                        }
                    }, 500)
                    // Stop checking after 10 seconds
                    setTimeout(() => clearInterval(checkStream), 10000)
                }
            } else {
                console.error('Could not find #projector-video element')
            }
        }, 100) // Small delay to ensure content is fully loaded
    },


    updateProjectorSize(){
        if(!projectorWindow || projectorWindow.closed) return

        // Get current dimensions from master mixer
        let width = 1280
        let height = 720

        if (masterMixer.canvas && masterMixer.canvas.width > 0 && masterMixer.canvas.height > 0) {
            width = masterMixer.canvas.width
            height = masterMixer.canvas.height
            console.log(`📏 Updating projector size to: ${width}x${height}`)
        }

        // Resize the projector window (same method for both web and Electron with nativeWindowOpen)
        projectorWindow.resizeTo(width, height)

        // Master mixer will handle stream reconnection automatically
        // when the new stream is created after canvas resize
    },

    reconnectProjectorStream(newStream){
        console.log('reconnectProjectorStream called with:', {
            projectorWindow: !!projectorWindow,
            projectorWindowClosed: projectorWindow?.closed,
            newStream: !!newStream
        })

        if(!projectorWindow || projectorWindow.closed) {
            console.log('No projector window available')
            return false
        }

        if(!newStream) {
            console.warn('No stream provided for reconnection')
            return false
        }

        console.log(`Reconnecting projector with new stream:`, newStream)

        // Use the projector window's connection function if available
        if (projectorWindow.connectProjectorStream) {
            projectorWindow.connectProjectorStream(newStream)
        } else if (projectorVideoEl) {
            // Fallback to direct DOM access
            projectorVideoEl.srcObject = newStream
            projectorVideoEl.play().then(() => {
                console.log('Projector stream reconnected successfully (direct)')
            }).catch(e => {
                console.error('Failed to play projector stream:', e)
            })
        } else {
            console.log('No projector connection method available')
            return false
        }

        return true
    }
}