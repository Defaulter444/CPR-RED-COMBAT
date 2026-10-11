/**
 * "Choose Target" mode for the Combat HUD.
 *
 * When enabled, clicking Attack first drops the user into a lightweight
 * targeting mode: the cursor gets a crosshair + a "Choose Target" label,
 * the next left-click on a token targets it (Foundry's normal targeting, so
 * the roll card and damage application key off it), and Esc / right-click /
 * clicking empty space cancels without rolling.
 */
import { MODULE_ID } from "./constants.js";

let active = false;

// Track the pointer at all times so the "Choose Target" label can be placed
// correctly on the very first frame, before any pointermove during the session.
const lastPointer = { x: 0, y: 0 };
window.addEventListener(
  "pointermove",
  (event) => {
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
  },
  true
);

/** Whether a targeting session is currently running. */
export function isTargeting() {
  return active;
}

/**
 * Resolve which token sits under a pointer event. Prefers the token the
 * canvas is already hovering; falls back to a world-space hit test.
 *
 * @param {PointerEvent} event
 * @returns {Token|null}
 */
function tokenFromEvent(event) {
  const placeables = canvas.tokens?.placeables ?? [];
  const hovered = placeables.find((t) => t.hover && t.visible);
  if (hovered) return hovered;

  try {
    const view = canvas.app.view;
    const rect = view.getBoundingClientRect();
    const world = canvas.stage.worldTransform.applyInverse(
      new PIXI.Point(event.clientX - rect.left, event.clientY - rect.top)
    );
    return (
      placeables.find((t) => t.visible && t.bounds.contains(world.x, world.y)) ??
      null
    );
  } catch (err) {
    return null;
  }
}

/**
 * Enter targeting mode and resolve with the chosen token, or null if the
 * user cancelled (Esc, right-click, or a click on empty canvas).
 *
 * @returns {Promise<Token|null>}
 */
export async function pickTarget() {
  if (!canvas?.ready || active) return null;
  active = true;

  const label = document.createElement("div");
  label.id = "chud-target-cursor";
  label.innerHTML =
    '<i class="fa-solid fa-crosshairs"></i>' +
    `<span>${game.i18n.localize("CPR-CHUD.targeting.choose")}</span>`;
  label.style.left = `${lastPointer.x}px`;
  label.style.top = `${lastPointer.y}px`;
  document.body.appendChild(label);
  document.body.classList.add("chud-targeting");

  return new Promise((resolve) => {
    let done = false;

    const moveLabel = (event) => {
      label.style.left = `${event.clientX}px`;
      label.style.top = `${event.clientY}px`;
    };

    const finish = (result) => {
      if (done) return;
      done = true;
      window.removeEventListener("pointermove", moveLabel, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("contextmenu", onContext, true);
      window.removeEventListener("keydown", onKey, true);
      // Swallow the trailing pointerup/click so the canvas does not also
      // treat this click as a token selection.
      const swallow = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.removeEventListener("click", swallow, true);
        window.removeEventListener("pointerup", swallow, true);
      };
      window.addEventListener("click", swallow, true);
      window.addEventListener("pointerup", swallow, true);
      window.setTimeout(() => {
        window.removeEventListener("click", swallow, true);
        window.removeEventListener("pointerup", swallow, true);
      }, 500);

      label.remove();
      document.body.classList.remove("chud-targeting");
      active = false;
      resolve(result);
    };

    const onPointerDown = (event) => {
      // Ignore clicks on our own HUD so the bar stays usable mid-targeting.
      if (event.target?.closest?.("#cpr-combat-hud")) return;

      const onBoard =
        event.target?.id === "board" || !!event.target?.closest?.("#board");
      if (!onBoard) {
        // Clicking other UI cancels rather than leaving a stuck cursor.
        event.stopImmediatePropagation();
        finish(null);
        return;
      }
      if (event.button !== 0) return; // right-click handled by contextmenu

      event.preventDefault();
      event.stopImmediatePropagation();
      const token = tokenFromEvent(event);
      if (!token) {
        finish(null);
        return;
      }
      token.setTarget(true, { user: game.user, releaseOthers: true });
      finish(token);
    };

    const onContext = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(null);
    };

    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(null);
      }
    };

    window.addEventListener("pointermove", moveLabel, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("contextmenu", onContext, true);
    window.addEventListener("keydown", onKey, true);
  });
}

/**
 * Decide, based on the module setting and the current targets, whether an
 * attack should first prompt for a target. Returns true to proceed with the
 * roll, false to abort (user cancelled targeting).
 *
 * @returns {Promise<boolean>}
 */
export async function resolveAttackTarget() {
  const mode = game.settings.get(MODULE_ID, "targetMode");
  if (mode === "off" || !canvas?.ready) return true;

  const alreadyTargeting = game.user.targets.size > 0;
  const needPick = mode === "always" || (mode === "ifNone" && !alreadyTargeting);
  if (!needPick) return true;

  const token = await pickTarget();
  // Cancelled (Esc / right-click / empty click) -> do not roll.
  return token !== null;
}
