# 0.7-beta Code Concerns

Tracked issues from pre-ship code review. Ordered by priority within each section.

---

## Critical Bugs (pre-ship blockers)

~~**C1. Audio source type set before async, not reset on `_loadAudioFile` failure**~~ ✅ Fixed — try/catch in `setAudioSource()` resets `audioSourceType = 'none'` on any failure.

~~**C2. Preview stream leak on channel reassignment**~~ ✅ Fixed — `_stopPreviewStream()` helper stops tracks before clearing innerHTML.

~~**C3. Node duplication copies all workspace visibility instead of current workspace only**~~ ✅ Fixed — `duplicate()` now uses `[WorkspaceManager.activeWorkspaceId]`.

~~**C4. Workspace deletion orphans nodes**~~ ✅ Fixed — `WorkspaceManager.delete()` now calls `_onBeforeDelete` callback (registered by snode.js) to clean up node visibility and destroy orphans.

~~**C5. `deserializeWorkspace` and `loadPatchAsNewWorkspace` mutate `patchData.nodes` in-place**~~ ✅ Fixed — both functions now shallow-copy nodes before remapping workspace visibility.

~~**C6. `SNode.currentWorkspace` setter doesn't call `updateVisibility()`**~~ ✅ Fixed — removed dead getter/setter entirely (no callers found).

---

## High Priority

~~**H1. `_updateProjectorStream` is dead code**~~ ✅ Fixed — deleted the method (no callers).

~~**H2. `captureStream(60)` unconditional 60fps GPU cost**~~ ✅ Fixed — changed to `captureStream()` (no arg) which auto-captures on canvas change, matching actual render rate.

~~**H3. `buildWorkspaceIdMap` reuses existing workspace IDs on load without clear**~~ ✅ Fixed — removed the `WorkspaceManager.workspaces.has()` shortcut; always creates fresh workspaces with new IDs and remaps.

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

~~**D1. Channel assignment workspace ID cached at click time, not derived dynamically**~~ ✅ Fixed — removed cached `channelAWorkspaceId`/`channelBWorkspaceId` from MainMixer; UI derives workspace ID from the node's `workspaceVisibility` and refreshes on `workspace-switched` and `workspace-visibility-changed` events. Cross-workspace tags also update their labels on `redrawAllConnections` (e.g. after rename).

~~**D2. Multiple Main Input proxy nodes each upload the same canvas texture every frame**~~ ✅ Fixed — `MainInputManager.uploadSharedTexture()` uploads once per GL context per frame via `_sharedTextureCache` WeakMap.

~~**D3. WorkspaceManager numeric IDs can collide with saved patch IDs on partial restore**~~ ✅ Fixed — same root cause as H3; `buildWorkspaceIdMap` now always creates fresh workspaces, so ID collisions are harmlessly remapped.
