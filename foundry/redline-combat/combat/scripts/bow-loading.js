import { escapeHTML as escape } from "./shared.js";
const value = (item, path) => foundry.utils.getProperty(item, "system." + path);
const loaded = (item) => Number(value(item, "magazine.value")) > 0;
function available(actor, bow) {
    const varieties = value(bow, "ammoVariety");
    return Array.from(actor.items).filter(i => String(i.type) === "ammo" && Number(value(i, "amount")) > 0 && Array.isArray(varieties) && varieties.includes(value(i, "variety")));
}
/** Native installation remembers the last arrow stack; native reload owns inventory accounting. */
export async function prepareBowAttack(actor, item) {
    if (value(item, "weaponType") !== "bow" || loaded(item))
        return true;
    const bow = item;
    if ([bow.getInstalledItems, bow.installItems, bow.uninstallItems, bow.reload].some(fn => typeof fn !== "function"))
        throw Error("Штатная зарядка лука недоступна. Зарядите боеприпасы через лист персонажа.");
    const ammo = available(actor, bow);
    if (!ammo.length) {
        ui.notifications.warn("В инвентаре персонажа не осталось подходящих стрел.");
        return false;
    }
    const previous = bow.getInstalledItems("ammo")[0];
    const remembered = ammo.some(i => i.id === previous?.id) ? previous?.id : undefined;
    const selected = await new Promise(resolve => {
        new Dialog({ title: "Зарядить лук", content: '<p>Выберите боеприпасы для ' + escape(bow.name) + '. Заряд сохранится, даже если бросок атаки будет отменён.</p><div class="form-group"><label for="pneuma-bow-ammo">Боеприпасы</label><select id="pneuma-bow-ammo" name="ammo"><option value=""' + (!remembered ? ' selected' : '') + '>Выберите боеприпасы</option>' + ammo.map(i => '<option value="' + escape(i.id) + '"' + (i.id === remembered ? ' selected' : '') + '>' + escape(i.name) + ' (×' + Number(value(i, "amount")) + ')</option>').join('') + '</select></div>', buttons: { load: { label: "Зарядить и продолжить", callback: html => resolve(html.find('[name="ammo"]').val() || null) }, cancel: { label: "Отмена", callback: () => resolve(null) } }, default: "load", close: () => resolve(null) }).render(true);
    });
    if (!selected)
        return false;
    if (actor.items.get(item.id) !== item)
        throw Error("Лука больше нет в инвентаре персонажа.");
    // Another action may have loaded the bow while this dialog was open. Do not replace its arrow.
    if (loaded(bow))
        return true;
    const chosen = available(actor, bow).find(i => i.id === selected);
    if (!chosen)
        throw Error("Эти боеприпасы больше недоступны. Выберите заново.");
    const current = bow.getInstalledItems("ammo")[0];
    if (current?.id !== chosen.id) {
        if (current)
            await bow.uninstallItems([current]);
        if (!await bow.installItems([chosen]))
            return false;
    }
    await bow.reload();
    if (!loaded(bow)) {
        ui.notifications.warn("Не удалось зарядить лук. Проверьте боеприпасы.");
        return false;
    }
    return true;
}
