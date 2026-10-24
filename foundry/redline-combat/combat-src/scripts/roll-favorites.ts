import { MANUAL_MODULE as M } from "./manual-roll-state.js";
export interface RollFavorite { kind: "skill" | "roleAbility"; subtype?: string; name: string }
const path = "flags." + M + ".rollFavorites";
function favoriteItem(actor: Actor, favorite: RollFavorite): Item | undefined {
  return actor.items.find(item => String(item.type) === (favorite.kind === "skill" ? "skill" : "role")
    && (favorite.kind === "skill" ? item.name === favorite.name : favorite.subtype === "mainRoleAbility"
      ? (item.system as unknown as {mainRoleAbility:string}).mainRoleAbility === favorite.name
      : (item.system as unknown as {abilities:{name:string}[]}).abilities?.some(a => a.name === favorite.name)));
}
export function favoriteChoice(actor: Actor, favorite: RollFavorite): RollFavorite | undefined {
  const item = favoriteItem(actor,favorite);
  if (!item || String(item.type) !== (favorite.kind === "skill" ? "skill" : "role")) return;
  if (favorite.kind === "skill") return { ...favorite, name: item.name! };
  const data = item.system as unknown as { mainRoleAbility: string; hasRoll: boolean; abilities: { name: string; hasRoll: boolean }[] };
  if (favorite.subtype === "mainRoleAbility") return data.hasRoll ? { ...favorite, name: data.mainRoleAbility || item.name! } : undefined;
  const ability = data.abilities?.find(a => a.name === favorite.name && a.hasRoll);
  return ability ? favorite : undefined;
}
export const sameFavorite = (a: RollFavorite, b: RollFavorite) => a.kind === b.kind && a.subtype === b.subtype && a.name === b.name;
export function rollFavorites(): RollFavorite[] {
  const stored = foundry.utils.getProperty(game.user!, path) as RollFavorite[] | undefined;
  return Array.isArray(stored) ? stored.slice(0, 3) : [];
}
let pending: Promise<unknown> = Promise.resolve();
function updateFavorites(change: (favorites: RollFavorite[]) => void): Promise<void> {
  const next = pending.then(async () => {
    const favorites = rollFavorites();
    change(favorites);
    await game.user!.update({[path]: favorites});
  });
  pending = next.catch(() => undefined);
  return next;
}
export function removeRollFavorite(favorite: RollFavorite): Promise<void> {
  return updateFavorites(favorites => {
    const index = favorites.findIndex(f => sameFavorite(f, favorite));
    if (index >= 0) favorites.splice(index, 1);
  });
}
export function toggleRollFavorite(actor: Actor, favorite: RollFavorite): Promise<void> {
  return updateFavorites(favorites => {
    const index = favorites.findIndex(f => sameFavorite(f, favorite));
    if (index >= 0) { favorites.splice(index, 1); return; }
    if (["container", "blackIce", "demon"].includes(String(actor.type))) throw Error("Сначала выберите токен персонажа.");
  if (!actor.isOwner) throw Error("Вы не управляете этим персонажем.");
    const current = favoriteChoice(actor, favorite);
    if (!current) throw Error("У этой способности нет штатного броска, или она больше недоступна.");
    if (favorites.length >= 3) throw Error("В избранном не больше 3 навыков и ролевых способностей. Сначала уберите звезду.");
    favorites.push(current);
  });
}
export async function rollFavorite(actor: Actor, favorite: RollFavorite, skipDialog = false): Promise<void> {
  if (["container", "blackIce", "demon"].includes(String(actor.type))) throw Error("Сначала выберите токен персонажа.");
  if (!actor.isOwner) throw Error("Вы не управляете этим персонажем.");
  const current = favoriteChoice(actor, favorite);
  if (!current) throw Error("Эта способность больше недоступна.");
  const sheet = actor.sheet as ActorSheet & { _onRoll?(event: unknown): Promise<void> };
  if (!sheet?._onRoll) throw Error("Лист персонажа не предоставляет штатный обработчик бросков CPR.");
  const control = document.createElement("a");
  control.dataset.itemId = favoriteItem(actor,current)!.id!; control.dataset.rollType = current.kind; control.dataset.rollTitle = current.name;
  if (current.subtype) control.dataset.rollSubtype = current.subtype;
  await sheet._onRoll({ currentTarget: control, target: control, type: "pneuma-favorite", ctrlKey: skipDialog, metaKey: false, shiftKey: skipDialog });
}
