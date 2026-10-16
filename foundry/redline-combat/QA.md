# REDLINE COMBAT 0.2.1 verification status

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
