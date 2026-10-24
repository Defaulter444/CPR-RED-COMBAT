import { escapeHTML as manualEscape } from "./shared.js";
import type { DamageState } from "./damage-flow.js";
export const MANUAL_MODULE = "redline-combat";
export interface GroupRow { user: string; actor: string; name: string; state: "waiting" | "rolling" | "done"; nonce?: string; roller?: string; total?: number; html?: string }
export interface InjuryResult { location: "body" | "head"; item: string; name: string; html: string }
export interface ManualCard {
  kind: "damage" | "critical" | "group"; creator: string; title: string; rollMode: string;
  damage?: DamageState; injury?: InjuryResult; rows?: GroupRow[]; skill?: string; dv?: number; hideDV?: boolean;
  injuryApplications?: string[]; injuryBusy?: boolean;
}
export { escapeHTML as manualEscape } from "./shared.js";
export function manualNumber(value: unknown, name: string, min: number, max: number): number {
  const number = Number(value);
  if (value === "" || !Number.isInteger(number) || number < min || number > max) throw Error(name + " — целое число от " + min + " to " + max + ".");
  return number;
}
export function groupOutcome(total: number, dv?: number): string {
  return dv === undefined ? "" : total > dv ? "Success" : "Fail";
}
export function groupContent(data: ManualCard, gm = false): string {
  const esc = manualEscape;
  return '<div class="rollcard-top"><div class="cpr-block pneuma-group-heading"><span class="text-normal text-semi">'+esc(data.skill)+'</span>'
    +(data.dv===undefined?'':'<span class="pneuma-group-dv text-normal">'+(data.hideDV&&!gm?'DV скрыто':'DV '+data.dv)+'</span>')+'</div></div>'
    + '<div class="rollcard-bottom"><div class="cpr-block"><ul class="pneuma-group-rows">'  + (data.rows ?? []).map(row => {
      const outcome=row.state === "done" ? groupOutcome(row.total!,data.dv) : "";
      const total=row.html ? '<a class="pneuma-group-total" role="button" tabindex="0" aria-expanded="false" aria-label="Подробности броска: '+esc(row.name)+'"><strong>'+esc(row.total)+'</strong></a>' : '<strong>'+esc(row.total)+'</strong>';
      return '<li data-group-user="'+esc(row.user)+'"><span>'+esc(row.name)+'</span><span>'
        +(row.state === "done" ? total+(outcome?' <span class="pneuma-group-outcome" data-outcome="'+outcome.toLowerCase()+'">'+(outcome==='Success'?'Успех':'Провал')+'</span>':'') : row.state === "rolling" ? 'Бросок…' : 'Ожидание')
        +'</span><span class="pneuma-group-action"></span>'+(row.html?'<div class="pneuma-group-details" hidden>'+row.html+'</div>':'')+'</li>';
    }).join('')+'</ul></div></div>';
}
