const M = "redline-combat";
export class NotificationSoundSettings extends FormApplication {
    constructor() { super({}); }
    static get defaultOptions() { return foundry.utils.mergeObject(super.defaultOptions, { title: "Индикатор хода — звуки", id: "pneuma-notification-sounds", width: 500, height: "auto", template: "modules/redline-combat/combat/templates/notification-sounds.hbs" }); }
    getData() {
        return { sounds: [
                { label: "Ваш ход", pathKey: "yourTurnSound", volumeKey: "yourTurnVolume", path: game.settings.get(M, "yourTurnSound"), volume: game.settings.get(M, "yourTurnVolume") }
            ] };
    }
    activateListeners(html) {
        super.activateListeners(html);
        html[0]?.querySelectorAll("[data-play-sound]").forEach(button => button.addEventListener("click", async () => {
            if (!game.user?.isGM)
                return;
            const row = button.closest("fieldset");
            const src = row.querySelector('input[type="text"]').value.trim();
            const volume = Number(row.querySelector('input[type="range"]').value);
            if (!src) {
                ui.notifications.warn("Выберите звуковой файл для прослушивания.");
                return;
            }
            button.disabled = true;
            try {
                await foundry.audio.AudioHelper.play({ src, volume: Math.min(1, Math.max(0, volume)), loop: false }, false);
            }
            catch (error) {
                ui.notifications.error("Не удалось воспроизвести звук: " + error.message);
            }
            finally {
                button.disabled = false;
            }
        }));
    }
    async _updateObject(_event, data) {
        if (!game.user?.isGM)
            throw Error("Настраивать звуки уведомлений может только Мастер.");
        for (const key of ["yourTurnSound"])
            await game.settings.set(M, key, String(data[key] ?? "").trim());
        for (const key of ["yourTurnVolume"]) {
            const volume = Number(data[key]);
            if (!Number.isFinite(volume))
                throw Error("Некорректная громкость.");
            await game.settings.set(M, key, Math.min(1, Math.max(0, volume)));
        }
    }
}
export function registerNotificationSoundSettings() {
    game.settings.registerMenu(M, "notificationSounds", { name: "Звук «Ваш ход»", label: "Настроить звук", hint: "Выберите звук хода, громкость и прослушайте у себя. Звуки всплывающих сообщений — в настройках Биомонитора.", icon: "fas fa-volume-high", type: NotificationSoundSettings, restricted: true });
}
