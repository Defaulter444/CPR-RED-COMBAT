/** Russian display names for status, injury and instant-effect identities. Stored names stay English: they are lookup keys. */
const LABELS = {
    "Needs Stabilization": "Нужна стабилизация", "Unconscious": "Без сознания", "Dead": "Мёртв",
    "Lightly Wounded": "Лёгкое ранение", "Seriously Wounded": "Серьёзное ранение", "Mortally Wounded": "При смерти",
    "Berserker": "Берсерк", "Berserker Addiction": "Зависимость от Берсерка", "Prime Time": "Прайм-тайм", "Prime Time Addiction": "Зависимость от Прайм-тайма",
    "Sixgun": "Шестизарядник", "Sixgun Addiction": "Зависимость от Шестизарядника", "Timewarp": "Таймворп", "Timewarp Addiction": "Зависимость от Таймворпа",
    "Black Lace": "Чёрное кружево", "Black Lace Addiction": "Зависимость от Чёрного кружева", "Blue Glass": "Голубое стекло", "Blue Glass Addiction": "Зависимость от Голубого стекла",
    "Boost": "Буст", "Boost Addiction": "Зависимость от Буста", "Smash": "Смэш", "Smash Addiction": "Зависимость от Смэша",
    "Synthcoke": "Синтококаин", "Synthcoke Addiction": "Зависимость от Синтококаина", "Sedative": "Седативное", "Veritas": "Веритас",
    "Antibiotics": "Антибиотики", "Quick Fix": "Быстрое лечение", "Rapidetox": "Рапидетокс", "Speed Heal": "Ускоренное заживление", "Stim": "Стимулятор", "Surge": "Сёрдж",
    "Brain Injury": "Травма мозга", "Broken Arm": "Сломанная рука", "Broken Jaw": "Сломанная челюсть", "Broken Leg": "Сломанная нога", "Broken Ribs": "Сломанные рёбра",
    "Collapsed Lung": "Пробитое лёгкое", "Concussion": "Сотрясение", "Cracked Skull": "Треснувший череп", "Crushed Fingers": "Раздробленные пальцы", "Crushed Windpipe": "Раздавленная трахея",
    "Damaged Ear": "Повреждённое ухо", "Damaged Eye": "Повреждённый глаз", "Dismembered Arm": "Потерянная рука", "Dismembered Hand": "Потерянная кисть", "Dismembered Leg": "Потерянная нога",
    "Foreign Object (Body)": "Инородный предмет (тело)", "Foreign Object (Head)": "Инородный предмет (голова)", "Lost Ear": "Потерянное ухо", "Lost Eye": "Потерянный глаз",
    "Spinal Injury": "Травма позвоночника", "Torn Muscle": "Разрыв мышцы", "Whiplash": "Хлыстовая травма",
    "Blinded": "Ослеплён", "Choking 1": "Удушье 1", "Choking 2": "Удушье 2", "Cover": "Укрытие", "Deafened": "Оглушён", "Drowning": "Тонет", "Falling": "Падает",
    "Grappled": "В захвате", "Hidden": "Скрыт", "Human Shield": "Живой щит", "Netrunning": "Нетраннинг", "Prone": "Лёжа", "Readied Action": "Подготовленное действие", "Suppressed": "Подавлен",
    "On Fire (Mild)": "Горит (слабо)", "On Fire (Strong)": "Горит (сильно)", "On Fire (Deadly)": "Горит (смертельно)", "Radiation (Low)": "Радиация (слабая)", "Radiation (High)": "Радиация (сильная)",
    "EMP": "ЭМИ", "EMP (Microwaver)": "ЭМИ (микроволновик)", "In Jail": "В тюрьме", "Smoke": "Дым", "Poison": "Яд", "Biotoxin": "Биотоксин", "Flashbang": "Светошумовая",
    "Sleep": "Сон", "Teargas": "Слезоточивый газ", "Incendiary": "Зажигательные", "Smart": "Умные", "Slow": "Замедление", "Impair Movement": "Блокировка движения",
    "Armor-Piercing": "Бронебойные", "Expansive": "Экспансивные", "Rubber": "Резиновые", "Basic": "Обычные",
};
export function statusLabel(name) {
    const key = String(name ?? "");
    return LABELS[key] ?? (key.startsWith("Quick Fix — ") ? "Быстрое лечение — " + key.slice(12) : key);
}
