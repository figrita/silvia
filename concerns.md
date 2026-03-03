# 0.7-beta Code Concerns

Tracked issues from pre-ship code review. Ordered by priority within each section.

---

## Critical Bugs (pre-ship blockers)

**C1. Audio source type set before async, not reset on `_loadAudioFile` failure**
`mainInput.js` — `setAudioSource()` sets `this.audioSourceType = type` at the top, before the async work. If `_loadAudioFile` rejects, the exception propagates but `audioSourceType` stays `'audio'` while `audioAnalyzer` is `null`. `_startMic` correctly resets to `'none'` in its catch; `_loadAudioFile` doesn't.
Fix: wrap the switch body in try/catch, reset `this.audioSourceType = 'none'` on any failure.

**C2. Preview stream leak on channel reassignment**
`mainMixerUI.js` — `_updateChannelPreview` clears `previewElement.innerHTML = ''` to replace the old preview. This removes the `<video>` from the DOM but does NOT stop its `captureStream`. The `_previewStream` ref is on the now-detached element, so `destroy()`'s `querySelectorAll` misses it. Every channel reassignment leaks a live canvas capture stream.
Fix: before clearing `innerHTML`, stop existing stream tracks. Better: never replace the video element — swap `srcObject` instead.

**C3. Node duplication copies all workspace visibility instead of current workspace only**
`snode.js:653` — `duplicate()` passes `workspaceVisibility: [...this.workspaceVisibility]`. If a node is on 3 workspaces, its duplicate is also on all 3. Expected: duplicate appears only on the active workspace.
Fix: `workspaceVisibility: [WorkspaceManager.activeWorkspaceId]`

**C4. Workspace deletion orphans nodes**
`workspaceManager.js:88` — `delete(id)` removes the workspace from the Map but never updates `node.workspaceVisibility` on any SNode. Nodes only on the deleted workspace become invisible and unreachable but remain in `SNode.nodes`, consuming memory and being serialized into saves.
Fix: before deleting, remove the ID from each node's visibility set; destroy nodes whose set becomes empty.

**C5. `deserializeWorkspace` and `loadPatchAsNewWorkspace` mutate `patchData.nodes` in-place**
`load.js:797`, `load.js:273` — both do `nodeData.workspaceVisibility = ...` directly on the input objects before passing to `createNodesAndConnections`. The input data is permanently mutated.
Fix: deep-copy `patchData.nodes` before remapping.

**C6. `SNode.currentWorkspace` setter doesn't call `updateVisibility()`**
`snode.js:21-23` — the compatibility setter calls `WorkspaceManager.setActive(value)` but not `SNode.updateVisibility()`. `setCurrentWorkspace()` calls both. Old callers using the setter get broken visibility with no error.
Fix: call `SNode.updateVisibility()` in the setter, or remove the setter and force callers to use `setCurrentWorkspace`.

---

## High Priority

**H1. `_updateProjectorStream` is dead code**
`mainMixer.js:268` — never called; `reconnectProjector()` is what's used. Contains a latent cross-origin `window.parent.frames` access.
Fix: delete `_updateProjectorStream`.

**H2. `captureStream(60)` unconditional 60fps GPU cost**
`mainMixer.js:264` — forces 60fps frame capture from the WebGL canvas regardless of render frequency. Should be `captureStream(0)` (manual, frame pushed on `gl.flush()`) or match the configured render rate.

**H3. `buildWorkspaceIdMap` reuses existing workspace IDs on load without clear**
`load.js:858` — if a saved workspace ID matches an existing session workspace ID, it silently reuses it, mixing old and new nodes. Should always create fresh workspaces and remap.

**H4. Aspect ratio baked as literal in genCode instead of being dynamic — FIXED**
`video.js`, `screencapture.js`, `nodes/maininput.js`, `imagegif.js`, `drawingcanvas.js` — resolved by using `textureSize(sampler, 0)` in GLSL to derive aspect from the uploaded texture dimensions each frame. Eliminated all `refreshDownstreamOutputs` calls that existed solely to propagate aspect changes. Also fixed a latent bug in `drawingcanvas.js` where aspect was never updated after initial compile.

---

## Medium Priority

**M1. Dither node "Blue Noise" option is actually hash/white noise**
`nodes/dither.js:972` — uses `sin(dot(...))` hash which has white noise spectral characteristics. Real blue noise suppresses low frequencies for visually pleasant dithering. Mislabeled.
Fix: rename to "Hash Noise" or "Pseudo-random".

**M2. `samplingCost` inconsistent types across nodes**
`nodes/bloom.js`, `nodes/sharpen.js`, `nodes/sincfilter.js` — some use integers (`81`, `34`), some use strings (`'5-317'`). The tooltip interpolates the value directly; both work but types should be consistent.
Fix: use strings throughout for range support.

**M3. `previewVideo.innerHTML = '<span>...'` on a `<video>` element is a no-op**
`mainMixerUI.js:245` — setting `innerHTML` on a video element doesn't display fallback content in any real browser.
Fix: replace the video element with a div in the error case, or use a sibling placeholder element.

**M4. `mainInput.destroy()` never registered as page unload handler**
`mainInput.js:533` — `destroy()` properly stops streams and releases AudioContext but nothing calls it on page close. Active webcam/mic/screen-capture streams leak.
Fix: `window.addEventListener('beforeunload', () => mainInput.destroy())`

**M5. Debug `console.log` calls throughout mainMixer**
`mainMixer.js:50,61,72,79,84,98` — `'Main Mixer initialized'`, `'Channel A assigned: [node]'`, `'Main mixer cleared to black'` etc. fire on every assignment. Log holding object references can also keep DevTools memory alive.
Fix: remove before ship.

**M6. Cross-workspace animation tags use hardcoded 200ms fallback**
`connections.js` in `updateCrossWorkspaceTags()` — `setTimeout(..., 200)` assumes CSS animation finishes in 200ms.
Fix: use `animationend` event with `setTimeout` only as a fallback for off-screen elements.

**M7. `updateCrossWorkspaceTags()` implicitly depends on `redrawAllConnections()` having run first**
`connections.js` — reads `connection._sourceVisible` / `connection._destVisible` flags set only during `redrawAllConnections`. Stale if called independently.
Fix: compute visibility inline, or merge into one method.

**M8. `loadPatchAsNewWorkspace` continues rendering on full node-creation failure**
`load.js:714-733` — marks dirty and renders tab bar even if every node failed to load. No check that any content was actually created.
Fix: if `nodeMap.size === 0` after `createNodesAndConnections`, report a distinct failure.

**M9. Bloom shader uses hardcoded 16 angle iterations regardless of radius**
`nodes/bloom.js:850` — original loop iterated proportionally; new `for(int i = 0; i < 16; i++)` uses exactly 16 at every radius. Small radii oversample, large radii may show banding. `samplingCost: 81` annotation also appears inaccurate (16×5=80).

---

## Design / Opportunity Cost

**D1. Channel assignment workspace ID cached at click time, not derived dynamically**
`mainMixer.js:56` — records `WorkspaceManager.getActiveWorkspace()?.id` when user clicks "Assign to A/B". If the output node later moves workspace, the mixer shows the wrong workspace name.
Fix: derive workspace ID from the output node's `workspaceVisibility` at render time.

**D2. Multiple Main Input proxy nodes each upload the same canvas texture every frame**
`nodes/maininput.js` — N instances each call `texImage2D` with the same canvas per frame. Should upload once to a shared texture; all proxy nodes sample from it.

**D3. WorkspaceManager numeric IDs can collide with saved patch IDs on partial restore**
`workspaceManager.js:15` — `nextId` starts at 1. `buildWorkspaceIdMap` reuses existing workspace IDs when they match saved IDs, which can mix nodes from different sessions silently on the `shouldClearWorkspace = false` path.
