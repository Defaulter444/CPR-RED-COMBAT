# REDLINE COMBAT 0.3.0 — Blackglass Dock verification scope

Date: 2026-10-16. Environment: isolated disposable deadline-test world, Foundry VTT 12.331 / Cyberpunk RED Core v0.92.4, loopback port 30001. Night City UI 0.3.4 compatibility layer. Production campaigns were not changed.

## Current interface

The dock has three areas: actor portrait, HP and armor; selected equipped weapon, item image, mode and ammunition; target, primary Attack and secondary actions. One native control collapses it to 57 px. Expansion is a persistent client setting (`dockExpanded`). Selected weapon is remembered per actor only for the current page session and resets on reload; it does not alter equipment. Skills open in a scrollable panel above the dock. When the queue leaves too little room above the dock, Skills temporarily overlays the dock area while remaining clear of the queue and macros. Insets are computed from the actual sidebar, controls, hotbar and navigation rectangles. A visible DEADLINE timer also reserves vertical space above the queue. The HUD retains its own header when Night City UI is disabled.

The native action adapter and permission checks remain in place. Actor and item images are read from their Documents. Special portrait, weapon and scene artwork used for this isolated QA world is test data and is not included in the module archive.

## Confirmed live scope for 0.3.0

- Reviewed the new interface at 1672 × 941, 1280 × 720 and 1024 × 768.
- At 1024 × 768, the dock measured x=62, y=383, width=640, height=275, ending at y=658; hotbar top was y=668. Queue bottom was y=150. The skills panel ran from y=163 to y=376 with a height of 213 and scrollHeight 309, leaving 13 px below the queue.
- At 1280 × 720, the dock measured x=62, width=896, height=191, ending at y=656; hotbar top was y=666. The skills panel ran from y=156 to y=458, below queue bottom y=140. The dock and skills remained inside the available canvas area.
- DEADLINE avoidance at 1672 × 941: collapsed timer bottom y=112, queue top y=124; expanded timer bottom y=223.72, queue top y=236. Pausing the timer removed its HUD and restored queue top y=60.
- With the expanded timer at 1024 × 768, the queue occupied y=236…326 and the dock y=383…658. The ordinary gap above the dock was only 37 px. Skills used the temporary dock overlay instead: y=345.22…657, height=311.78 with max-height 320, leaving about 19 px below the queue and clearing the hotbar at y=668. It remained scrollable and closed with Escape.
- Escape closed Skills and restored focus to its opening `toggle-skills` button.
- Gamemaster: ordinary attack discharged ammunition 6 → 5 exactly once and produced the native attack card. Evasion Workflow defense produced 16 against attack 9.
- Cancelling the native attack dialog preserved ammunition.
- Athletics produced a native skill result of 15.
- Player: the native attack dialog opened; cancelling preserved 5/8 ammunition. Another NPC's queue control and Next Turn were disabled.
- Night City UI did not inject its old collapse control into the marked Blackglass root. Disabling the common interface left REDLINE's own header and layout available; Alt + N restored Night City UI.
- Night City UI's common theme was switched off and on during the final GM check; the final state was `ncu-theme=true`.
- The timer was restored to its initial ready state with its display collapsed after the timer-placement checks.

This document records the tested live and automated scope. The [visual comparison against the selected concept](https://github.com/Defaulter444/CPR-RED-COMBAT/blob/main/design-qa.md) is maintained separately; no design comparison result is asserted here. Sidebar collapse was not confirmed live: its control did not change the measured bounds in this test. The dynamic-inset calculations are covered by automated tests. Historical results below concern the old card.

## Automated scope for 0.3.0

93 REDLINE tests and 59 Night City UI tests passed. The current tests cover action behavior, state projection, selected weapon presentation, geometry, DEADLINE avoidance and skill-popup placement including the limited-height overlay, alongside the compatibility guards preventing old Night City UI CSS, classes and controls from adapting the new dock. Public API `open`, `close`, `toggle`, `refresh` and `getState` remains; `openDemo` and the tutorial UI remain absent.

Limits: the action adapter targets CPR 0.92.4. Additional weapon modes, reloading and initiative retain prior implementation and automated coverage; the historical scenarios below are not represented as fresh live reruns. REDLINE itself adds no automatic target damage, remote defense workflow or NET automation. Other modules may separately handle defense and damage in the test world. Cross-client simultaneous actions follow native Foundry/CPR behavior. No production rollout is claimed by this QA record.

---

# Previous release: REDLINE COMBAT 0.2.1 verification status

The 0.2.1 update passed 77 automated tests, JavaScript/Python syntax checks, API smoke checks and an archive-content check. The installable package contains 11 production files; the tutorial button, application, API, template and prototype assets have been removed. Character action logic, state projection, permission checks and production action styles remain unchanged.

Live 0.2.1 verification: 2026-10-16, isolated deadline-test, Foundry 12.331 / CPR v0.92.4, GM and Player at 1280 × 720. The tutorial entry was absent, the initiative queue rendered for both clients, and Player's selected character card expanded to show real weapon, ammunition and skill actions. The production action source is unchanged. The broader combat report below is preserved evidence for **REDLINE 0.2.0 / Night City UI 0.3.1**, not a full rerun for 0.2.1. Production campaigns were not changed.

# Previous release: Blackglass character actions QA

Date: 2026-10-16. Night City UI 0.3.1 with REDLINE COMBAT 0.2.0.
Result: passed for the tested scope below; release candidate verified before publication.

Environment: licensed Foundry VTT 12.331, Cyberpunk RED Core v0.92.4, isolated disposable deadline-test world, loopback port 30001. No production campaign was changed. An offline snapshot of the test world and module backups were taken before installation.

## Visual scope

Actual browser review at 1440 × 900 and 1024 × 768. Blackglass retained. Compact card 80 px high; expanded actions request 340 px and are limited by available space. At 1024 × 768 the expanded card measured 638 × 276 px, ending at y=658; hotbar starts at y=668. No page horizontal overflow. Weapons and skills are reachable through vertical scrolling. The collapse control remains reachable at the bottom of the scroll and was used successfully at both widths.

Evidence: five real screenshots in the separate night-city-character-actions deliverable. No generated mockup is used as runtime evidence. The map is a separate test-scene asset and is not bundled.

## Live functional scope

Tested as Player owning «Тест — Ви», then returned to Gamemaster:

- Cancelling an attack preserves ammunition; ordinary rifle attack 9 → 8, native chat card produced.
- Autofire disabled below 10 rounds with an explanatory tooltip.
- Reload with zero reserve does not create ammunition. For this test only, native inventory reserve set to 40. Reload filled 8 → 25 and reserve became 23, verified in native ammunition chooser.
- Autofire 25 → 15. Native autofire damage card 2d6 × 1 produced 8, without another ammunition charge or HP change.
- Evasion and Athletics opened native modifier dialogs and produced native skill cards. Athletics remained selected after refresh, roll and initiative.
- Initiative rolled 8 and updated native combat order, while keeping the current combatant unchanged.
- Aimed attack opened native hit-location dialog; cancelling preserved the magazine. Suppressive mode disables separate damage.
- Player cannot select other actors for control or advance the turn. Death save disabled while HP > 0.
- Final UI: rifle 15/25, pistol 6/8, HP unchanged at 10/40. Native browser error log empty in final player/GM checks.

## Automated checks and limits

REDLINE: 76 passing tests (actions, view, state projection). Night City UI: 29 passing tests. Zero failures or skips. Node syntax checks passed for all 9 scripts. Filesystem isolation audit passed for scratch runtime/data roots, world, port and runtime version.

Integration uses public CPR factories, modifier dialogs, item ammunition methods and chat rendering. Ranged attack awaits dischargeItem exactly once because CPR 0.92.4 confirmRoll does not await that write. No system files or global prototypes were patched. Selection/permission/item validation repeats after a roll dialog; local busy guard prevents duplicate clicks.

Limits: this exact build targets CPR 0.92.4. Death-save success and melee branches are covered with unit fixtures, not an additional live injury/melee scenario. Cross-client simultaneous edits follow native Foundry/CPR behavior; no transactions or remote defense requests are added. Native ammo selection owns its dialog and stays attached to the original weapon. Mobile layouts below 1024 px and arbitrary third-party combinations are not claimed. This QA pass did not include a production rollout. Release metadata and distribution files are handled separately.
