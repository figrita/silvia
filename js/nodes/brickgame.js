import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'


registerNode({
    slug: 'brickgame',
    icon: '🧱',
    label: 'Brick Game',
    tooltip: 'Classic brick breaking game. Control with action inputs from MIDI/gamepad.',
    
    input: {
        'leftPaddle': {
            label: 'Paddle Left',
            type: 'action',
            control: {},
            downCallback() { this.runtimeState.paddleLeft = true },
            upCallback() { this.runtimeState.paddleLeft = false }
        },
        'rightPaddle': {
            label: 'Paddle Right', 
            type: 'action',
            control: {},
            downCallback() { this.runtimeState.paddleRight = true },
            upCallback() { this.runtimeState.paddleRight = false }
        },
        'startGame': {
            label: 'Start/Reset',
            type: 'action',
            control: {},
            downCallback() { this._startGame() }
        },
        'pauseGame': {
            label: 'Pause',
            type: 'action', 
            control: {},
            downCallback() { this._togglePause() }
        },
        'foregroundColor': {
            label: 'Foreground',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'backgroundColor': {
            label: 'Background', 
            type: 'color',
            control: {default: '#000000ff'}
        }
    },
    
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName) {
                const fgColor = this.getInput('foregroundColor', cc)
                const bgColor = this.getInput('backgroundColor', cc)
                
                return `vec4 ${funcName}(vec2 uv) {
    vec2 sampleUV = (uv + 1.0) * 0.5;
    sampleUV.y = 1.0 - sampleUV.y; // Flip Y coordinate
    // Clip coordinates outside [0,1] range with 1px buffer
    if (sampleUV.x < 0.004 || sampleUV.x > 0.996 || sampleUV.y < 0.004 || sampleUV.y > 0.996) {
        return ${bgColor};
    }
    
    float mask = texture(${uniformName}, sampleUV).r;
    return mix(${bgColor}, ${fgColor}, mask);
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap) {
                if (this.isDestroyed) return
                
                // Create or get texture
                let texture = textureMap.get(this)
                if (!texture) {
                    texture = gl.createTexture()
                    textureMap.set(this, texture)
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
                }
                
                // Use the game canvas as texture source
                if (this.runtimeState.gameCanvas) {
                    gl.activeTexture(gl.TEXTURE0 + textureUnit)
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.runtimeState.gameCanvas)
                    
                    const location = gl.getUniformLocation(program, uniformName)
                    gl.uniform1i(location, textureUnit)
                }
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) {
    vec2 sampleUV = (uv + 1.0) * 0.5;
    sampleUV.y = 1.0 - sampleUV.y; // Flip Y coordinate
    // Clip coordinates outside [0,1] range with 1px buffer
    if (sampleUV.x < 0.004 || sampleUV.x > 0.996 || sampleUV.y < 0.004 || sampleUV.y > 0.996) {
        return 0.0;
    }
    return texture(${uniformName}, sampleUV).r;
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap) {
                // Share the same texture as the output port
                const outputPort = this.output.output
                if (outputPort.textureUniformUpdate) {
                    outputPort.textureUniformUpdate.call(this, uniformName, gl, program, textureUnit, textureMap)
                }
            }
        },
        'score': {
            label: 'Score',
            type: 'float',
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, this.runtimeState.score)
            }
        },
        'bricksLeft': {
            label: 'Bricks Left',
            type: 'float', 
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, this.runtimeState.bricksLeft)
            }
        },
        'ballVelocity': {
            label: 'Ball Speed',
            type: 'float',
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                const speed = Math.sqrt(this.runtimeState.ballVX * this.runtimeState.ballVX + 
                                      this.runtimeState.ballVY * this.runtimeState.ballVY)
                gl.uniform1f(location, speed)
            }
        },
        'brickBroken': {
            label: 'Brick Broken',
            type: 'action'
        },
        'ballLost': {
            label: 'Ball Lost',
            type: 'action'
        },
        'gameWon': {
            label: 'Game Won', 
            type: 'action'
        },
        'gameStarted': {
            label: 'Game Started',
            type: 'action'
        }
    },
    
    elements: {
        gameCanvas: null,
        scoreDisplay: null,
        bricksDisplay: null,
        autoResetCheckbox: null,
        autoPlayCheckbox: null
    },
    
    values: {
        paddleSpeed: 0.02,
        ballSpeed: 0.008,
        paddleWidth: 0.3,
        autoReset: false,
        autoPlay: false
    },
    
    runtimeState: {
        // Game canvas for rendering
        gameCanvas: null,
        gameCtx: null,
        
        // Game state
        gameRunning: false,
        gamePaused: false,
        ballX: 0.0,
        ballY: -0.7,
        ballVX: 0.006,
        ballVY: 0.006,
        paddleX: 0.0,
        paddleWidth: 0.3,
        
        // Control state
        paddleLeft: false,
        paddleRight: false,
        
        // Bricks (8x6 grid)
        bricks: new Array(48).fill(1),
        bricksLeft: 48,
        score: 0,
        
        // Animation
        animationFrameId: null,
        lastTime: 0,

        // Auto-play
        autoPlayStartTime: 0,
        autoPlayDirection: 1 // 1 for right, -1 for left
    },

    onCreate() {
        if (!this.customArea) return

        this._createUI()
        this._initGame()
        this._initCanvas()
        this._startGameLoop()

        // If auto-reset is enabled on load, start the game
        if (this.values.autoReset && !this.runtimeState.gameRunning) {
            this._startGame()
        }
    },

    onDestroy() {
        if (this.runtimeState.animationFrameId) {
            cancelAnimationFrame(this.runtimeState.animationFrameId)
        }
    },

    _createUI() {
        const html = `
            <div style="padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: #ccc;">
                    <span data-el="scoreDisplay">Score: 0</span>
                    <span data-el="bricksDisplay">Bricks: 48</span>
                </div>
                <canvas data-el="gameCanvas" width="300" height="300"
                    style="width: 100%; height: auto; aspect-ratio: 1/1; border: 1px solid #555; background: #000;">
                </canvas>
                <div style="display: flex; gap: 1rem; justify-content: center;">
                    <div class="checkbox-group" style="margin: 0;">
                        <label>
                            <input type="checkbox" data-el="autoResetCheckbox">
                            <span>Auto Reset</span>
                        </label>
                    </div>
                    <div class="checkbox-group" style="margin: 0;">
                        <label>
                            <input type="checkbox" data-el="autoPlayCheckbox">
                            <span>Auto Play</span>
                        </label>
                    </div>
                </div>
                <div style="font-size: 0.8rem; color: #888; text-align: center;">
                    Connect Paddle Left/Right to gamepad or MIDI for controls
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        // Set initial checkbox states
        this.elements.autoResetCheckbox.checked = this.values.autoReset
        this.elements.autoPlayCheckbox.checked = this.values.autoPlay

        // Add event listeners
        this.elements.autoResetCheckbox.addEventListener('change', (e) => {
            this.values.autoReset = e.target.checked
            // If auto-reset is enabled and game is not running, start the game
            if (e.target.checked && !this.runtimeState.gameRunning) {
                this._startGame()
            }
        })

        this.elements.autoPlayCheckbox.addEventListener('change', (e) => {
            this.values.autoPlay = e.target.checked
            if (e.target.checked) {
                this.runtimeState.autoPlayStartTime = performance.now()
            }
        })
    },

    _initGame(won) {
        // Reset game state
        this.runtimeState.ballX = 0.0
        this.runtimeState.ballY = -0.7
        // Random initial velocity
        this.runtimeState.ballVX = (Math.random() - 0.5) * 0.008
        this.runtimeState.ballVY = Math.random() * 0.004 + 0.004
        this.runtimeState.paddleX = 0.0
        this.runtimeState.bricks = new Array(48).fill(1)
        this.runtimeState.bricksLeft = 48
        if (!won) this.runtimeState.score = 0
        this.runtimeState.gameRunning = false
        this.runtimeState.gamePaused = false
        
        this._updateUI()
    },

    _startGame() {
        if (!this.runtimeState.gameRunning) {
            this.runtimeState.gameRunning = true
            this.runtimeState.gamePaused = false
            this.triggerAction('gameStarted')
        } else {
            this._initGame()
            this.runtimeState.gameRunning = true
        }
    },

    _togglePause() {
        if (this.runtimeState.gameRunning) {
            this.runtimeState.gamePaused = !this.runtimeState.gamePaused
        }
    },

    _startGameLoop() {
        const gameLoop = (timestamp) => {
            if (this.isDestroyed) return
            
            const deltaTime = timestamp - this.runtimeState.lastTime
            this.runtimeState.lastTime = timestamp
            
            if (this.runtimeState.gameRunning && !this.runtimeState.gamePaused) {
                this._updateGame(deltaTime)
            }
            
            this._renderGame()
            this.runtimeState.animationFrameId = requestAnimationFrame(gameLoop)
        }
        
        this.runtimeState.animationFrameId = requestAnimationFrame(gameLoop)
    },

    _updateGame(deltaTime) {
        // Auto-play or manual paddle control
        if (this.values.autoPlay) {
            this._updateAutoPlay()
        } else {
            // Manual paddle control
            if (this.runtimeState.paddleLeft && this.runtimeState.paddleX > -1.0 + this.runtimeState.paddleWidth/2) {
                this.runtimeState.paddleX -= this.values.paddleSpeed
            }
            if (this.runtimeState.paddleRight && this.runtimeState.paddleX < 1.0 - this.runtimeState.paddleWidth/2) {
                this.runtimeState.paddleX += this.values.paddleSpeed
            }
        }
        
        // Update ball position
        this.runtimeState.ballX += this.runtimeState.ballVX
        this.runtimeState.ballY += this.runtimeState.ballVY
        
        // Ball collision with walls
        if (this.runtimeState.ballX <= -1.0 || this.runtimeState.ballX >= 1.0) {
            this.runtimeState.ballVX = -this.runtimeState.ballVX
        }
        if (this.runtimeState.ballY >= 1.0) {
            this.runtimeState.ballVY = -this.runtimeState.ballVY
        }
        
        // Ball lost (bottom)
        if (this.runtimeState.ballY <= -1.0) {
            this.triggerAction('ballLost')
            if (this.values.autoReset) {
                // Auto-reset: restart the game immediately
                this._initGame()
                this.runtimeState.gameRunning = true
            } else {
                // Manual reset: stop the game and wait for user input
                this._initGame()
            }
            return
        }
        
        // Ball collision with paddle
        if (this.runtimeState.ballY <= -0.8 && this.runtimeState.ballY >= -0.9 &&
            Math.abs(this.runtimeState.ballX - this.runtimeState.paddleX) < this.runtimeState.paddleWidth/2) {
            this.runtimeState.ballVY = Math.abs(this.runtimeState.ballVY)
            // Curve effect: hit position determines angle and speed
            const hitPos = (this.runtimeState.ballX - this.runtimeState.paddleX) / (this.runtimeState.paddleWidth/2)
            // Normalize hit position to [-1, 1] where 0 is center
            const curveStrength = 0.006
            const speedBoost = 1.0 + Math.abs(hitPos) * 0.02
            
            // Set new velocity based on hit position
            this.runtimeState.ballVX = hitPos * curveStrength * speedBoost
            this.runtimeState.ballVY = this.runtimeState.ballVY * speedBoost
        }
        
        // Ball collision with bricks
        this._checkBrickCollisions()
        
        // Check win condition
        if (this.runtimeState.bricksLeft === 0) {
            this.triggerAction('gameWon')
            if (this.values.autoReset) {
                // Auto-reset: restart the game immediately (preserve score on win)
                this._initGame(true)
                this.runtimeState.gameRunning = true
            } else {
                // Manual reset: stop the game and wait for user input
                this._initGame(true)
            }
        }

        this._updateUI()
    },

    _updateAutoPlay() {
        // Smart AI: only chase ball when it's heading down and predict where it will hit
        const ballY = this.runtimeState.ballY
        const ballVY = this.runtimeState.ballVY
        const paddleX = this.runtimeState.paddleX
        const paddleHalfWidth = this.runtimeState.paddleWidth / 2
        const paddleY = -0.85 // Paddle position

        // Only move if ball is heading downward and below a certain threshold
        if (ballVY < 0 && ballY < 0.2) {
            // Predict where ball will be when it reaches paddle level
            const timeToReachPaddle = (ballY - paddleY) / ballVY
            const predictedBallX = this.runtimeState.ballX + (this.runtimeState.ballVX * timeToReachPaddle)

            // Account for wall bounces in prediction
            let targetX = predictedBallX
            if (predictedBallX < -1.0) {
                targetX = -2.0 - predictedBallX // Bounce off left wall
            } else if (predictedBallX > 1.0) {
                targetX = 2.0 - predictedBallX // Bounce off right wall
            }

            const distance = targetX - paddleX
            const deadZone = 0.1 // Don't move if close enough

            // Use proportional movement - faster when far, slower when close
            if (Math.abs(distance) > deadZone) {
                const maxSpeed = this.values.paddleSpeed * 2.0
                const minSpeed = this.values.paddleSpeed * 0.3

                // Scale speed based on distance - further away = faster movement
                const speedFactor = Math.min(Math.abs(distance) / 0.5, 1.0)
                const moveSpeed = minSpeed + (maxSpeed - minSpeed) * speedFactor

                if (distance > 0 && paddleX < 1.0 - paddleHalfWidth) {
                    // Move right
                    this.runtimeState.paddleX = Math.min(paddleX + moveSpeed, 1.0 - paddleHalfWidth)
                } else if (distance < 0 && paddleX > -1.0 + paddleHalfWidth) {
                    // Move left
                    this.runtimeState.paddleX = Math.max(paddleX - moveSpeed, -1.0 + paddleHalfWidth)
                }
            }
        }
    },

    _checkBrickCollisions() {
        const ballRadius = 0.02
        
        for (let i = 0; i < 48; i++) {
            if (this.runtimeState.bricks[i] === 0) continue
            
            const row = Math.floor(i / 8)
            const col = i % 8
            const brickX = -0.875 + col * 0.25
            const brickY = 0.8 - row * 0.15
            
            // Simple AABB collision
            if (this.runtimeState.ballX + ballRadius > brickX - 0.1 &&
                this.runtimeState.ballX - ballRadius < brickX + 0.1 &&
                this.runtimeState.ballY + ballRadius > brickY - 0.05 &&
                this.runtimeState.ballY - ballRadius < brickY + 0.05) {
                
                // Remove brick
                this.runtimeState.bricks[i] = 0
                this.runtimeState.bricksLeft--
                this.runtimeState.score += 10
                
                // Bounce ball
                this.runtimeState.ballVY = -this.runtimeState.ballVY
                
                this.triggerAction('brickBroken')
                break
            }
        }
    },

    _updateUI() {
        this.elements.scoreDisplay.textContent = `Score: ${this.runtimeState.score}`
        this.elements.bricksDisplay.textContent = `Bricks: ${this.runtimeState.bricksLeft}`
    },

    _initCanvas() {
        // Create offscreen canvas for game rendering
        this.runtimeState.gameCanvas = document.createElement('canvas')
        this.runtimeState.gameCanvas.width = 300
        this.runtimeState.gameCanvas.height = 300
        this.runtimeState.gameCtx = this.runtimeState.gameCanvas.getContext('2d')
        
        // Copy to display canvas
        this._renderToDisplayCanvas()
    },

    _renderGame() {
        const canvas = this.runtimeState.gameCanvas
        const ctx = this.runtimeState.gameCtx
        
        // Clear canvas
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#ffffff'
        
        const centerX = canvas.width / 2
        const centerY = canvas.height / 2
        const scale = canvas.width / 2 // Scale from [-1,1] to canvas size
        
        // Draw ball
        const ballX = centerX + this.runtimeState.ballX * scale
        const ballY = centerY - this.runtimeState.ballY * scale // Flip Y
        ctx.beginPath()
        ctx.arc(ballX, ballY, 0.02 * scale, 0, Math.PI * 2)
        ctx.fill()
        
        // Draw paddle
        const paddleX = centerX + this.runtimeState.paddleX * scale
        const paddleY = centerY - (-0.85) * scale // Flip Y
        const paddleW = this.runtimeState.paddleWidth * scale
        ctx.fillRect(paddleX - paddleW/2, paddleY - 3, paddleW, 6)
        
        // Draw bricks
        for (let i = 0; i < 48; i++) {
            if (this.runtimeState.bricks[i] === 0) continue
            
            const row = Math.floor(i / 8)
            const col = i % 8
            const brickWorldX = -0.875 + col * 0.25
            const brickWorldY = 0.8 - row * 0.15
            
            const brickX = centerX + brickWorldX * scale
            const brickY = centerY - brickWorldY * scale // Flip Y
            
            ctx.fillRect(brickX - 0.1 * scale, brickY - 0.05 * scale, 0.2 * scale, 0.1 * scale)
        }
        
        // Copy to display canvas
        this._renderToDisplayCanvas()
    },

    _renderToDisplayCanvas() {
        if (!this.elements.gameCanvas || !this.runtimeState.gameCanvas) return
        
        const displayCtx = this.elements.gameCanvas.getContext('2d')
        displayCtx.drawImage(this.runtimeState.gameCanvas, 0, 0)
    }
})