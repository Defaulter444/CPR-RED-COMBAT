/** Cyberpunk condition names/icons; legacy IDs retained for existing Condition Lab statuses.
 * Source: https://raw.githubusercontent.com/mclemente/fvtt-condition-lab-triggler/2.0.1/src/condition-maps/cyberpunk-red-core.json
 * Mechanical bindings use native system items, never copied modifier formulas. */
export interface StatusDefinition { id: string; name: string; img: string; group: "head" | "body" | "general" | "custom" | "pharma" | "drugs" | "addiction"; binding?: { kind: "injury" | "effect"; pack: string; itemId: string; itemName: string; effectNames?: string[] } }
export const masterStatuses: StatusDefinition[] = [
  {id:"pneuma-needs-stabilization",name:"Needs Stabilization",img:"icons/svg/regen.svg",group:"general"},
{
  "id": "pneuma-berserker-addiction",
  "name": "Berserker Addiction",
  "img": "systems/cyberpunk-red-core/icons/compendium/status/beserker_addiction.svg",
  "group": "addiction",
  "binding": {
    "kind": "effect",
    "pack": "cyberpunk-red-core.dlc_hornets-pharmacy",
    "itemId": "lzmfwfxPjDjYE1nM",
    "itemName": "Berserker",
    "effectNames": [
      "Berserker Addiction"
    ]
  }
},
{
  "id": "pneuma-prime-time-addiction",
  "name": "Prime Time Addiction",
  "img": "systems/cyberpunk-red-core/icons/compendium/status/prime_time_addiction.svg",
  "group": "addiction",
  "binding": {
    "kind": "effect",
    "pack": "cyberpunk-red-core.dlc_hornets-pharmacy",
    "itemId": "RZ7P9nSOB21pfiaI",
    "itemName": "Prime Time",
    "effectNames": [
      "Prime Time Addiction"
    ]
  }
},
{
  "id": "pneuma-sixgun-addiction",
  "name": "Sixgun Addiction",
  "img": "systems/cyberpunk-red-core/icons/compendium/status/sixgun_addiction.svg",
  "group": "addiction",
  "binding": {
    "kind": "effect",
    "pack": "cyberpunk-red-core.dlc_hornets-pharmacy",
    "itemId": "ka6ccQeTt7ud3pFi",
    "itemName": "Sixgun",
    "effectNames": [
      "Sixgun Addiction"
    ]
  }
},
{
  "id": "pneuma-timewarp-addiction",
  "name": "Timewarp Addiction",
  "img": "systems/cyberpunk-red-core/icons/compendium/status/timewarp_addiction.svg",
  "group": "addiction",
  "binding": {
    "kind": "effect",
    "pack": "cyberpunk-red-core.dlc_hornets-pharmacy",
    "itemId": "8nOTvNR4qZP54nKy",
    "itemName": "Timewarp",
    "effectNames": [
      "Timewarp Addiction"
    ]
  }
},
{
  "id": "pneuma-berserker",
  "name": "Berserker",
  "img": "systems/cyberpunk-red-core/icons/compendium/status/beserker.svg",
  "group": "drugs"
},
{
  "id": "pneuma-prime-time",
  "name": "Prime Time",
  "img": "systems/cyberpunk-red-core/icons/compendium/status/prime_time.svg",
  "group": "drugs",
  "binding": {
    "kind": "effect",
    "pack": "cyberpunk-red-core.dlc_hornets-pharmacy",
    "itemId": "RZ7P9nSOB21pfiaI",
    "itemName": "Prime Time",
    "effectNames": [
      "Prime Time"
    ]
  }
},
{
  "id": "pneuma-sedative",
  "name": "Sedative",
  "img": "systems/cyberpunk-red-core/icons/compendium/status/sedative.svg",
  "group": "pharma"
},
{
  "id": "pneuma-sixgun",
  "name": "Sixgun",
  "img": "systems/cyberpunk-red-core/icons/compendium/status/sixgun.svg",
  "group": "drugs",
  "binding": {
    "kind": "effect",
    "pack": "cyberpunk-red-core.dlc_hornets-pharmacy",
    "itemId": "ka6ccQeTt7ud3pFi",
    "itemName": "Sixgun",
    "effectNames": [
      "Sixgun Primary",
      "Sixgun Addiction Primary"
    ]
  }
},
{
  "id": "pneuma-timewarp",
  "name": "Timewarp",
  "img": "systems/cyberpunk-red-core/icons/compendium/status/timewarp.svg",
  "group": "drugs",
  "binding": {
    "kind": "effect",
    "pack": "cyberpunk-red-core.dlc_hornets-pharmacy",
    "itemId": "8nOTvNR4qZP54nKy",
    "itemName": "Timewarp",
    "effectNames": [
      "Timewarp Primary",
      "Timewarp Addiction Primary"
    ]
  }
},
{
  "id": "pneuma-veritas",
  "name": "Veritas",
  "img": "systems/cyberpunk-red-core/icons/compendium/status/veritas.svg",
  "group": "pharma",
  "binding": {
    "kind": "effect",
    "pack": "cyberpunk-red-core.dlc_hornets-pharmacy",
    "itemId": "2ea71NL50IBcCcJZ",
    "itemName": "Veritas",
    "effectNames": [
      "Veritas Primary"
    ]
  }
},
  {
    "id": "rlwo5d6rzwl5rnup",
    "name": "Brain Injury",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/brain_injury.svg",
    "group": "head",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-head",
      "itemId": "oi3MEn9Y8zdbooNe",
      "itemName": "Brain Injury"
    }
  },
  {
    "id": "1c511e8ffgka88s8",
    "name": "Broken Arm",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/broken_arm.svg",
    "group": "body",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-body",
      "itemId": "Y65igO9rtakP4qSs",
      "itemName": "Broken Arm"
    }
  },
  {
    "id": "6b8a18hfuncb852d",
    "name": "Broken Jaw",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/broken_jaw.svg",
    "group": "head",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-head",
      "itemId": "VWmTqmsW6S5v51FO",
      "itemName": "Broken Jaw"
    }
  },
  {
    "id": "j7kn9yowq85hgp0h",
    "name": "Broken Leg",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/broken_leg.svg",
    "group": "body",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-body",
      "itemId": "yBy9rlhgZeaWGtHh",
      "itemName": "Broken Leg"
    }
  },
  {
    "id": "l8m53qffuwmzidco",
    "name": "Broken Ribs",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/broken_ribs.svg",
    "group": "body",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-body",
      "itemId": "MQpiPgEtPaIe6MJ6",
      "itemName": "Broken Ribs"
    }
  },
  {
    "id": "ifnqllhgdsb6uvik",
    "name": "Collapsed Lung",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/collapsed_lung.svg",
    "group": "body",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-body",
      "itemId": "RAZcouFe0FS1VN1o",
      "itemName": "Collapsed Lung"
    }
  },
  {
    "id": "r8rypvez57qayd87",
    "name": "Concussion",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/concussion.svg",
    "group": "head",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-head",
      "itemId": "yyVVirrpH1O0DMYB",
      "itemName": "Concussion"
    }
  },
  {
    "id": "dn5kn3vv2w5ubbgd",
    "name": "Cracked Skull",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/cracked_skull.svg",
    "group": "head",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-head",
      "itemId": "jcOCxBFrKo5oBmOy",
      "itemName": "Cracked Skull"
    }
  },
  {
    "id": "ha81vqrxpyi7uoji",
    "name": "Crushed Fingers",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/crushed_fingers.svg",
    "group": "body",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-body",
      "itemId": "IKKcCgHU1lBJ4wVd",
      "itemName": "Crushed Fingers"
    }
  },
  {
    "id": "pchk7c8458idejld",
    "name": "Crushed Windpipe",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/crushed_windpipe.svg",
    "group": "head",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-head",
      "itemId": "mVE8ovTniNKFs9Y7",
      "itemName": "Crushed Windpipe"
    }
  },
  {
    "id": "mxc9c9eicoi9skk1",
    "name": "Damaged Ear",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/damaged_ear.svg",
    "group": "head",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-head",
      "itemId": "qRkCxq0KTuBnw2wj",
      "itemName": "Damaged Ear"
    }
  },
  {
    "id": "yta05y93xenyzrco",
    "name": "Damaged Eye",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/damaged_eye.svg",
    "group": "head",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-head",
      "itemId": "qoegLCfpEOQifeZq",
      "itemName": "Damaged Eye"
    }
  },
  {
    "id": "yayc4q2rzmofp27w",
    "name": "Dismembered Hand",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/dismembered_hand.svg",
    "group": "body",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-body",
      "itemId": "xmlFB3X2q2NAklfn",
      "itemName": "Dismembered Hand"
    }
  },
  {
    "id": "q9dsx9ocwnanvksd",
    "name": "Dismembered Leg",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/dismembered_leg.svg",
    "group": "body",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-body",
      "itemId": "vRhxMWgOHYROHeHm",
      "itemName": "Dismembered Leg"
    }
  },
  {
    "id": "3mjislz7ud67vuc2",
    "name": "Dismembered Arm",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/dismembered_arm.svg",
    "group": "body",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-body",
      "itemId": "9N6yHeVwiGg2MkeL",
      "itemName": "Dismembered Arm"
    }
  },
  {
    "id": "rd2fh4knrle6g0jb",
    "name": "Foreign Object (Body)",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/foreign_object_body.svg",
    "group": "body",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-body",
      "itemId": "xTQ2T50UGNY8DrHl",
      "itemName": "Foreign Object"
    }
  },
  {
    "id": "hi6fv5ley2vmw3js",
    "name": "Foreign Object (Head)",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/foreign_object_head.svg",
    "group": "head",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-head",
      "itemId": "xfzYp9N5c6jEKiBR",
      "itemName": "Foreign Object (H)"
    }
  },
  {
    "id": "f5pcs5mhpguz8ioz",
    "name": "Lost Ear",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/lost_ear.svg",
    "group": "head",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-head",
      "itemId": "q7yxRKUMzOf9o5qO",
      "itemName": "Lost Ear"
    }
  },
  {
    "id": "im7kok2vim8e8roc",
    "name": "Lost Eye",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/lost_eye.svg",
    "group": "head",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-head",
      "itemId": "vysFvuTpuG2aDDIz",
      "itemName": "Lost Eye"
    }
  },
  {
    "id": "f04iqysbe4tf0pjl",
    "name": "Spinal Injury",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/spinal_injury.svg",
    "group": "body",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-body",
      "itemId": "pQ2F7FsQvZJyZGXe",
      "itemName": "Spinal Injury"
    }
  },
  {
    "id": "gkd2d8obp14x7v3v",
    "name": "Torn Muscle",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/torn_muscle.svg",
    "group": "body",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-body",
      "itemId": "Z3iVuSFtma3Bx7SX",
      "itemName": "Torn Muscle"
    }
  },
  {
    "id": "63wi2ivkwfjom9xc",
    "name": "Whiplash",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/whiplash.svg",
    "group": "head",
    "binding": {
      "kind": "injury",
      "pack": "cyberpunk-red-core.core_critical-injuries-head",
      "itemId": "e5wyX6r4Tem6bNwQ",
      "itemName": "Whiplash"
    }
  },
  {
    "id": "wfw28h6jga0i8zgv",
    "name": "Blinded",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/blinded.svg",
    "group": "general"
  },
  {
    "id": "3i5twkh0722lw1bz",
    "name": "Choking 1",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/choking1.svg",
    "group": "general"
  },
  {
    "id": "8g65kc038fh7av9k",
    "name": "Choking 2",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/choking2.svg",
    "group": "general"
  },
  {
    "id": "i9lhfsg6nroemjmz",
    "name": "Cover",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/cover.svg",
    "group": "general"
  },
  {
    "id": "97lm663ujoiyi4ws",
    "name": "Deafened",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/deafened.svg",
    "group": "general"
  },
  {
    "id": "lmhs96pr253w90n4",
    "name": "Drowning",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/drowning.svg",
    "group": "general"
  },
  {
    "id": "3l6yrmvd37862mll",
    "name": "EMP",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/emp.svg",
    "group": "general"
  },
  {
    "id": "2qjqodwoik320rv0",
    "name": "Falling",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/falling.svg",
    "group": "general"
  },
  {
    "id": "977k9i8t8wr8aa6z",
    "name": "Grappled",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/grappled.svg",
    "group": "general"
  },
  {
    "id": "2mda0usivu7xim3a",
    "name": "Hidden",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/hidden.svg",
    "group": "general"
  },
  {
    "id": "vpl0b3fq6oblr3pp",
    "name": "Human Shield",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/human_shield.svg",
    "group": "general"
  },
  {
    "id": "qjcbxa38bqqz4lap",
    "name": "Netrunning",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/netrunning.svg",
    "group": "general"
  },
  {
    "id": "r4mbggwd1jmrvhjt",
    "name": "On Fire (Mild)",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/on_fire_mild.svg",
    "group": "general"
  },
  {
    "id": "y4y0rvsz17aj0r4g",
    "name": "On Fire (Strong)",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/on_fire_strong.svg",
    "group": "general"
  },
  {
    "id": "ss6oigx5fylz0luk",
    "name": "On Fire (Deadly)",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/on_fire_deadly.svg",
    "group": "general"
  },
  {
    "id": "e73pyhdrc41isg7f",
    "name": "Prone",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/prone.svg",
    "group": "general"
  },
  {
    "id": "qrncrx71vi0kvn12",
    "name": "Radiation (Low)",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/radiation_low.svg",
    "group": "general"
  },
  {
    "id": "vaciaiw08jooz1hf",
    "name": "Radiation (High)",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/radiation_high.svg",
    "group": "general"
  },
  {
    "id": "dhrzzu7ymy7u7mnc",
    "name": "Readied Action",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/readied_action.svg",
    "group": "general"
  },
  {
    "id": "pd7p69lbketdc8by",
    "name": "Suppressed",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/suppressed.svg",
    "group": "general"
  },
  {
    "id": "ryid3sas6sker81g",
    "name": "Antibiotics",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/antibiotics.svg",
    "group": "pharma"
  },
  {
    "id": "dx5p60wq8zh7owm1",
    "name": "Quick Fix",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/quickfix.svg",
    "group": "general"
  },
  {
    "id": "tv6gytm9auf2gme1",
    "name": "Rapidetox",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/rapiddetox.svg",
    "group": "pharma"
  },
  {
    "id": "fzy4hp04ibv72v7f",
    "name": "Speed Heal",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/speedheal.svg",
    "group": "pharma"
  },
  {
    "id": "a8tnrz5ivb76ikea",
    "name": "Stim",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/stim.svg",
    "group": "pharma",
    "binding": {
      "kind": "effect",
      "pack": "cyberpunk-red-core.core_drugs",
      "itemId": "r21n9rFplUOtnjHM",
      "itemName": "Stim",
      "effectNames": [
        "Stim"
      ]
    }
  },
  {
    "id": "54253hylkpdymvxl",
    "name": "Surge",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/surge.svg",
    "group": "pharma"
  },
  {
    "id": "idja1i8m5hhz8ama",
    "name": "Black Lace",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/black_lace.svg",
    "group": "drugs",
    "binding": {
      "kind": "effect",
      "pack": "cyberpunk-red-core.core_drugs",
      "itemId": "6BM5WFyCyIM8lZib",
      "itemName": "Black Lace",
      "effectNames": [
        "Black Lace Primary"
      ]
    }
  },
  {
    "id": "k0nv7f1qm82pj28q",
    "name": "Black Lace Addiction",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/black_lace_addiction.svg",
    "group": "addiction",
    "binding": {
      "kind": "effect",
      "pack": "cyberpunk-red-core.core_drugs",
      "itemId": "6BM5WFyCyIM8lZib",
      "itemName": "Black Lace",
      "effectNames": [
        "Black Lace Addiction"
      ]
    }
  },
  {
    "id": "ms4wgzm5hmji55py",
    "name": "Blue Glass",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/blue_glass.svg",
    "group": "drugs"
  },
  {
    "id": "bhl2fsrzn4or72f5",
    "name": "Blue Glass Addiction",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/blue_glass_addiction.svg",
    "group": "addiction"
  },
  {
    "id": "vc6wdch7hgjnyceg",
    "name": "Boost",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/boost.svg",
    "group": "drugs",
    "binding": {
      "kind": "effect",
      "pack": "cyberpunk-red-core.core_drugs",
      "itemId": "ut8jpew6V3q58ivX",
      "itemName": "Boost",
      "effectNames": [
        "Boost Primary"
      ]
    }
  },
  {
    "id": "y444oapg2pl9wiwk",
    "name": "Boost Addiction",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/boost_addiction.svg",
    "group": "addiction",
    "binding": {
      "kind": "effect",
      "pack": "cyberpunk-red-core.core_drugs",
      "itemId": "ut8jpew6V3q58ivX",
      "itemName": "Boost",
      "effectNames": [
        "Boost Addiction"
      ]
    }
  },
  {
    "id": "s2kb8cl4soikifa9",
    "name": "Smash",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/smash.svg",
    "group": "drugs",
    "binding": {
      "kind": "effect",
      "pack": "cyberpunk-red-core.core_drugs",
      "itemId": "PRLDaeBVeMuBBIeO",
      "itemName": "Smash",
      "effectNames": [
        "Smash Primary"
      ]
    }
  },
  {
    "id": "ed97q4btoj3ggpip",
    "name": "Smash Addiction",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/smash_addiciton.svg",
    "group": "addiction",
    "binding": {
      "kind": "effect",
      "pack": "cyberpunk-red-core.core_drugs",
      "itemId": "PRLDaeBVeMuBBIeO",
      "itemName": "Smash",
      "effectNames": [
        "Smash Addiction"
      ]
    }
  },
  {
    "id": "bsixucw55vezxc66",
    "name": "Synthcoke",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/synthcoke.svg",
    "group": "drugs",
    "binding": {
      "kind": "effect",
      "pack": "cyberpunk-red-core.core_drugs",
      "itemId": "CyYpPh89G7IYyryM",
      "itemName": "Synthcoke",
      "effectNames": [
        "Synthcoke Primary",
        "Synthcoke Addicted Primary"
      ]
    }
  },
  {
    "id": "xwk3lj08yk83j02b",
    "name": "Synthcoke Addiction",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/synthcoke_addiciton.svg",
    "group": "addiction",
    "binding": {
      "kind": "effect",
      "pack": "cyberpunk-red-core.core_drugs",
      "itemId": "CyYpPh89G7IYyryM",
      "itemName": "Synthcoke",
      "effectNames": [
        "Synthcoke Addiction"
      ]
    }
  },
  {
    "id": "r4kadyvk4trrgh8p",
    "name": "Unconscious",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/unconcious.svg",
    "group": "general"
  },
  {
    "id": "yv1wu4spb4e8ifln",
    "name": "Lightly Wounded",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/wounded_lightly.svg",
    "group": "general"
  },
  {
    "id": "7vks8vi85yhkf3qv",
    "name": "Seriously Wounded",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/wounded_seriously.svg",
    "group": "general"
  },
  {
    "id": "5q9esrzjvgqvppsq",
    "name": "Mortally Wounded",
    "img": "systems/cyberpunk-red-core/icons/compendium/status/wounded_mortally.svg",
    "group": "general"
  },
  {
    "id": "dead",
    "name": "Dead",
    "img": "icons/svg/skull.svg",
    "group": "general"
  }
];

/** Addiction survives automatic and manual status cleanup, including native variants. */
export function isAddictionEffect(effect:ActiveEffect):boolean {
  return /addiction/i.test(effect.name??"")||Array.from(effect.statuses).some(id=>/addiction/i.test(id)
    ||masterStatuses.some(status=>status.id===id&&/addiction/i.test(status.name)));
}
