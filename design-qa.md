# Blackglass Dock design QA — REDLINE COMBAT 0.3.0

Date: 2026-10-16. Implementation in the existing Foundry module; no standalone replacement of Foundry or the CPR system.

## Visual truth and evidence

- Selected visual truth: `docs/blackglass/reference.png`, the first displayed concept, Blackglass Dock. Original delivery: `outputs/redline-design-concepts/01-blackglass-dock.png` in the parent workspace.
- Browser implementation: `docs/blackglass/desktop-final.png`, isolated `deadline-test` world at loopback port 30001, Foundry 12.331 / Cyberpunk RED Core 0.92.4, REDLINE 0.3.0 / Night City UI 0.3.4.
- Source and implementation both measure **1672 × 941 pixels**, with a **1672 × 941 CSS viewport**, at 1× screenshot density. No raster resampling or image reconstruction was used. The comparison page scales both full views by the same factor; its focused dock crops preserve their original pixels.
- Combined inputs: `docs/blackglass/comparison.png` (full views together) and `docs/blackglass/comparison-detail.png` (both dock regions together at their original scale). The local `comparison.html` in the delivery contains full views, focused regions and the responsive before/after evidence. Final QA used two viewport captures because the browser rejected a full-page capture; both required views were successfully captured and inspected. `timer-comparison.png` shows the two final timer interaction states together.
- Same primary state: round 3, own character selected, expanded dock, heavy pistol, visible guard target, HP 28/40 and tracked head/body SP 11. The implementation shows actual QA names and Actor/Item images. Its magazine is **5/8 after the verified shot**; the concept's fictional magazine is 6/8. Native sidebar is 300 px rather than the concept's approximately 400 px. Map zoom, token art, chat history and native token HUD are real test-world state.

## Findings and comparison history

1. **[P2, fixed] Skills overlapped initiative at 1024 × 768.** Before: popup y64–376, initiative y60–150 (`skills-1024-before.png`). Fixed `skillPopupHeight`, `main.js` geometry and `host.css` to restrict disclosure height to the actual map gap, with internal scrolling. After: popup y163–376, height 213, scroll content 309 px; queue ends at y150 and dock begins at y383 (`skills-1024.png`). Escape restores focus to the Skills button. The combined comparison contains both captures.
2. **[P1, fixed] Active DEADLINE could overlap the new initiative strip.** Before-fix DOM measurements at 1672 × 941: timer x1052, y58, 300 × 54 and queue x62, y60, 1288 × 80, overlapping by 52 px. Fixed `safeInsets` and chrome observers to reserve a visible intersecting timer without writing its position. Final browser evidence `timer-after.png` / `timer-comparison.png`: collapsed timer ends at y112, queue begins at y124; expanded timer ends at y223.72, queue begins at y236. Pausing removes the timer and returns the queue to y60. Mount, unmount and collapse were exercised live.
3. **[P2, fixed] Reserving an expanded timer left only 37 px for Skills at 1024 × 768.** DOM measurement: queue ended at y326 and dock began at y383. `skillPopupLayout` now uses a temporary drawer over the dock when the upper gap is below 180 px, preserving both the queue and macros. Final `timer-expanded-1024.png` / `timer-comparison.png`: popup y345.22–657, actual height 311.78 (available maximum 320), with every command visible and about 19 px below the queue. Escape closes it. The timer was restored to ready/collapsed after testing.

## Required fidelity surfaces

- **Fonts and typography:** Arial/sans-serif UI with monospace resource numerals preserves the source's sans hierarchy. Actor name is 23 px bold, HP 38 px, primary action 18 px, secondary actions 12 px. The image has no authoritative font metadata; it was not treated as proof of an exact proprietary face. Long document names truncate in compact cards and native selects retain full option text and accessible names. No broken wrapping in the three tested desktop sizes.
- **Spacing and layout rhythm:** Three distinct regions, slim initiative queue, portrait at the left and a red primary action at the right match the chosen composition. Desktop dock: x62, y682, 1288 × 195; macro bar begins at y887, leaving 10 px. The reference dock is roughly x66, y675, 1194 × 205. The width difference follows Foundry's real sidebar and the height remains close to the concept. At 1280 × 720 the dock is 896 × 191, bottom 656, hotbar top 666. At 1024 × 768 it becomes two rows, 640 × 275, bottom 658, hotbar top 668. The full and focused combined views were used to judge these differences.
- **Colors/tokens:** Near-black glass (`#0b1116f5`), grey dividers, cyan resources (`#5bd8e9`), crimson primary attack and yellow initiative accents preserve the chosen palette. Focus uses a cyan outline, unavailable actions remain visibly disabled, and status messages use semantic text alongside color.
- **Image quality and fidelity:** Actual portrait and weapon raster assets are displayed cleanly with `object-fit: cover` / `contain`. The QA portrait and pistol were separately generated in the chosen art direction; they are test-world assets, not mandatory module artwork. Native Foundry token icons remain the token images stored in the scene. Font Awesome supplies UI icons; no custom SVG/CSS drawing replaces the portrait, weapon or map.
- **Copy/content:** «Атака», «Урон», «Перезарядить», «Навыки», «Лист» retain the source's short command vocabulary. Additional weapon/ammo labels describe real system data. Missing resources remain unavailable, rather than fabricated. QA prefixes in document names are test data. No implementation instructions or tutorial prose were added to the play flow.

Independent visual review of the initial combined input found no additional P0/P1/P2 mismatch in typography, spacing, colors, images, copy or icons. The final full-view and focused comparison were recaptured after the timer fixes and inspected again. No actionable P0/P1/P2 remains in the tested scope.

## Functional and accessibility checks

GM and Player browser sessions used the real system dialogs and chat. A confirmed pistol attack consumed 6 → 5 exactly once and produced the native attack card; Evasion Workflow defense 16 versus attack 9 negated it. Athletics produced a native 15. Cancelling a player attack preserved 5/8 ammunition. Player NPC selection and Next Turn remained disabled. Selection of another owned subject retains that subject's own weapon choice during the current page session; collapsed state survives page reload. Weapon choice itself is intentionally session-local.

Own expand/collapse, upward Skills disclosure and constrained-height drawer, Escape and return of focus, outside click followed by Attack on the first click, NCU disable/re-enable, common theme off/on and standalone REDLINE header were checked. Final GM and Player browser error logs were empty. **93 REDLINE tests and 59 Night City UI tests passed**. Hidden target images, ownership loss, item replacement, stale revisions and duplicate commands remain covered by automated tests; `actions.js` and `capabilities.js` are unchanged. Live sidebar-collapse behavior is not claimed. Mobile widths below 1024 px, arbitrary third-party combinations and live death-save success were not tested.

## Follow-up polish (P3)

- Head/body armor uses denser text than the concept. Separate native icons or a slightly larger gap can be considered after user feedback.
- The empty actor card remains the same short prompt when toggled; it has no character actions to reveal.

## Implementation checklist

- [x] Resolve first displayed concept and inspect actual module alongside it.
- [x] Preserve native actions, permission boundaries and document imagery.
- [x] Test expanded, compact, skills and Player states at the stated sizes.
- [x] Fix responsive skills overlap and capture the revised state.
- [x] Verify active timer avoidance, removal and browser error logs in the final build.
- [x] Inspect final full-view, focused and constrained-height interaction captures together.
- [x] Complete visual QA with no remaining P0/P1/P2.

final result: passed
