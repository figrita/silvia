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

~~**M1. Dither node "Blue Noise" option is actually hash/white noise**~~ ✅ Fixed — renamed to "Hash Noise" in UI and comment.

~~**M2. `samplingCost` inconsistent types across nodes**~~ ✅ Fixed — converted all integer `samplingCost` values to strings across 8 node files.

~~**M3. `previewVideo.innerHTML = '<span>...'` on a `<video>` element is a no-op**~~ ✅ Fixed — replaced with `replaceWith()` to swap the video element for a span placeholder.

~~**M4. `mainInput.destroy()` never registered as page unload handler**~~ Won't fix — browser tears down all MediaStreams and AudioContexts automatically on page unload; explicit cleanup is unnecessary.

~~**M5. Debug `console.log` calls throughout codebase**~~ ✅ Fixed — removed all `console.log` calls across 18 files. Kept `console.warn`/`console.error` for genuine error paths.

~~**M6. Cross-workspace animation tags use hardcoded 200ms fallback**~~ Won't fix — code already uses `animationend` as primary with `setTimeout(200)` as fallback for off-screen elements where `animationend` won't fire. Animation is 150ms; 200ms margin is correct.

~~**M7. `updateCrossWorkspaceTags()` implicitly depends on `redrawAllConnections()` having run first**~~ Won't fix — `updateCrossWorkspaceTags` is only called from within `redrawAllConnections` (never independently), so the dependency is always satisfied.

~~**M8. `loadPatchAsNewWorkspace` continues rendering on full node-creation failure**~~ ✅ Fixed — if `nodeMap.size === 0` after `createNodesAndConnections`, deletes the empty workspace and alerts instead of proceeding.

~~**M9. Bloom shader uses hardcoded 16 angle iterations regardless of radius**~~ Won't fix — concern was written against an older version. Current code uses 8 angles × 3 radius steps = 24 offset samples + 1 original = 25 total. `samplingCost: '25'` is accurate. Radius step scales proportionally (`radius/3.0`), so the pattern adapts to radius size.

---

## Design / Opportunity Cost

~~**D1. Channel assignment workspace ID cached at click time, not derived dynamically**~~ ✅ Fixed — removed cached `channelAWorkspaceId`/`channelBWorkspaceId` from MainMixer; UI derives workspace ID from the node's `workspaceVisibility` and refreshes on `workspace-switched` and `workspace-visibility-changed` events. Cross-workspace tags also update their labels on `redrawAllConnections` (e.g. after rename).

~~**D2. Multiple Main Input proxy nodes each upload the same canvas texture every frame**~~ ✅ Fixed — `MainInputManager.uploadSharedTexture()` uploads once per GL context per frame via `_sharedTextureCache` WeakMap.

~~**D3. WorkspaceManager numeric IDs can collide with saved patch IDs on partial restore**~~ ✅ Fixed — same root cause as H3; `buildWorkspaceIdMap` now always creates fresh workspaces, so ID collisions are harmlessly remapped.
