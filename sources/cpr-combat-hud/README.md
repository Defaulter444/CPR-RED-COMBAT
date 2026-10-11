# Cyberpunk RED - Combat HUD

![Foundry v12](https://img.shields.io/badge/Foundry-v12-informational)
![System](https://img.shields.io/badge/system-cyberpunk--red--core-e5233d)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

A persistent, always-on **combat HUD bar** for the **Cyberpunk RED - CORE** system on Foundry VTT **V12**.
Select a token (or assign a character to your user) and a sleek neon bar appears at the bottom of the screen with
everything you need in a fight - no more digging through the character sheet mid-turn.

> Unofficial, independent add-on. Not affiliated with R. Talsorian Games. Requires the
> [Cyberpunk RED - CORE](https://gitlab.com/cyberpunk-red-team/fvtt-cyberpunk-red-core) system.

## Installation

**In Foundry (recommended):**

1. Go to **Configuration and Setup → Add-on Modules → Install Module**.
2. Paste this **Manifest URL** into the field at the bottom:

   ```
   https://github.com/Vec97/cpr-combat-hud/releases/latest/download/module.json
   ```

3. Click **Install**, then enable **Cyberpunk RED - Combat HUD** in your world's module settings.

**Manual:** download `module.zip` from the [latest release](https://github.com/Vec97/cpr-combat-hud/releases/latest)
and extract it into your Foundry `Data/modules/cpr-combat-hud` folder.

## Features

- **Identity** - portrait (click to open the sheet), name, alias, roles, live wound state.
- **Hit points** - animated HP bar with -5 / -1 / +1 / +5 buttons and a direct-entry field; the colour shifts with the wound state.
- **Armor** - head/body SP and shield HP with one-click ablate/repair, kept in sync with the sheet via the system's tracked-armor logic.
- **Vitals** - Humanity, LUCK (spend/regain with one click), Death Save penalty (click = roll a Death Save, right-click = reset the penalty).
- **Stats** - all ten stats; one click rolls them through the system's roll dialog (Ctrl-click skips the dialog, exactly like the sheet).
- **Weapons** - every equipped weapon (including installed cyberware weapons and secondary-weapon upgrades) with damage, ROF and magazine, Attack/Damage buttons, reload, ammo swap, and fire-mode toggles (Aimed / Autofire / Suppressive) plus an aimed-location selector.
- **Skills** - searchable flyout grouped by category with the full `STAT + level + mods` total. Click to roll, right-click to open the item. Mark **favourites** with the star; they appear in an expandable row inside the bar for one-click access.
- **Role abilities** - flyout with every rollable role ability (main and sub-abilities, e.g. Combat Awareness, Medicine...).
- **Netrunning** - when a cyberdeck is equipped and a netrunning role is active, an Interface panel offers all nine interface abilities (Scanner, Backdoor, Cloak...).
- **Combat** - roll initiative, see your current initiative, and end your turn (highlighted when it is your turn).
- **Weapon management** - a gear panel to cycle owned/carried/equipped for all weapons and cyberdecks without opening the sheet.

All rolls use the system's own roll pipeline (`createRoll` → roll dialog → ammo consumption → chat card), so mods,
wound penalties, luck spending, critical injuries and targeting behave exactly as if rolled from the character sheet.

## Settings (per user)

- Enable/disable the HUD
- Fall back to the assigned character when no token is selected
- HUD scale and distance from the bottom of the screen
- Keybinding `H` collapses/expands the bar (rebindable under **Configure Controls**)

## Compatibility

- Foundry VTT **V12**
- Cyberpunk RED - CORE **v0.92.x**
- Actor types: characters and mooks

## Contributing / Issues

Bug reports and suggestions are welcome on the [issue tracker](https://github.com/Vec97/cpr-combat-hud/issues).

## License

[MIT](LICENSE) © 2026 Vec97
