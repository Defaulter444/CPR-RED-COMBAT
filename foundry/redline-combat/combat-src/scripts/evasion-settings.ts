export type EvasionQualifier = "disabled" | "eligible" | "free" | "stacking";
export type EvasionAllowance = "unlimited" | "limited" | "luckEach" | "luckAfterAllowance";
type Qualifier = { qualifies: boolean; free: boolean; stacks: boolean };
export interface EvasionHomebrew {
  reflex: Qualifier; coprocessor: Qualifier; solo: Qualifier;
  anyone?: Qualifier;
  rule: "flat" | "cumulative" | "luckEach" | "luckAfterFree" | "noAdditional";
  luckCost: number;
}

declare global {
  interface SettingConfig {
    "redline-combat.npcAutoEvasion": boolean;
    "redline-combat.evasionEligibility": "raw" | "none" | "custom";
    "redline-combat.evasionHomebrew": EvasionHomebrew | null;
    "redline-combat.evasionReflex": EvasionQualifier;
    "redline-combat.evasionCoprocessor": EvasionQualifier;
    "redline-combat.evasionSolo": EvasionQualifier;
    "redline-combat.evasionAllowance": EvasionAllowance;
    "redline-combat.evasionLuckCost": number;
    "redline-combat.evasionCumulativePenalty": boolean;
  }
}
const MODULE = "redline-combat";
const label = (key: string) => game.i18n!.localize("PNEUMA_COMBAT_TOOLS." + key);
const rows = ["reflex", "coprocessor", "solo", "anyone"] as const;
const rules = { flat: "EvasionRuleFlat", cumulative: "EvasionRuleCumulative",
  luckAfterFree: "EvasionRuleLuckAfterFree", noAdditional: "EvasionRuleNoAdditional" } as const;

function normalizeHomebrew(data: EvasionHomebrew): EvasionHomebrew {
  data = { ...data, anyone: data.anyone ?? { qualifies: false, free: false, stacks: false } };
  if (data.rule !== "luckEach") return data;
  // Legacy pay-every-time is equivalent to paid extras with no free grants.
  const clearFree = (qualifier: Qualifier) => ({ ...qualifier, free: false, stacks: false });
  return { ...data, rule: "luckAfterFree", reflex: clearFree(data.reflex),
    coprocessor: clearFree(data.coprocessor), solo: clearFree(data.solo), anyone: clearFree(data.anyone!) };
}

export function homebrew(): EvasionHomebrew {
  const saved = game.settings!.get(MODULE, "evasionHomebrew");
  if (saved) return normalizeHomebrew(saved);
  // Read the earlier draft settings until the new form is first saved.
  const qualifier = (value: EvasionQualifier): Qualifier => ({ qualifies: value !== "disabled",
    free: value === "free" || value === "stacking", stacks: value === "stacking" });
  const allowance = game.settings!.get(MODULE, "evasionAllowance");
  return normalizeHomebrew({
    reflex: qualifier(game.settings!.get(MODULE, "evasionReflex")),
    coprocessor: qualifier(game.settings!.get(MODULE, "evasionCoprocessor")),
    solo: qualifier(game.settings!.get(MODULE, "evasionSolo")),
    rule: allowance === "luckEach" ? "luckEach" : allowance === "luckAfterAllowance" ? "luckAfterFree"
      : game.settings!.get(MODULE, "evasionCumulativePenalty") ? "cumulative" : "flat",
    luckCost: game.settings!.get(MODULE, "evasionLuckCost"),
  });
}

class EvasionHomebrewForm extends FormApplication {
  constructor() { super({}); }
  static override get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "pneuma-evasion-homebrew", title: label("EvasionConfigure"), width: 610,
      template: "modules/" + MODULE + "/combat/templates/evasion-homebrew.hbs",
      closeOnSubmit: true,
    });
  }
  override getData() {
    const data = homebrew();
    return { rows: rows.map(key => ({ key, label: label("EvasionRow" + key), ...data[key] })),
      rules: Object.fromEntries(Object.entries(rules).map(([key, value]) => [key, label(value)])),
      rule: data.rule, luckCost: data.luckCost };
  }
  override activateListeners(html: JQuery) {
    super.activateListeners(html);
    for (const key of rows) {
      const qualifies = html.find<HTMLInputElement>(`[name="${key}.qualifies"]`);
      const free = html.find<HTMLInputElement>(`[name="${key}.free"]`);
      const stacks = html.find<HTMLInputElement>(`[name="${key}.stacks"]`);
      const syncRow = () => {
        const canGrantFree = qualifies.prop("checked");
        if (!canGrantFree) free.prop("checked", false);
        free.prop("disabled", !canGrantFree);
        const canStack = canGrantFree && free.prop("checked");
        if (!canStack) stacks.prop("checked", false);
        stacks.prop("disabled", !canStack);
      };
      qualifies.on("change", syncRow);
      free.on("change", syncRow);
      syncRow();
    }
    const select = html.find<HTMLSelectElement>('[name="rule"]');
    const sync = () => html.find('[name="luckCost"]').prop("disabled", select.val() !== "luckAfterFree");
    select.on("change", sync);
    sync();
  }
  protected override async _updateObject(_event: Event, data: Record<string, unknown>) {
    if (!game.user!.isGM) return;
    const rule = String(data.rule);
    if (!Object.hasOwn(rules, rule)) throw new Error("Некорректное правило уклонения");
    const luckCost = rule === "luckAfterFree" ? Number(data.luckCost) : homebrew().luckCost;
    if (!Number.isInteger(luckCost) || luckCost < 1) throw new Error(label("EvasionLuckInvalid"));
    const qualifiers = Object.fromEntries(rows.map(key => [key, {
      qualifies: !!data[key + ".qualifies"],
      free: !!data[key + ".qualifies"] && !!data[key + ".free"],
      stacks: !!data[key + ".qualifies"] && !!data[key + ".free"] && !!data[key + ".stacks"],
    }])) as Pick<EvasionHomebrew, typeof rows[number]>;
    await game.settings!.set(MODULE, "evasionHomebrew", {
      ...qualifiers, rule: rule as EvasionHomebrew["rule"], luckCost,
    });
  }
}

/** Shared settings for Combat Tools ranged-evasion resolution. */
export function automaticNPCEvasion(actor:Actor):boolean {
  return !!game.settings!.get(MODULE,"npcAutoEvasion")&&game.settings!.get(MODULE,"evasionEligibility")==="raw"&&!actor.hasPlayerOwner;
}
export function registerEvasionSettings() {
  game.settings!.register(MODULE,"npcAutoEvasion",{name:"Автоматическое уклонение НПС (только по базовым правилам)",hint:"Подходящие НПС бросают без диалога Мастера. Не работает с домашним уклонением; для атак по площади нужны право на уклонение по правилам, отсутствие штрафов, платы движением и укрытия.",scope:"world",config:true,type:Boolean,default:false});
  game.settings!.register(MODULE, "evasionEligibility", {
    scope: "world", config: true, name: "PNEUMA_COMBAT_TOOLS.EvasionEligibilityName",
    hint: "PNEUMA_COMBAT_TOOLS.EvasionEligibilityHint", type: String, default: "raw",
    choices: { raw: "PNEUMA_COMBAT_TOOLS.EvasionEligibilityRAW", none: "PNEUMA_COMBAT_TOOLS.EvasionEligibilityNone", custom: "PNEUMA_COMBAT_TOOLS.EvasionHomebrewLabel" },
  });
  game.settings!.register(MODULE, "evasionHomebrew", {
    scope: "world", config: false, default: null,
    // @ts-expect-error Foundry v12 supports DataField settings; pinned typings omit this overload.
    type: new foundry.data.fields.ObjectField({ nullable: true, initial: null }),
  });
  game.settings!.registerMenu(MODULE, "configureEvasion", {
    name: "PNEUMA_COMBAT_TOOLS.EvasionConfigure", label: "PNEUMA_COMBAT_TOOLS.EvasionHomebrewLabel",
    hint: "", icon: "fas fa-sliders", type: EvasionHomebrewForm, restricted: true,
  });
  // Preserve previously saved draft values without displaying the old controls.
  for (const [key, defaultValue] of [["evasionReflex", "free"], ["evasionCoprocessor", "free"],
    ["evasionSolo", "disabled"], ["evasionAllowance", "unlimited"]] as const) {
    game.settings!.register(MODULE, key, { scope: "world", config: false, type: String, default: defaultValue });
  }
  game.settings!.register(MODULE, "evasionLuckCost", { scope: "world", config: false, type: Number, default: 1 });
  for (const key of ["evasionCumulativePenalty"] as const) {
    game.settings!.register(MODULE, key, { scope: "world", config: false, type: Boolean, default: false });
  }
  Hooks.on("renderSettingsConfig", (_app: SettingsConfig, html: JQuery) => {
    const select = html.find<HTMLSelectElement>('[name="redline-combat.evasionEligibility"]');
    const button = html.find<HTMLButtonElement>('button[data-key="redline-combat.configureEvasion"]');
    if (!select.length || !button.length) return;
    if (!select.parent().hasClass("pneuma-evasion-controls")) {
      const menuRow = button.closest(".form-group");
      select.wrap('<div class="form-fields pneuma-evasion-controls"></div>');
      select.parent().append(button);
      if (menuRow[0] !== select.closest(".form-group")[0]) menuRow.remove();
    }
    const sync = () => {
      button.prop("disabled", select.val() !== "custom" || !game.user!.isGM);
      html.find('[name="redline-combat.npcAutoEvasion"]').prop("disabled",select.val()!=="raw");
    };
    select.on("change", sync);
    sync();
  });
}
