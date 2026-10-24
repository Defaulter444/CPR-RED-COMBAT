import { escapeHTML } from "../shared.js";
import type {EncounterRef} from "../encounter.js";
import { resolutionSection, rollOutcomeClass } from "../card-structure.js";
import { MODULE } from "./availability.js";
import { enabled, label } from "./settings.js";
import { gmAudience, type Audience } from "./rolls.js";

export interface QuickhackResult extends Partial<EncounterRef> {
  type: "jackIn" | "quickhack" | "breach";
  breachCleared?: number;
  combatUuid?: string;
  sourceActorUuid: string; targetActorUuid: string; sourceTokenUuid: string; targetTokenUuid: string;
  quickhackId?: string; success: boolean; alerted: boolean; audience: string; revealAttacker: boolean;
  effectResolved?: boolean; effectFailed?: boolean;
  connectionId?: string;
}
export { escapeHTML } from "../shared.js";
export function delivery(audience: string, source: Actor, target: Actor): Audience {
  if (audience === "public") return { whisper: [], blind: false };
  const gm = gmAudience();
  const actor = audience === "sourceOwners" ? source : audience === "targetOwners" ? target : null;
  return actor ? { whisper: [...new Set([...gm.whisper, ...game.users!.filter(user => !user.isGM && actor.testUserPermission(user, "OWNER")).map(user => user.id)])], blind: false } : gm;
}
export function resultFlag(message: ChatMessage) {
  const value = ((message.flags as Record<string, unknown>)[MODULE] as { quickhack?: QuickhackResult } | undefined)?.quickhack;
  return value && ["jackIn", "quickhack", "breach"].includes(value.type) ? value : undefined;
}
export async function postResult(source: Token, target: Token, result: QuickhackResult,
  title: string, outcome: string, detail: string, rollContent = "") {
  if (!enabled()) return;
  // A private NPC roll must never be copied into a player-visible result.
  if (rollContent && !source.actor!.hasPlayerOwner && result.audience !== "gm") {
    await ChatMessage.create({ content: rollContent, ...gmAudience(),
      speaker: ChatMessage.getSpeaker({ actor: source.actor!, token: source.document }),
      flags: { [String(MODULE)]: { quickhack: { type: "roll", sourceActorUuid: source.actor!.uuid } } } });
    rollContent = "";
  }
  if (!enabled()) return;
  const participants = `<p class="pneuma-quickhack-participants">${escapeHTML(result.revealAttacker ? source.name : label("Result.UnknownNetrunner"))} → ${escapeHTML(target.name)}</p>`;
  const controls = result.alerted ? `<button type="button" data-quickhack-action="force-out">${label("ForceOut.Button")}</button>` : "";
  const damage = result.success && result.quickhackId === "synapse-burnout"
    ? `<button type="button" data-quickhack-action="damage">${label("Damage.Roll")}</button>` : "";
  const effects = result.type === "quickhack" && result.success ? `<p class="pneuma-quickhack-effect">${label("Effect.Resolving")}</p>` : "";
  const header = `<div class="rollcard-top"><div class="cpr-block pneuma-quickhack-heading"><h3>${escapeHTML(title)}</h3>${participants}</div></div>`;
  const dice = rollContent ? `<div class="pneuma-quickhack-roll ${rollOutcomeClass(result.success)}" data-quickhack-section="roll">${rollContent}</div>` : "";
  const content = `<div class="rollcard pneuma-quickhack-card" data-state="${result.success ? "success" : "failure"}">`
    + header + dice
    + resolutionSection("result", `<div class="cpr-block pneuma-quickhack-result"><strong class="pneuma-quickhack-outcome">${escapeHTML(outcome)}</strong><div class="pneuma-quickhack-detail">${detail}</div><div class="pneuma-quickhack-actions">${damage}${controls}</div></div>`)
    + (effects ? resolutionSection("effects", effects) : "")
    + "</div>";
  return ChatMessage.create({ content, ...delivery(result.audience, source.actor!, target.actor!),
    speaker: result.revealAttacker ? ChatMessage.getSpeaker({ actor: source.actor!, token: source.document }) : { alias: label("Result.UnknownNetrunner") },
    flags: { [String(MODULE)]: { quickhack: result, rollsRevealed: true } },
  });
}
