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

### Phase 5: Timing Node Determinism
- `_prepareForTime(t)` on step sequencer, BPM clock, clock divider, euclidean rhythm, random fire, ADSR envelope, smooth counter, automation
- PhaseAccumulator gets `setTime(t)` for direct phase positioning
- Action triggers fire at correct frame boundaries

### Phase 6: Polish
- Supersampling option (render at Nx, downsample before save)
- Frame history warm-up count exposed in UI
- Memory pressure management for long web-mode renders
- Loop point handling for media shorter than clip duration
