import { quickhackAssetPath } from "./asset-paths.js";
import { primaryGM as electedGM } from "../shared.js";
import { MODULE, quickhackId, isQuickhackLauncher } from "./availability.js";
import { QUICKHACKS } from "./catalog.js";
import { enabled, label } from "./settings.js";
export const itemView = (item) => item;
export function programData(hack) {
    return {
        name: `Квикхак: ${hack.name}`, type: "program",
        img: `modules/${MODULE}/combat/styles/quickhacks/${hack.id}-gray.png`,
        system: { class: "booster", size: 1, isRezzed: false,
            description: { value: `<p>${hack.tier} квикхак — DV${hack.dv}</p><p>${label("Item.Effect." + hack.id)}</p>` },
            damage: { standard: "0", blackIce: "0" } },
        flags: { [String(MODULE)]: { quickhackId: hack.id } },
    };
}
export const primaryGM = () => electedGM()?.id === game.user.id;
let initialization;
export function initializeQuickhackContent() {
    if (!enabled() || !primaryGM())
        return Promise.resolve();
    return initialization ??= createMissingContent().finally(() => { initialization = undefined; });
}
/** Repair legacy artwork paths; seed missing content without changing other item data. */
async function createMissingContent() {
    if (!enabled())
        return;
    await repairQuickhackAssetPaths();
    const root = await ensureFolder("REDLINE");
    const folder = await ensureFolder("Квикхаки", root);
    for (const hack of QUICKHACKS) {
        if (!enabled())
            return;
        if (game.items.some(item => String(item.type) === "program" && quickhackId(itemView(item)) === hack.id))
            continue;
        await Item.create({ ...programData(hack), folder: folder.id });
    }
    if (!enabled())
        return;
    if (!game.items.some(item => isQuickhackLauncher(itemView(item)))) {
        await Item.create({ name: "Квикхак", type: "weapon", folder: root.id,
            img: `modules/${MODULE}/combat/styles/quickhack-gray.png`,
            system: { description: { value: "<p>Кнопкой атаки в листе подключитесь, кнопкой урона выберите квикхак. Выберите свой токен и наведите цель на другой.</p>" },
                equipped: "owned", weaponType: "unarmed", isRanged: false, handsReq: 0, rof: 1,
                damage: "0", unarmedAutomaticCalculation: false },
            flags: { [String(MODULE)]: { action: "quickhack" } } });
    }
}
async function ensureFolder(name, parent) {
    const existing = game.folders.find(folder => folder.type === "Item" && folder.name === name
        && (folder.folder?.id ?? null) === (parent?.id ?? null));
    if (existing)
        return existing;
    const created = await Folder.create({ name, type: "Item", folder: parent?.id ?? null });
    if (!created)
        throw new Error(`Не удалось создать папку квикхаков: ${name}`);
    return created;
}
export async function repairQuickhackAssetPaths() {
    if (!enabled() || !primaryGM())
        return;
    const items = new Set(game.items ?? []);
    for (const actor of game.actors ?? [])
        for (const item of actor.items)
            items.add(item);
    for (const scene of game.scenes ?? [])
        for (const token of scene.tokens ?? []) {
            if (token.actorLink)
                continue;
            for (const item of token.actor?.items ?? [])
                items.add(item);
        }
    for (const item of items) {
        const img = quickhackAssetPath(item.img);
        if (img && img !== item.img)
            await item.update({ img });
    }
}
