import { consumeHazardAttack } from "./hazard-attacks.js";
import { confirmAreaRoll } from "./aoe/weapon.js";
import { findNativeItem } from "./native-lookup.js";
import { attackTitle, attackHeading } from "./attack-title.js";
import { allActors, primaryGM as electedGM, escapeHTML as escape } from "./shared.js";
import { prepareBowAttack } from "./bow-loading.js";
import { tokenEncounter, resolveEncounter, encounterRef } from "./encounter.js";
import { attackCrossesSmoke } from "./aoe/smoke-obscuration.js";
import { evasionBlocked } from "./injury-rules.js";
import { empDisabled, isMicrowaver } from "./emp-rules.js";
import { requireCombatSocket } from "./socket-health.js";
import { grappleWeaponBlocked } from "./grapple/state.js";
import { PendingCardRefresh } from "./pending-card-refresh.js";
import { setItemMarker } from "./item-markers.js";
import { bindCardAction, resolutionSection, rollOutcomeClass } from "./card-structure.js";
import { damageContent, handleDamage, renderDamage } from "./damage-flow.js";
import { homebrew, automaticNPCEvasion } from "./evasion-settings.js";
import { checkedLuck, evasionButtonLabel, evasionOffer } from "./evasion-rules.js";
import { attackDialog, registerAttackDialog, diceJSON, evasionDialog, showDiceAs, messageDiceAudience, nativeCard, registerEvasionDialog, rollHidden, spendBonusLuck } from "./native-combat.js";
import { distanceWithElevation, parseDV } from "./dv-data.js";
import { getTable } from "./dv-hover.js";
const MODULE = "redline-combat";
const CHANNEL = "module." + MODULE;
const claims = new Map();
const pending = new Map();
const retry = new Map();
let queue = Promise.resolve();
let trackingReady = true;
const flag = (doc, name) => foundry.utils.getProperty(doc, "flags." + MODULE + "." + name);
function authority() { return electedGM(); }
export const defenderKey = (actor) => encodeURIComponent(actor.uuid).replaceAll(".", "%2E");
function exchangeCombatId(data) {
    // Older confirmed exchanges have an unambiguous round reference; pending ones do not.
    if (data.combatId !== undefined)
        return data.combatId;
    if (data.round === "outside-combat")
        return null;
    return data.round?.split(":")[0];
}
function exchangeCombat(data) {
    const id = exchangeCombatId(data);
    return id ? game.combats?.get(id) : undefined;
}
function roundKey(combat) {
    return combat?.started ? combat.id + ":" + combat.round : "outside-combat";
}
function claimKey(data, actor) {
    return String(exchangeCombatId(data)) + ":" + actor.uuid;
}
function currentCombat(data) { return resolveEncounter(data); }
export function combatForAttack(attacker, defender) {
    if (attacker.document.parent?.id !== defender.document.parent?.id)
        throw Error("Оба токена должны быть на одной сцене.");
    return tokenEncounter(attacker.document.parent?.id, [attacker.document.uuid, defender.document.uuid]);
}
async function tokenActor(uuid) {
    const token = await fromUuid(uuid);
    if (!token?.actor)
        throw new Error("Боевой токен или актёр больше не существует.");
    return token.actor;
}
export function offer(actor, ranged, combat) {
    const blocked = evasionBlocked(actor);
    if (blocked)
        return { allowed: false, penalty: 0, cost: 0, free: 0, reason: blocked };
    if (!ranged)
        return { allowed: true, penalty: 0, cost: 0, free: 0, reason: "Бесплатное уклонение" };
    const get = (key) => foundry.utils.getProperty(actor, key);
    const items = Array.from(actor.items);
    const coName = game.i18n.localize("CPR.global.itemType.cyberware.reflexCoProcessor");
    const coprocessor = items.some(item => !empDisabled(item) && String(item.type) === "cyberware"
        && (item.name?.toLowerCase() === "reflex co-processor" || item.name === coName
            || String(foundry.utils.getProperty(item, "flags.core.sourceId") ?? "").endsWith(".0z0v50kDAgHvMquv"))
        && foundry.utils.getProperty(item, "system.isInstalledInActor") === true);
    const solo = items.some(item => String(item.type) === "role"
        && (item.name?.toLowerCase() === "solo" || foundry.utils.getProperty(item, "system.roleName") === "solo")
        && (foundry.utils.getProperty(item, "system.abilities") ?? [])
            .some(ability => ["threat detection", game.i18n.localize("CPR.global.role.solo.ability.threatDetection").toLowerCase()]
            .includes(ability.name.toLowerCase()) && Number(ability.rank) >= 2));
    const usage = combat ? flag(combat, "evasionUsage." + defenderKey(actor)) : undefined;
    const mode = game.settings.get(MODULE, "evasionEligibility");
    if (ranged && mode === "custom" && usage?.round.startsWith(combat?.id + ":")
        && Number(usage.round.split(":")[1]) > Number(combat?.round)) {
        return { allowed: false, penalty: 0, cost: 0, free: 0,
            reason: "Раунд боя откатился назад. Вернитесь к последнему раунду, прежде чем учитывать уклонения." };
    }
    return evasionOffer(ranged, mode, homebrew(), { ref: Number(get("system.stats.ref.value")), coprocessor, solo, luck: Number(get("system.stats.luck.value")) }, usage?.round === roundKey(combat) ? usage.used : 0, !!combat?.started);
}
function exchangeOffer(actor, data, combat) {
    const choice = offer(actor, data.ranged, combat);
    return data.evasionOverride && !choice.allowed
        ? { allowed: true, penalty: 0, cost: 0, free: 0, reason: "Решение Мастера" } : choice;
}
export function skipUnavailableEvasion(data, actor, combat) {
    if (!data.ranged || data.unaware)
        return;
    const choice = offer(actor, true, combat);
    if (choice.allowed)
        return;
    data.cannotEvade = choice.reason;
    data.state = "resolved";
    data.hit = data.total > data.dv;
}
function canOverrideEvasion(message, data) {
    return !!data.cannotEvade && !data.evasionOverride && data.state === "resolved" && !data.damage
        && !flag(message, "microwaverClaim");
}
export function autofireResultMultiplier(data) {
    if (data.attackMode !== "autofire")
        return;
    if (!data.hit)
        return 0;
    const maximum = data.autofireMaximum, margin = data.total - (data.defense?.total ?? data.dv ?? NaN);
    if (typeof maximum !== "number" || !Number.isFinite(maximum) || maximum < 1 || !Number.isFinite(margin))
        return;
    return Math.min(Math.max(margin, 1), maximum);
}
export function exchangeContent(data) {
    if (data.state !== "resolved")
        return '<div class="pneuma-resolution-card">' + resolutionSection("pending", '<div class="rollcard pneuma-pending-exchange"><div class="rollcard-top"><div class="cpr-block">'
            + '<div class="pneuma-pending-title">' + attackHeading(data.title, 'div') + '</div>'
            + '<p class="pneuma-pending-status">' + (data.state === "cancelled" ? "Мастер отменил обмен ударами" : data.state === "applying" ? "Завершаем оплату уклонения…" : "Ждём выбора защиты")
            + '</p></div></div></div><div class="pneuma-pending-controls"></div>') + '</div>';
    const doc = new DOMParser().parseFromString(data.html, "text/html");
    doc.querySelectorAll(".rollcard-top .text-normal").forEach(node => { node.classList.add("pneuma-attack-name"); node.title = data.title; });
    let legacyDamage = "";
    doc.querySelectorAll('[data-action="rollDamage"]').forEach(node => {
        if (!legacyDamage)
            legacyDamage = node.outerHTML;
        node.remove();
    });
    doc.querySelectorAll(".rollcard-subtitle").forEach(node => node.classList.add("pneuma-attack-subtitle"));
    // Scope expandable defense details separately from the attack's identically named classes.
    let defense = "";
    if (data.defense) {
        const part = new DOMParser().parseFromString(data.defense.html, "text/html");
        for (const node of Array.from(part.querySelectorAll("[data-visible-element]"))) {
            const name = node.getAttribute("data-visible-element");
            part.querySelectorAll("." + name).forEach(el => el.classList.replace(name, "pneuma-defense-" + name));
            node.setAttribute("data-visible-element", "pneuma-defense-" + name);
        }
        part.querySelectorAll(".rollcard-top .cpr-block > .text-small").forEach(node => node.remove());
        if (data.defense.fee) {
            const heading = part.querySelector(".rollcard-top .cpr-block > .text-normal")
                ?? part.querySelector(".rollcard-top .cpr-block");
            if (heading) {
                heading.classList.add("pneuma-evasion-heading");
                const cost = part.createElement("span");
                cost.className = "pneuma-evasion-cost";
                cost.textContent = data.defense.fee + " УДАЧИ";
                cost.title = "Цена уклонения: " + data.defense.fee + " УДАЧИ";
                heading.append(cost);
            }
        }
        defense = resolutionSection("evade", part.body.innerHTML, "pneuma-defense-result " + rollOutcomeClass(!data.hit));
    }
    const multiplier = autofireResultMultiplier(data);
    const opposed = data.unaware ? "Защитник не замечает атаки — без уклонения" : data.defense ? "Уклонение " + data.defense.total : data.ranged ? "DV " + data.dv : "От защиты отказались";
    const damageControl = data.disableSource === "microwaver" ? "" : data.weaponId
        ? '<button type="button" class="pneuma-result-damage" data-action="pneumaRollDamage" aria-label="Roll damage" title="Roll damage (Click to roll immediately; Shift-click to modify)"><i class="fas fa-droplet" aria-hidden="true"></i></button>'
        : legacyDamage;
    return '<div class="pneuma-resolution-card">'
        + resolutionSection("attack", doc.body.innerHTML, "pneuma-attack-result " + rollOutcomeClass(!!data.hit))
        + defense + resolutionSection("result", '<p class="pneuma-combat-outcome" title="' + escape(opposed) + '">' + damageControl + '<strong class="pneuma-result-summary">'
        + escape(data.attackerName) + ' <span class="' + (data.hit ? "pneuma-hit" : "pneuma-miss") + '">'
        + (data.hit ? "hits" : "misses") + '</span> ' + escape(data.defenderName)
        + (multiplier !== undefined ? ' <span class="pneuma-autofire-multiplier">Автоогонь ×' + multiplier + '</span>' : '')
        + '</strong></p>' + (data.cannotEvade ? '<small class="pneuma-cannot-evade" title="' + escape(data.cannotEvade) + '">'
        + (data.evasionOverride ? 'Мастер разрешил уклонение' : 'Цель не может уклониться') + '</small>' : '')) + damageContent(data) + '</div>';
}
async function writeExchange(message, data) {
    const changes = { ["flags." + MODULE + ".exchange"]: foundry.utils.deepClone(data), content: exchangeContent(data) };
    if (!data.damage && flag(message, "exchange")?.damage)
        changes["flags." + MODULE + ".exchange.-=damage"] = null;
    await message.update(changes);
}
async function revealDice(data, message) {
    await Promise.all([
        ...(data.attackRevealed ? [] : data.dice).map(json => showDiceAs(Roll.fromJSON(json), data.rollMode, data.roller, message && messageDiceAudience(message))),
        ...(data.defense?.dice ?? []).map(json => showDiceAs(Roll.fromJSON(json), data.rollMode, data.defense?.roller, message && messageDiceAudience(message))),
    ]);
    if (message)
        await message.update({ ["flags." + MODULE + ".rollsRevealed"]: true });
}
async function finish(message, data, actor) {
    const defense = data.defense;
    if (defense) {
        // The receipt is written atomically with native LUCK, then removed after both documents commit.
        const paid = flag(actor, "evasionPayment") === message.id
            || flag(actor, "evasionUsage")?.lastPayment === message.id;
        const combat = paid ? exchangeCombat(data) : currentCombat(data);
        if (!paid) {
            const current = Number(foundry.utils.getProperty(actor, "system.stats.luck.value"));
            const luck = checkedLuck(current, defense.fee, defense.bonus);
            await actor.update({ "system.stats.luck.value": luck,
                ["flags." + MODULE + ".evasionPayment"]: message.id });
        }
        // Never recreate counters on an ended/reset/deleted Combat during payment recovery.
        if (combat?.started && (flag(combat, "evasionEpoch") ?? "") === (data.combatEpoch ?? "")) {
            const key = "evasionUsage." + defenderKey(actor);
            const usage = flag(combat, key);
            if (usage?.lastPayment !== message.id) {
                const round = data.round;
                const used = (usage?.round === round ? usage.used : 0) + (data.ranged ? 1 : 0);
                await combat.update({ ["flags." + MODULE + "." + key]: { round, used, lastPayment: message.id } });
            }
        }
    }
    data.hit = defense ? data.total > defense.total : !data.ranged || data.total > data.dv;
    data.state = "resolved";
    await writeExchange(message, data);
    claims.delete(claimKey(data, actor));
    if (flag(actor, "evasionPayment") === message.id)
        await actor.update({ ["flags." + MODULE + ".-=evasionPayment"]: null });
    void revealDice(data, message).catch(error => console.warn(MODULE, "Dice display failed", error));
}
export async function handleCombatRequest(request) {
    if (!trackingReady)
        throw new Error("Перенос учёта уклонений ещё не завершён. Подождите и повторите; при ошибке переноса перезагрузите мир.");
    const message = game.messages?.get(request.message);
    const stored = message && flag(message, "exchange");
    const user = game.users?.get(request.user);
    if (!message || !stored || !user?.active)
        throw new Error("Обмен ударами недоступен.");
    if (request.action.startsWith("damage")) {
        if (stored.disableSource === "microwaver")
            throw Error("Вместо урона оружия разрешите сопротивление микроволновику.");
        if (!user.isGM && (message.blind || (message.whisper.length && !message.whisper.includes(user.id) && message.author?.id !== user.id)))
            throw new Error("Это закрытый обмен ударами.");
        const data = foundry.utils.deepClone(stored);
        await handleDamage(request, user, data, () => writeExchange(message, data), message);
        return;
    }
    const actor = await tokenActor(stored.defender);
    if (!user.isGM && !actor.testUserPermission(user, "OWNER"))
        throw new Error("Ответить может только владелец защитника или Мастер.");
    if (!user.isGM && message.whisper.length && !message.whisper.includes(user.id) && message.author?.id !== user.id)
        throw new Error("Это закрытый обмен ударами.");
    const data = foundry.utils.deepClone(stored);
    const claim = claims.get(claimKey(data, actor));
    if (request.action === "release") {
        if (claim && claim.nonce === request.nonce && claim.user === user.id)
            claims.delete(claimKey(data, actor));
        return;
    }
    if (request.action === "overrideEvasion") {
        if (!user.isGM)
            throw new Error("Переопределить уклонение может только Мастер.");
        if (!canOverrideEvasion(message, data))
            throw new Error("Уклонение можно открыть заново только до урона и последующих эффектов.");
        currentCombat(data);
        data.evasionOverride = true;
        data.attackRevealed = true;
        data.state = "waiting";
        data.hit = undefined;
        await writeExchange(message, data);
        return;
    }
    if (data.state === "resolved" || data.state === "cancelled") {
        if (flag(actor, "evasionPayment") === message.id)
            await actor.update({ ["flags." + MODULE + ".-=evasionPayment"]: null });
        return;
    }
    if (request.action === "cancel") {
        const paid = flag(actor, "evasionPayment") === message.id
            || flag(actor, "evasionUsage")?.lastPayment === message.id;
        if (!user.isGM || (data.state === "applying" && paid))
            throw new Error("Отменить может только Мастер, и сначала должна завершиться списанная оплата.");
        data.state = "cancelled";
        await writeExchange(message, data);
        claims.delete(claimKey(data, actor));
        return;
    }
    if (request.action === "resume") {
        if (data.state !== "applying")
            throw new Error("Нет оплаты, которую нужно завершить.");
        await finish(message, data, actor);
        return;
    }
    if (data.state !== "waiting")
        throw new Error("Сначала завершите ожидающую оплату.");
    const combat = currentCombat(data);
    const unfinished = game.messages?.find(other => {
        const exchange = flag(other, "exchange");
        return other.id !== message.id && exchange?.defenderActor === actor.uuid && exchange.state === "applying";
    });
    if (unfinished)
        throw new Error("Сначала завершите оплату защитника на предыдущей карточке.");
    if (request.action === "claim") {
        if (claim?.user === user.id && claim.message === message.id)
            return claim;
        if (claim && game.users?.get(claim.user)?.active)
            throw new Error("Для этого защитника уже открыт другой диалог уклонения.");
        const choice = exchangeOffer(actor, data, combat);
        if (!choice.allowed)
            throw new Error(choice.reason);
        const next = { user: user.id, message: message.id, nonce: foundry.utils.randomID(), offer: choice, round: roundKey(combat) };
        claims.set(claimKey(data, actor), next);
        return next;
    }
    if (request.action === "decline") {
        if (claim && game.users?.get(claim.user)?.active)
            throw new Error("Сначала закройте открытый диалог уклонения.");
        await finish(message, data, actor);
        return;
    }
    if (!claim || claim.nonce !== request.nonce || claim.user !== user.id || claim.message !== message.id)
        throw new Error("Проверьте уклонение: бронь истекла. Попробуйте снова.");
    const current = exchangeOffer(actor, data, combat);
    if (!current.allowed || claim.round !== roundKey(combat) || current.penalty !== claim.offer.penalty || current.cost !== claim.offer.cost)
        throw new Error("Проверьте уклонение: условия изменились. Повторите с новой ценой.");
    const defense = request.defense;
    if (!defense || !Number.isFinite(defense.total) || defense.penalty !== current.penalty || defense.fee !== current.cost)
        throw new Error("Некорректный результат уклонения.");
    try {
        checkedLuck(Number(foundry.utils.getProperty(actor, "system.stats.luck.value")), defense.fee, defense.bonus);
    }
    catch (error) {
        throw new Error("Проверьте уклонение: " + error.message);
    }
    data.defense = { ...defense, roller: user.id };
    data.round = claim.round;
    data.state = "applying";
    // Persist the exact roll before charging: a retry finishes it without another roll or payment.
    await writeExchange(message, data);
    await finish(message, data, actor);
}
export function serialized(request) {
    const next = queue.then(() => handleCombatRequest(request));
    queue = next.catch(() => undefined);
    return next;
}
async function request(message, action, extra = {}) {
    requireCombatSocket();
    const gm = authority();
    if (!gm)
        throw new Error("Для разрешения боя нужен активный Мастер.");
    const packet = { ...extra, id: foundry.utils.randomID(), user: game.user.id, message, action };
    if (gm.id === game.user.id)
        return serialized(packet);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(packet.id); reject(new Error("Мастер не ответил вовремя. Повторите действие на этой карточке.")); }, 15000);
        pending.set(packet.id, { resolve: value => { clearTimeout(timer); pending.delete(packet.id); resolve(value); },
            reject: error => { clearTimeout(timer); pending.delete(packet.id); reject(error); } });
        game.socket.emit(CHANNEL, { kind: "request", gm: gm.id, packet });
    });
}
async function respond(message, evade, automatic = false, skipDialog = false) {
    const data = flag(message, "exchange");
    if (data.state === "applying") {
        await request(message.id, "resume");
        retry.delete(message.id);
        return;
    }
    if (!evade) {
        await request(message.id, "decline");
        return;
    }
    const previous = retry.get(message.id);
    if (previous) {
        try {
            await request(message.id, "commit", previous);
            retry.delete(message.id);
        }
        catch (error) {
            if (error.message.startsWith("Проверьте уклонение:")) {
                retry.delete(message.id);
                await request(message.id, "release", { nonce: previous.nonce });
            }
            throw error;
        }
        return;
    }
    const claim = await request(message.id, "claim");
    if (!claim)
        return;
    try {
        const actor = await tokenActor(data.defender);
        const skill = findNativeItem(actor.items, "Evasion");
        if (!skill)
            throw new Error("У защитника нет навыка «Уклонение».");
        const roll = skill.createRoll("skill", actor);
        if (automatic) {
            if (!automaticNPCEvasion(actor) || claim.offer.penalty || claim.offer.cost)
                throw Error("Автоматическое уклонение работает только по базовым правилам.");
            roll.luck = 0;
        }
        else if (!await evasionDialog(roll, actor, skill, claim.offer.penalty, claim.offer.cost, skipDialog))
            return;
        checkedLuck(Number(foundry.utils.getProperty(actor, "system.stats.luck.value")), claim.offer.cost, roll.luck);
        await rollHidden(roll);
        const result = { nonce: claim.nonce, defense: { total: roll.resultTotal, html: await nativeCard(roll),
                dice: diceJSON(roll), bonus: roll.luck, fee: claim.offer.cost, penalty: claim.offer.penalty } };
        retry.set(message.id, result);
        await request(message.id, "commit", result);
        retry.delete(message.id);
    }
    catch (error) {
        if (error.message.startsWith("Проверьте уклонение:"))
            retry.delete(message.id);
        throw error;
    }
    finally {
        // Keep the claim while a submitted result can still be retried.
        if (!retry.has(message.id))
            await request(message.id, "release", { nonce: claim.nonce });
    }
}
export async function startCombatExchange(attacker, target, itemId, mode, event, thrown) {
    if ([attacker, target].some(token => ["container", "blackIce", "demon"].includes(String(token.actor?.type))))
        return;
    requireCombatSocket();
    if (!authority())
        throw new Error("Для разрешения боя нужен активный Мастер.");
    const combat = combatForAttack(attacker, target);
    const combatId = combat?.id ?? null;
    const combatEpoch = combat ? flag(combat, "evasionEpoch") ?? "" : "";
    const actor = attacker.actor;
    const item = thrown?.item ?? actor.items.get(itemId);
    if (!item || typeof item.createRoll !== "function")
        throw new Error("Штатный бросок оружия недоступен.");
    let ranged = !!foundry.utils.getProperty(item, "system.isRanged");
    const type = String(foundry.utils.getProperty(item, "system.weaponType"));
    if (type.toLowerCase().includes("melee") || ["unarmed", "martialArts"].includes(type))
        ranged = false;
    const category = ranged ? "Ranged" : ["unarmed", "martialArts"].includes(type) ? "Unarmed" : "Melee";
    if (!thrown && !await prepareBowAttack(actor, item))
        return;
    currentCombat({ combatId, combatEpoch });
    // Native createRoll displays its own out-of-bullets warning but does not abort.
    let roll = item.createRoll(mode, actor);
    if (ranged && item.hasAmmo && !item.hasAmmo(roll))
        return;
    let dv;
    if (ranged) {
        const distance = distanceWithElevation(canvas.grid.measurePath([attacker.center, target.center], {}).distance, attacker.document.elevation, target.document.elevation);
        const tableName = String(foundry.utils.getProperty(item, "system.dvTable") ?? "") + (mode === "autofire" ? " (Autofire)" : "");
        dv = parseDV((await getTable(tableName))?.getResultsForRoll(distance)[0]?.text);
        if (dv === undefined)
            throw new Error("Для этого оружия и дистанции нет DV стрельбы.");
    }
    const choice = await attackDialog(roll, actor, item, event, !!thrown?.improvised, attackCrossesSmoke(attacker.center, target.center));
    if (!choice.confirmed)
        return;
    if (!thrown && grappleWeaponBlocked(actor, item))
        throw new Error("Персонаж в захвате не может пользоваться двуручным оружием.");
    if (ranged && item.hasAmmo && !item.hasAmmo(roll)) {
        ui.notifications.warn(game.i18n.localize("CPR.messages.weaponAttackOutOfBullets"));
        return;
    }
    currentCombat({ combatId, combatEpoch });
    checkedLuck(Number(foundry.utils.getProperty(actor, "system.stats.luck.value")), 0, roll.luck);
    await consumeHazardAttack(actor, roll);
    roll = await confirmAreaRoll(item, roll);
    await spendBonusLuck(actor, roll.luck);
    await rollHidden(roll);
    roll.entityData = { actor: actor.id, token: attacker.id, item: itemId, tokens: [target.id] };
    if (mode === "aimed")
        await actor.update({ "flags.cyberpunk-red-core.aimedLocation": roll.location });
    const title = attackTitle(item, game.settings.get(MODULE, "hideAttackWeapon") && !actor.hasPlayerOwner, roll.skillName);
    roll.rollTitle = title;
    const data = { ...encounterRef(combat, attacker.document.parent?.id, [attacker.document.uuid, target.document.uuid]), ...(!thrown && isMicrowaver(item) ? { disableSource: "microwaver" } : {}), weaponType: type, ...(thrown ? { thrownSource: thrown.source, improvised: thrown.improvised, improvisedDice: choice.improvisedDice } : {}), criticalMethod: type === "grenadeLauncher" ? "Grenade" : type === "rocketLauncher" ? "Rocket" : undefined, weaponId: itemId, attackMode: mode, location: roll.location, unaware: choice.unaware, combatId, combatEpoch, attacker: attacker.document.uuid, defender: target.document.uuid, defenderActor: target.actor.uuid,
        attackerName: attacker.name ?? "", defenderName: target.name ?? "", ranged, category, title, dv,
        total: roll.resultTotal, html: await nativeCard(roll), dice: diceJSON(roll), roller: game.user.id,
        rollMode: game.settings.get("core", "rollMode") ?? "roll", state: "waiting" };
    skipUnavailableEvasion(data, target.actor, combat);
    if (mode === "autofire")
        data.autofireMaximum = item.createRoll("damage", actor, { damageType: mode }).autofireMultiplierMax;
    if (choice.unaware) {
        data.state = "resolved";
        data.hit = !ranged || data.total > dv;
    }
    const messageData = { content: exchangeContent(data), speaker: ChatMessage.getSpeaker({ actor, token: attacker.document }),
        flags: { [MODULE]: { exchange: data } } };
    ChatMessage.applyRollMode(messageData, data.rollMode);
    const message = await ChatMessage.create(messageData);
    if (!message)
        throw Error("Карточка атаки не создана после броска. Проверьте боеприпасы и бросок, прежде чем повторять.");
    if (thrown && !thrown.improvised) {
        const original = actor.items.get(itemId);
        if (original)
            await setItemMarker(original, "used", { label: "Использовано" });
    }
    if (data.state === "resolved")
        void revealDice(data, message ?? undefined).catch(error => console.warn(MODULE, error));
    return message;
}
/** Resetting a Combat removes only its transient counters; deselecting it must not. */
export function resetCombatTracking(_combat, changes) {
    if (changes.round === undefined || Number(changes.round) !== 0)
        return;
    changes["flags." + MODULE + ".-=evasionUsage"] = null;
    changes["flags." + MODULE + ".-=quickhackConnections"] = null;
    changes["flags." + MODULE + ".evasionEpoch"] = foundry.utils.randomID();
}
/** Move the first test version's counters to their recorded Combat without choosing a current combat. */
export async function migrateActorUsage(actor) {
    const old = flag(actor, "evasionUsage");
    if (!old)
        return;
    const combat = game.combats?.get(old.round.split(":")[0]);
    if (combat?.started && !flag(combat, "evasionEpoch")) {
        const key = "evasionUsage." + defenderKey(actor);
        if (!flag(combat, key))
            await combat.update({ ["flags." + MODULE + "." + key]: old });
    }
    const payment = old.lastPayment ? game.messages?.get(old.lastPayment) : undefined;
    const pendingPayment = payment && flag(payment, "exchange")?.state === "applying";
    const changes = { ["flags." + MODULE + ".-=evasionUsage"]: null };
    if (pendingPayment)
        changes["flags." + MODULE + ".evasionPayment"] = old.lastPayment;
    await actor.update(changes);
}
/** Styling metadata only; never use these attributes to authorize an action. */
export function decorateCombatMessage(root, data) {
    root.classList.add("pneuma-combat-message");
    root.dataset.pneumaExchangeState = data.state;
    root.dataset.pneumaDamageState = data.damage?.status ?? "none";
    root.dataset.pneumaOutcome = data.state === "resolved" ? (data.hit ? "hit" : "miss") : "none";
}
export function registerCombatResolution() {
    for (const [key, name, hint, value] of [
        ["hideAttackWeapon", "Скрывать названия оружия НПС", "Для атакующих без владельца-игрока показывать тип оружия, тип ближнего боя, «Боевые искусства», «Граната» или «Ракета» вместо названия. У персонажей игроков названия оружия видны всегда.", false],
    ])
        game.settings.register(MODULE, key, { name, hint, scope: "world", config: true, type: Boolean, default: value });
    registerEvasionDialog();
    registerAttackDialog();
    const pendingCards = new PendingCardRefresh(message => { ui.chat?.updateMessage(message); });
    const refreshPending = () => pendingCards.refresh();
    Hooks.on("createChatMessage", (message) => {
        pendingCards.remember(message);
        const data = flag(message, "exchange");
        if (authority()?.id !== game.user?.id || data?.state !== "waiting")
            return;
        void tokenActor(data.defender).then(async (actor) => {
            if (!automaticNPCEvasion(actor))
                return;
            if (offer(actor, data.ranged, currentCombat(data)).allowed)
                await respond(message, true, true);
        }).catch(error => ui.notifications.error("Уклонение НПС: " + error.message));
    });
    Hooks.on("updateChatMessage", (message) => pendingCards.remember(message));
    Hooks.on("deleteChatMessage", (message) => { if (message.id)
        pendingCards.forget(message.id); });
    Hooks.on("updateActor", (actor) => pendingCards.refresh(actor.uuid));
    for (const hook of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
        Hooks.on(hook, (doc) => {
            const owner = doc.parent;
            if (owner?.uuid)
                pendingCards.refresh(owner.uuid);
            if (owner?.parent?.uuid)
                pendingCards.refresh(owner.parent.uuid);
        });
    }
    Hooks.on("preUpdateCombat", resetCombatTracking);
    const clearCombatClaims = (combat) => {
        for (const [key, claim] of claims) {
            const message = game.messages?.get(claim.message);
            const data = message && flag(message, "exchange");
            if (data && exchangeCombatId(data) === combat.id)
                claims.delete(key);
        }
    };
    Hooks.on("updateCombat", (combat, changes) => {
        if (changes.round !== undefined && Number(changes.round) === 0)
            clearCombatClaims(combat);
        if (combat.id)
            pendingCards.refresh(undefined, combat.id);
    });
    Hooks.on("deleteCombat", (combat) => { clearCombatClaims(combat); if (combat.id)
        pendingCards.refresh(undefined, combat.id); });
    Hooks.on("updateSetting", (setting) => {
        if (setting.key?.startsWith(MODULE + ".evasion"))
            refreshPending();
    });
    Hooks.once("ready", () => {
        for (const message of game.messages ?? [])
            pendingCards.remember(message);
        if (authority()?.id === game.user.id) {
            trackingReady = false;
            void (async () => {
                for (const actor of allActors())
                    await migrateActorUsage(actor);
                trackingReady = true;
                refreshPending();
            })().catch(error => {
                console.error(MODULE, error);
                ui.notifications.error("Не удалось перенести счётчики уклонений. Устраните ошибку обновления документа и перезагрузите мир.");
            });
        }
        game.socket.on(CHANNEL, async (wire) => {
            if (wire.kind === "reply" && wire.user === game.user.id && wire.id) {
                const waiting = pending.get(wire.id);
                if (wire.error)
                    waiting?.reject(new Error(wire.error));
                else
                    waiting?.resolve(wire.value);
            }
            if (wire.kind !== "request" || wire.gm !== game.user.id || authority()?.id !== game.user.id || !wire.packet)
                return;
            try {
                const value = await serialized(wire.packet);
                game.socket.emit(CHANNEL, { kind: "reply", id: wire.packet.id, user: wire.packet.user, value });
            }
            catch (error) {
                game.socket.emit(CHANNEL, { kind: "reply", id: wire.packet.id, user: wire.packet.user, error: String(error.message) });
            }
        });
    });
    Hooks.on("renderChatMessage", (message, html) => {
        const data = flag(message, "exchange");
        if (!data || !message.visible || (message.blind && !game.user.isGM))
            return;
        if (html[0])
            decorateCombatMessage(html[0], data);
        if (data.state === "cancelled")
            return;
        html.find(".message-sender").text(data.attackerName + " → " + data.defenderName);
        if (data.state === "resolved") {
            if (game.user.isGM && canOverrideEvasion(message, data)) {
                const button = html[0]?.querySelector(".pneuma-evasion-override") ?? document.createElement("button");
                button.type = "button";
                button.className = "pneuma-evasion-override";
                button.dataset.gmOnly = "true";
                button.textContent = "Разрешить уклонение";
                button.title = "Решение Мастера для этой атаки; бросок атаки уже показан";
                bindCardAction(button, async () => {
                    if (button.disabled)
                        return;
                    button.disabled = true;
                    try {
                        await request(message.id, "overrideEvasion");
                    }
                    catch (error) {
                        ui.notifications.error(error.message);
                        button.disabled = false;
                    }
                });
                html.find(".pneuma-cannot-evade").append(button);
            }
            else
                html[0]?.querySelectorAll(".pneuma-evasion-override").forEach(button => button.remove());
            if (data.disableSource === "microwaver")
                return;
            void renderDamage(message, data, html, (action, extra) => request(message.id, action, extra))
                .catch(error => console.warn(MODULE, error));
            return;
        }
        void tokenActor(data.defender).then(actor => {
            if (!actor.isOwner || html.find(".pneuma-defense-controls").length)
                return;
            let choice;
            let available = true;
            try {
                choice = exchangeOffer(actor, data, currentCombat(data));
            }
            catch (error) {
                available = false;
                choice = { allowed: false, penalty: 0, cost: 0, free: 0, reason: error.message };
            }
            const panel = document.createElement("div");
            panel.className = "pneuma-defense-controls";
            for (const [text, evade] of data.state === "applying" ? [["Завершить оплату", true]]
                : [[data.ranged ? evasionButtonLabel(choice) : "Бесплатное уклонение", true], ["Не уклоняться", false]]) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = text;
                button.dataset.chatAction = data.state === "applying" ? "retry" : evade ? "evade" : "decline";
                if (evade && data.state === "waiting") {
                    const icon = document.createElement("i");
                    icon.className = "fas fa-person-running pneuma-evade-icon";
                    icon.setAttribute("aria-hidden", "true");
                    button.prepend(icon, document.createTextNode(" "));
                }
                button.disabled = data.state === "waiting" && (!available || (evade && !choice.allowed));
                if (data.state === "waiting" && (evade || !available)) {
                    button.title = choice.reason;
                    button.setAttribute("aria-description", choice.reason);
                }
                button.addEventListener("click", async (event) => {
                    const buttons = panel.querySelectorAll("button");
                    buttons.forEach(b => b.disabled = true);
                    try {
                        await respond(message, evade, false, event.shiftKey);
                    }
                    catch (error) {
                        ui.notifications.error(error.message);
                    }
                    finally {
                        buttons.forEach(b => b.disabled = false);
                    }
                });
                panel.append(button);
            }
            if (game.user.isGM && data.state === "waiting") {
                const cancel = document.createElement("button");
                cancel.dataset.gmOnly = "true";
                cancel.className = "pneuma-cancel-exchange";
                cancel.type = "button";
                cancel.textContent = "Отменить обмен";
                cancel.addEventListener("click", () => {
                    void request(message.id, "cancel").catch(error => ui.notifications.error(error.message));
                });
                panel.append(cancel);
            }
            const controls = html.find(".pneuma-pending-controls");
            (controls.length ? controls : html.find(".message-content")).append(panel);
        }).catch(error => console.warn(MODULE, error));
    });
}
