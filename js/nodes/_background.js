// Multimonitor support
import {mainMixer} from '../mainMixer.js'
import {showAlertModal} from '../utils.js'

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
    get _projectorWindow() { return projectorWindow },

    init(){
        const bgVideo = document.createElement('video')
        bgVideo.id = 'background-video'
        bgVideo.style.background = 'black'
        document.body.appendChild(bgVideo)
        bgVideoRef = bgVideo
        bgVideo.width = window.innerWidth
        bgVideo.height = Math.floor(window.innerWidth * (9 / 16))

        window.addEventListener('resize', () => {
            bgVideo.width = window.innerWidth
            bgVideo.height = Math.floor(window.innerWidth * (9 / 16))
        })

        window.addEventListener('beforeunload', () => {
            if (projectorWindow && !projectorWindow.closed) {
                projectorWindow.close();
            }
        });
    },

    setCanvas(canvas){
        return  // Main mixer controls background now
    },

    openProjector(){
        if(projectorWindow && !projectorWindow.closed){
            projectorWindow.focus()
            return
        }

        // Get dimensions from main mixer, fallback to default 1280x720
        let width = 1280
        let height = 720

        if (mainMixer.canvas && mainMixer.canvas.width > 0 && mainMixer.canvas.height > 0) {
            width = mainMixer.canvas.width
            height = mainMixer.canvas.height
        }

        projectorWindow = window.open('about:blank', 'projector', `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes`)
        if(!projectorWindow){
            showAlertModal('Popup blocker may have prevented the projector window from opening.', 'Projector')
            return
        }

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
        window.connectProjectorStream = (stream) => {
            const video = document.getElementById('projector-video')
            if (video && stream) {
                video.srcObject = stream
                video.play().catch(e => console.error('Failed to play projector video:', e))
            }
        }
    </script>
</body>
</html>`

        // Write the content to the blank window
        projectorWindow.document.write(projectorHTML)
        projectorWindow.document.close()

        // Set up stream connection after content is injected
        setTimeout(() => {
            projectorVideoEl = projectorWindow.document.getElementById('projector-video')

            if (projectorVideoEl) {
                const connected = mainMixer.connectProjector(projectorVideoEl)
                if (!connected) {
                    // Set up a periodic check for the stream
                    const checkStream = setInterval(() => {
                        if (mainMixer.connectProjector(projectorVideoEl)) {
                            clearInterval(checkStream)
                        }
                    }, 500)
                    setTimeout(() => clearInterval(checkStream), 10000)
                }
            }
        }, 100)
    },


    updateProjectorSize(){
        if(!projectorWindow || projectorWindow.closed) return

        // Get current dimensions from main mixer
        let width = 1280
        let height = 720

        if (mainMixer.canvas && mainMixer.canvas.width > 0 && mainMixer.canvas.height > 0) {
            width = mainMixer.canvas.width
            height = mainMixer.canvas.height
        }

        // Resize the projector window (same method for both web and Electron with nativeWindowOpen)
        projectorWindow.resizeTo(width, height)

        // Main mixer will handle stream reconnection automatically
        // when the new stream is created after canvas resize
    },

    reconnectProjectorStream(newStream){
        if(!projectorWindow || projectorWindow.closed) return false
        if(!newStream) return false

        if (projectorWindow.connectProjectorStream) {
            projectorWindow.connectProjectorStream(newStream)
        } else if (projectorVideoEl) {
            projectorVideoEl.srcObject = newStream
            projectorVideoEl.play().catch(e => console.error('Failed to play projector stream:', e))
        } else {
            return false
        }

        return true
    }
}