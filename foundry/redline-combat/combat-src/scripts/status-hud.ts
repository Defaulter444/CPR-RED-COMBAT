import type { StatusDefinition } from "./status-catalog.js";
import { statusLabel } from "./status-labels.js";
/** Move native nodes rather than replace them: Foundry keeps its click/right-click handlers. */
export function groupStatusHUD(root: HTMLElement, statuses: StatusDefinition[]): void {
  const tray = root.querySelector<HTMLElement>(".status-effects:not(.pneuma-combat-menu)");
  if (!tray || tray.dataset.pneumaGrouped) return;
  const icons = Array.from(tray.querySelectorAll<HTMLElement>(".effect-control"));
  if (!icons.length) return;
  tray.dataset.pneumaGrouped = "true";
  tray.classList.add("pneuma-status-tray");
  const general = document.createElement("div"); general.className = "pneuma-status-grid";
  const groups = new Map<string, HTMLElement>([["general", general], ["custom", general]]);
  const generalSection = document.createElement("details"); generalSection.className = "pneuma-status-group"; generalSection.open = true;
  const generalTitle = document.createElement("summary"); generalTitle.textContent = "Общее";
  generalSection.append(generalTitle, general); tray.append(generalSection);
  for (const [group, title] of [["head", "Криты головы"], ["body", "Криты тела"], ["pharma", "Фармацевтика"], ["drugs", "Наркотики"], ["addiction", "Зависимости"]]) {
    const details = document.createElement("details"); details.className = "pneuma-status-group";
    const summary = document.createElement("summary"); summary.textContent = title!;
    const grid = document.createElement("div"); grid.className = "pneuma-status-grid";
    details.append(summary, grid); tray.append(details); groups.set(group!, grid);
  }
  const nameOf=(icon:HTMLElement)=>statuses.find(status=>status.id===icon.dataset.statusId)?.name??icon.title;
  icons.sort((a,b)=>nameOf(a).localeCompare(nameOf(b),"en",{sensitivity:"base"}));
  for (const icon of icons) {
    const id = icon.dataset.statusId;
    const status = statuses.find(status => status.id === id);
    if (["Lightly Wounded", "Seriously Wounded", "Mortally Wounded", "Quick Fix"].includes(status?.name ?? "")) { icon.remove(); continue; }
    if (status) { const label = statusLabel(status.name); icon.title = label; icon.dataset.tooltip = label; icon.setAttribute("aria-label", label); }
    (groups.get(status?.group ?? "general") ?? general).append(icon);
  }
}
