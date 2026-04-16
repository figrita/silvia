# Offline Rendering

Offline mode renders frame-by-frame at arbitrary FPS and resolution, producing lossless PNG sequences. Every frame gets as long as it needs — no realtime deadline.

## Architecture

The **Offline Output** node (`offlineoutput`) owns the render loop. It compiles the upstream shader graph, then steps through virtual time frame-by-frame, calling `renderer.render(virtualTime, ...)` with blocking `readPixels` after each frame.

Time flows to shaders via the existing `u_time` uniform — no global clock needed. CPU-side nodes (video, audio, sequencers) need explicit `_prepareForTime(virtualTime, fps)` methods to advance their state to the correct moment.

## Realtime-Only Boundary

Nodes with inherently non-deterministic outputs (gamepad, webcam, mic, mouse, screen capture, main input, realtime output frame) are tagged `offlineBlocked: true` on their output ports.

The connection system enforces this at the **graph level**, not just direct connections. A "tainted" set is computed: all nodes downstream of any `offlineBlocked` port. Connecting a tainted node into an offline output graph is blocked in the UI — ports dim and become unclickable, identical to DAG cycle prevention.

## Phases

### Phase 1: Realtime-Only Boundary (done)
- `offlineBlocked: true` on output ports of gamepad, mouseinput, webcam, screencapture, micline, maininput, output
- Graph-level taint propagation in `managePortVisibility()`
- Dashed ring CSS indicator on offline-blocked ports
- Port DOM class `offline-blocked` added in snode.js

### Phase 2: Offline Output Node — static shaders (done)
- `offlineoutput.js` — resolution (up to 4K), FPS, duration, warm-up frames
- Frame-by-frame render loop with fence clearing and blocking readPixels
- PNG export: Electron (directory picker + IPC), web File System Access API, web zip fallback
- Warm-up modes: black, hold first frame, run sequence
- Progress bar with ETA, preview canvas, cancel button

### Phase 2.1: Unify realtime and offline into single-clock architecture (future)
The offline work proves that a single clock driving all nodes in topological order is correct. The realtime path currently has ~14 independent rAF loops, each calling performance.now() separately. This causes jitter, drift between audio analysis and rendering, and wasted scheduling overhead.

**The refactor:** the main `renderLoop` in main.js becomes the sole rAF. Each frame it calls `_prepareForTime(time, 1/dt)` on every node in topological order (the same method offline uses), then renders. Per-node rAF loops are removed entirely.

**Kill list:**
- `_startCanvasRenderLoop` on video — main loop calls `_drawVideoToCanvas`
- `_startUiUpdateLoop` on video/audioanalyzer/micline — meters update in `_prepareForTime`
- `_tick` rAF on smoothcounter
- `_run` rAF on stepsequencer, euclideanrhythm, bpmclock
- `_updateLoop` rAF on randomfire
- `RealtimeGraph.startAnimation` on ADSR/animation/oscillator/automation
- AudioAnalyzer's internal rAF — call `#analyze()` from the main loop
- XY pad's animate loop

**Keep:** main `renderLoop` (single rAF), all `_prepareForTime` methods, PhaseAccumulator.advanceByDt, ADSR `_now()` pattern.

### Phase 3: Video Node Offline Support (done)
- `_prepareForTime(t)` on video node — seek to `t % duration`, wait for `seeked`, draw to canvas
- `_suspendRealtimeLoops()` / `_resumeRealtimeLoops()` on video and audioanalyzer nodes
- Offline output discovers upstream nodes via graph traversal (topological order, sources first)
- try/finally ensures realtime loops resume even on cancel or error
- Audio analyzer gets suspend/resume stubs (actual offline FFT is Phase 4)

### Phase 4: Offline Audio Analysis (done)
- `OfflineAudioAnalyzer` class in `offlineAudioAnalyzer.js`:
  - Decodes full audio via `fetch` + `AudioContext.decodeAudioData`
  - Radix-2 Cooley-Tukey FFT with Hann windowing (fftSize=512)
  - Byte frequency data conversion matching AnalyserNode dB mapping [-100, -30] → [0, 255]
  - Temporal smoothing matching `smoothingTimeConstant=0.3`
  - Band extraction (log-weighted average, power curve) identical to AudioAnalyzer
  - Exciter (rolling median, tanh expansion, EMA smoothing) identical to AudioAnalyzer
  - `reset()` for clean state at render start, `analyzeAtTime(t)` for sequential frames
- audioanalyzer node: lazy `_prepareForTime` creates OfflineAudioAnalyzer, writes results to realtime analyzer's public state
- video node: `_prepareForTime` extended with offline audio analysis alongside video seeking
- Both nodes clean up offline analyzer in `_resumeRealtimeLoops`

### Phase 5: Timing Node Determinism (done)
All timing-driven nodes now support offline rendering via `_prepareForTime` / `_suspendRealtimeLoops` / `_resumeRealtimeLoops`:
- **Step Sequencer + Euclidean Rhythm**: compute step from absolute step count, iterate through ALL intermediate steps between frames to prevent skipping at high BPM / low FPS
- **BPM Clock**: compute beat from virtual time + subdivision, iterate through all skipped beats
- **Random Fire**: accumulate virtual dt, fire when threshold crossed
- **ADSR Envelope**: `_now()` helper returns virtual time or `performance.now()`, gate timestamps use it. State fully reset on suspend to prevent stale realtime timestamps corrupting offline values
- **Animation + Oscillator**: PhaseAccumulator.advanceByDt(1/fps, speed) bypasses realtime clock. Phase reset on suspend for clean offline start
- **Automation**: same PhaseAccumulator offline advancement
- **Smooth Counter**: extracted `_advanceSmoothing(dt)` from `_tick`, called with `1/fps` offline
- **XY Pad**: `_step(overrideDt)` accepts explicit dt for physics simulation
- **PhaseAccumulator**: new `advanceByDt(dt, speed)` method for offline phase advancement
- **Force-start**: all nodes with isRunning state are force-started on suspend and restored on resume — no manual Start click needed before offline render
- **Threshold debounce fix**: threshold state reset on suspend so lastTriggerTime (in performance.now() space) doesn't block triggers in virtual time space
- **Graph visualization**: ADSR, animation, oscillator, automation graphs update live during offline render via updateValue() + draw() in _prepareForTime

### Phase 6: Polish
- Supersampling option (render at Nx, downsample before save)
- Frame history warm-up count exposed in UI
- Memory pressure management for long web-mode renders
- Loop point handling for media shorter than clip duration
