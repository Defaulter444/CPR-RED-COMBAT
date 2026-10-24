import { quickhackAssetPath } from "./asset-paths.js";
import { tokenEncounter, encounterRef, resolveEncounter } from "../encounter.js";
import { requireCombatSocket } from "../socket-health.js";
import { showSavedDice, messageDiceAudience } from "../native-combat.js";
import { availableQuickhacks, quickhackId, MODULE } from "./availability.js";
import { getQuickhack } from "./catalog.js";
import { enabled, label, mode, routing } from "./settings.js";
import { roleFor, canOperate, criticalD10, gmAudience, nativeQuickhackRoll, publicAudience } from "./rolls.js";
import { escapeHTML, postResult } from "./messages.js";
import { isQuickhackSuccessful, isQuickhackTargetAlerted, isTargetAware, isWithinJackInRange } from "./rules.js";
import { resolveJackInRouting, resolveQuickhackRouting } from "./routing-config.js";
import { requestEffect } from "./effects.js";
import { activeConnection, establishConnection, isEjected } from "./connections.js";
import { hasQuickhackSight } from "./sight.js";
import { selfIce } from "./self-ice.js";
export const actorQuickhacks = (actor) => {
    const items = [...actor.items];
    return availableQuickhacks(items, mode(), enabled()).map(hack => ({
        ...hack, img: quickhackAssetPath(items.find(item => quickhackId(item) === hack.id && item.img)?.img)
            ?? quickhackAssetPath([...game.items ?? []].find(item => quickhackId(item) === hack.id && item.img)?.img)
            ?? `modules/${MODULE}/combat/styles/quickhacks/${hack.id}-gray.png`,
    }));
};
export function validTokens(source, target) {
    if (!enabled() || !source.actor || !target.actor || ["container", "blackIce", "demon"].includes(String(source.actor.type)) || ["container", "blackIce", "demon"].includes(String(target.actor.type)) || !canOperate(source.actor)
        || source === target || !target.isVisible || !roleFor(source.actor)
        || canvas.tokens?.get(source.id) !== source || canvas.tokens?.get(target.id) !== target)
        return false;
    const distance = Number(canvas.scene?.grid.distance);
    if (!(distance > 0) || !canvas.grid)
        return false;
    return isWithinJackInRange(canvas.grid.measurePath([source.center, target.center], {}).distance / distance);
}
const pending = new Set();
export async function executeQuickhack(source, target, id, skipDialog = false) {
    try {
        requireCombatSocket();
    }
    catch (error) {
        ui.notifications.error(error.message);
        return;
    }
    if (!validTokens(source, target)) {
        if (enabled())
            ui.notifications.warn("Для квикхака нужен свой токен нетраннера и другая видимая цель не дальше 25 клеток.");
        return;
    }
    if (!hasQuickhackSight(source, target)) {
        ui.notifications.warn("Для подключения и квикхака нужна линия видимости до цели.");
        return;
    }
    const actor = source.actor;
    if (pending.has(actor.uuid))
        return;
    let combat;
    try {
        combat = tokenEncounter(source.document.parent?.id, [source.document.uuid, target.document.uuid]);
    }
    catch (error) {
        ui.notifications.error(error.message);
        return;
    }
    const encounter = encounterRef(combat, source.document.parent?.id, [source.document.uuid, target.document.uuid]);
    const connection = activeConnection(actor, target.actor.uuid, undefined, combat);
    if (id === "jack-in" && isEjected(actor, target.actor.uuid, combat)) {
        ui.notifications.warn("Выброшен: в этом бою к этой цели подключиться снова нельзя.");
        return;
    }
    if (id !== "jack-in" && !connection) {
        ui.notifications.warn("Нужно активное подключение к этой цели. Начните бой, чтобы отслеживать подключения.");
        return;
    }
    if (id === "jack-in" && connection) {
        ui.notifications.info("Вы уже подключены к этой цели.");
        return;
    }
    if (combat && id === "jack-in" && !game.users.some(user => user.isGM && user.active)) {
        ui.notifications.warn("Для учёта подключений нужен активный Мастер.");
        return;
    }
    const connectionId = connection?.id;
    const breachCleared = connection?.breachCleared ?? 0;
    const ice = selfIce(target.actor, breachCleared);
    const breach = id === "breach";
    if (id !== "jack-in" && !breach && ice.blocked) {
        ui.notifications.warn("Перед квикхаком взломайте все Passwall собственного ЛЬДА цели.");
        return;
    }
    if (breach && !ice.blocked) {
        ui.notifications.info("Passwall не осталось.");
        return;
    }
    const hack = getQuickhack(id);
    if (id !== "jack-in" && !breach && (!hack || !actorQuickhacks(actor).some(entry => entry.id === id))) {
        ui.notifications.warn("В текущем режиме правил этот квикхак недоступен.");
        return;
    }
    pending.add(actor.uuid);
    try {
        const combatUuid = combat?.uuid;
        const valid = () => {
            if (resolveEncounter(encounter)?.uuid !== combatUuid || !validTokens(source, target) || !hasQuickhackSight(source, target))
                return false;
            if (id === "jack-in")
                return !isEjected(actor, target.actor.uuid, combat);
            const current = activeConnection(actor, target.actor.uuid, connectionId, combat);
            if (!current)
                return false;
            const currentIce = selfIce(target.actor, current.breachCleared ?? 0);
            if (breach)
                return currentIce.blocked && (current.breachCleared ?? 0) === breachCleared && currentIce.dv === ice.dv;
            return !currentIce.blocked && actorQuickhacks(actor).some(entry => entry.id === id);
        };
        const role = roleFor(actor);
        if (!Number.isFinite(Number(foundry.utils.getProperty(role, "system.rank"))))
            throw new Error(label("Error.InterfaceUnreadable", { actor: actor.name }));
        const roll = await nativeQuickhackRoll(actor, role, breach ? `Взлом Passwall · DV${ice.dv} · 1 сетевое действие` : hack ? `${hack.name} · DV${hack.dv}` : label("Roll.JackInCardTitle"), actor.hasPlayerOwner ? publicAudience() : gmAudience(), valid, source, false, skipDialog, false);
        if (!roll || !valid())
            return;
        const scenario = { sourceIsPlayer: actor.hasPlayerOwner, targetIsPlayer: target.actor.hasPlayerOwner };
        const base = { ...encounter, combatUuid, sourceActorUuid: actor.uuid, targetActorUuid: target.actor.uuid,
            sourceTokenUuid: source.document.uuid, targetTokenUuid: target.document.uuid };
        if (breach) {
            const success = isQuickhackSuccessful(roll.total, ice.dv);
            const data = { ...base, type: "breach", connectionId,
                breachCleared, success, alerted: false, audience: actor.hasPlayerOwner ? "sourceOwners" : "gm", revealAttacker: true };
            const message = await postResult(source, target, data, `Взлом Passwall · DV${ice.dv}`, success ? "Passwall взломан" : "Взлом не удался", `<p>1 сетевое действие — потратьте вручную. ${ice.cleared + (success ? 1 : 0)}/${ice.walls} Passwall пройдено.</p>`, roll.content);
            if (message && valid())
                await establishConnection(message);
            if (message && actor.hasPlayerOwner && !message.blind)
                void showSavedDice(roll.dice, "roll", roll.roller, messageDiceAudience(message)).catch(error => console.warn(MODULE, "QuickHack dice display failed", error));
        }
        else if (hack) {
            const success = isQuickhackSuccessful(roll.total, hack.dv);
            const alreadyAware = !!connection?.awareness?.alerted;
            const alerted = alreadyAware || isQuickhackTargetAlerted({ success, silentOnSuccess: hack.silentOnSuccess, targetIsPlayer: scenario.targetIsPlayer });
            const route = resolveQuickhackRouting(routing(), scenario);
            const data = { ...base, type: "quickhack", connectionId: connection?.id, quickhackId: hack.id, success, alerted, ...route };
            const detail = (route.showInterfaceTotal ? `<p>${label("Quickhack.InterfaceSummary", { interface: roll.total })}</p>` : "")
                + `<p>${label(alerted ? "Quickhack.AwarenessShort" : "Quickhack.UnawareShort", { target: escapeHTML(target.name) })}</p>`;
            const message = await postResult(source, target, data, `${hack.name} · DV${hack.dv}`, label(success ? "Quickhack.SuccessShort" : "Quickhack.FailureShort"), detail, roll.content);
            if (message && combatUuid)
                await establishConnection(message);
            if (message && success && valid())
                await requestEffect(message);
            if (message && actor.hasPlayerOwner && !message.blind)
                void showSavedDice(roll.dice, "roll", roll.roller, messageDiceAudience(message)).catch(error => console.warn(MODULE, "QuickHack dice display failed", error));
        }
        else {
            const automatic = !!roleFor(target.actor);
            const will = Number(foundry.utils.getProperty(target.actor, "system.stats.will.value"));
            if (!automatic && !Number.isFinite(will))
                throw new Error(label("Error.TargetWillUnreadable", { actor: target.actor.name }));
            const willTotal = automatic ? 0 : will + await criticalD10();
            if (!valid())
                return;
            const alerted = automatic || isTargetAware(roll.total, willTotal);
            const route = resolveJackInRouting(routing(), { ...scenario, targetAware: alerted });
            const data = { ...base, type: "jackIn", success: !alerted, alerted, ...route };
            const message = await postResult(source, target, data, label("Roll.JackInCardTitle"), label(alerted ? "Result.DetectedShort" : "Result.UndetectedShort"), route.showTotals ? `<p>${label("Result.ContestSummary", { interface: roll.total, will: automatic ? label("Result.Automatic") : willTotal })}</p>` : "", roll.content);
            if (combatUuid && message && valid())
                await establishConnection(message);
            if (message && actor.hasPlayerOwner && !message.blind)
                void showSavedDice(roll.dice, "roll", roll.roller, messageDiceAudience(message)).catch(error => console.warn(MODULE, "QuickHack dice display failed", error));
        }
    }
    catch (error) {
        console.error(MODULE, error);
        ui.notifications.error(error instanceof Error ? error.message : "Квикхак не удался.");
    }
    finally {
        pending.delete(actor.uuid);
    }
}
