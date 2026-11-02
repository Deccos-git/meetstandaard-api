import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAMETERS_2026_1, PARAMETERS_2026_2, PARAMETERS_2026_3 } from "./arbeidsparticipatie.js";

// Reproduce the consumer's documented calculation.
const grossIncome = (p, education, hoursBand) =>
  p.incomeByEducationAndHoursBand[education][hoursBand];

const progressiveTax = (p, income) => {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of p.taxBrackets) {
    const ceiling = upTo === null ? Infinity : upTo;
    if (income <= lower) break;
    const taxable = Math.min(income, ceiling) - lower;
    tax += taxable * rate;
    lower = ceiling;
  }
  return tax;
};

// From the "Output Participatieladder" sheet:
// Werk / "12 tot 20 uur per week" / employability 0.5 / "Geen startkwalificatie"
test("validation example reproduces 7500 / 5362.5 / 12862.5", () => {
  const p = PARAMETERS_2026_1;
  const gross = grossIncome(p, "Geen startkwalificatie", "12 tot 20 uur per week");
  const employability = 0.5;

  const incomePerson = gross * employability;
  const incomeTax = progressiveTax(p, gross);
  const total = incomePerson + incomeTax;

  assert.equal(gross, 15000);
  assert.equal(incomePerson, 7500);
  assert.equal(incomeTax, 5362.5);
  assert.equal(total, 12862.5);
});

// Key strings are the contract — the consumer does dictionary lookups on them.
test("contract key strings match exactly", () => {
  const p = PARAMETERS_2026_1;

  assert.deepEqual(Object.keys(p.incomeByEducationAndHoursBand), [
    "Geen startkwalificatie",
    "MBO 2-4/havovwo",
    "HBO/WO",
  ]);

  assert.deepEqual(Object.keys(p.incomeByEducationAndHoursBand["Geen startkwalificatie"]), [
    "minder dan 12 uur per week",
    "12 tot 20 uur per week",
    "20 tot 35 uur per week",
    "Voltijd",
  ]);

  assert.deepEqual(p.options.hoursBand, [
    "minder dan 12 uur per week",
    "12 tot 20 uur per week",
    "20 tot 35 uur per week",
    "Voltijd",
  ]);

  assert.deepEqual(p.options.educationLevel, [
    "Geen startkwalificatie",
    "MBO 2-4/havovwo",
    "HBO/WO",
  ]);

  assert.deepEqual(p.options.benefitType, ["Geen", "Bijstandsuitkering", "WAO/WIA/WAZ/WAJONG"]);

  // Costs are negative; no-ceiling bracket is null (never Infinity).
  assert.ok(p.benefitAmountPerYear.Bijstandsuitkering < 0);
  assert.ok(p.bijstandUitvoeringskostenPerYear < 0);
  assert.equal(p.taxBrackets[p.taxBrackets.length - 1].upTo, null);
});

// Every bron reference must resolve to a defined entry in `bronnen`, otherwise a
// frontend would render dangling citations.
test("every bron reference resolves to a bronnen entry", () => {
  const p = PARAMETERS_2026_1;
  const known = new Set(Object.keys(p.bronnen));

  // bronnen entries are self-consistent (key === id).
  for (const [key, b] of Object.entries(p.bronnen)) {
    assert.equal(key, b.id, `bronnen key ${key} must match its id`);
  }

  const refs = [];
  for (const lvl of p.ladderLevels) refs.push(...lvl.sources);
  refs.push(...p.sourceRefs.incomeByEducationAndHoursBand);
  refs.push(...p.sourceRefs.bijstandUitvoeringskostenPerYear);
  for (const ids of Object.values(p.sourceRefs.benefitAmountPerYear)) refs.push(...ids);

  for (const id of refs) {
    assert.ok(known.has(id), `unknown bron id referenced: ${id}`);
  }
});

// Ladder breakdowns, when present, must sum to the stated valuation.
test("ladder breakdowns sum to the trede valuation", () => {
  for (const lvl of PARAMETERS_2026_1.ladderLevels) {
    if (!lvl.breakdown) continue;
    const sum = Object.values(lvl.breakdown).reduce((a, b) => a + b, 0);
    assert.equal(sum, lvl.valuePerYear, `trede ${lvl.trede} breakdown must sum to valuePerYear`);
  }
});

// --- 2026.2: gedeeltelijke bijstand naast werk ---

const benefitCost = (p, benefitType, share) => {
  if (benefitType === "Geen") return 0;
  const factor = p.benefitRules.shareAppliesTo.includes(benefitType) ? share : 1;
  const uitvoering = benefitType === "Bijstandsuitkering" ? p.bijstandUitvoeringskostenPerYear : 0;
  return p.benefitAmountPerYear[benefitType] * factor + uitvoering;
};

test("2026.2 laat alle bedragen van 2026.1 ongemoeid", () => {
  const { meta: _a, options: _b, benefitRules, ...rest2 } = PARAMETERS_2026_2;
  const { meta: _c, options: _d, ...rest1 } = PARAMETERS_2026_1;
  assert.deepEqual(rest2, rest1);
  assert.ok(benefitRules);
  assert.equal(PARAMETERS_2026_1.meta.version, "2026.1");
  assert.equal(PARAMETERS_2026_1.options.benefitShare, undefined);
  assert.equal(PARAMETERS_2026_2.meta.version, "2026.2");
});

test("2026.2 vraagt de uitkering ook bij werk", () => {
  const p = PARAMETERS_2026_2;
  assert.deepEqual(p.options.benefitShare, [1, 0.75, 0.5, 0.25]);
  assert.ok(p.benefitRules.askedForMainActivity.includes("Werk"));
  assert.deepEqual(p.benefitRules.askedForMainActivity, p.options.mainActivity);
  for (const t of p.benefitRules.shareAppliesTo) assert.ok(p.options.benefitType.includes(t));
});

test("halve bijstand naast werk kost de helft van de norm plus volledige uitvoering", () => {
  const p = PARAMETERS_2026_2;
  assert.equal(benefitCost(p, "Bijstandsuitkering", 1), -18768 - 2900);
  assert.equal(benefitCost(p, "Bijstandsuitkering", 0.5), -9384 - 2900);
  // Arbeidsongeschiktheid: het UWV-gemiddelde bevat al gedeeltelijke uitkeringen.
  assert.equal(benefitCost(p, "WAO/WIA/WAZ/WAJONG", 0.5), -21123);
});

// --- 2026.3: het rekenmodel van de kennisbank ---

// Reference implementation of `calculation.steps`, reading only the parameters.
// It mirrors situatie(), vrije_tijd() and posten() in the MSI rekenmodel
// (sectoren/arbeidsparticipatie/output/build/bouw_outputmeting.py). The expected
// posten below were computed by that model itself (2026-11-02), not by this code.
const algemeneHeffingskorting = (p, inkomen) => {
  const { max, afbouwVanaf, afbouwPercentage } = p.taxCredits.algemeneHeffingskorting;
  return Math.max(0, max - Math.max(0, inkomen - afbouwVanaf) * afbouwPercentage);
};

const arbeidskorting = (p, loon) => {
  const schijf = p.taxCredits.arbeidskorting.find(({ upTo }) => upTo === null || loon <= upTo);
  return Math.max(0, schijf.base + schijf.rate * (loon - schijf.from));
};

const beroepsniveau = (p, opleiding) => p.options.educationLevel.indexOf(opleiding);

const loonwinst = (p, opleiding, doel) => {
  if (!doel) return 0;
  const { targetLevel, successRate, hoursBand } = p.wageGainFromEducation;
  const niveau = targetLevel[doel];
  if (beroepsniveau(p, niveau) <= beroepsniveau(p, opleiding)) return 0;
  const loon = p.incomeByEducationAndHoursBand;
  return successRate[niveau] * (loon[niveau][hoursBand] - loon[opleiding][hoursBand]);
};

const situatie = (
  p,
  { werk, opleiding = "Geen startkwalificatie", inzetbaar = 1, uitkering, vrijwilligersuren = 0, lks = false, dagbesteding, dagdelen = 0, opleidingDoel }
) => {
  const loon = werk ? p.incomeByEducationAndHoursBand[opleiding][werk] * inzetbaar : 0;
  let uit = uitkering ? -p.benefitAmountPerYear[uitkering] : 0;
  if (werk && uit) uit = Math.max(0, uit - loon);
  const totaal = loon + uit;
  const belasting = Math.max(
    0,
    progressiveTax(p, totaal) - algemeneHeffingskorting(p, totaal) - (loon ? arbeidskorting(p, loon) : 0)
  );
  const dag = dagbesteding ? p.dagbestedingPerDagdeel[dagbesteding] : null;
  return {
    loon,
    uitkering: uit,
    uitkeringPayer: uit ? p.benefitPayer[uitkering] : null,
    belasting,
    deelnemerNetto: loon + uit - belasting,
    uitvoering: uit && uitkering === "Bijstandsuitkering" ? -p.bijstandUitvoeringskostenPerYear : 0,
    lks: lks ? -p.loonkostensubsidiePerYear : 0,
    dagbesteding: dag ? -dag.amount * dagdelen * p.weeksPerYear : 0,
    dagbestedingPayer: dag ? dag.payer : null,
    vrijwilligerswerk: vrijwilligersuren * p.weeksPerYear * p.volunteerValuePerHour,
    loonwinst: loonwinst(p, opleiding, opleidingDoel),
  };
};

const vrijeTijd = (p, a, b) => {
  const dLoon = b.loon - a.loon;
  if (Math.abs(dLoon) < 0.5) return 0;
  const f = !a.loon && dLoon > 0 ? p.freeTime.factorEntrant : p.freeTime.factorExtraHours;
  const dUitkering = a.uitkering - b.uitkering;
  const dNetto = b.deelnemerNetto - a.deelnemerNetto + dUitkering;
  return dLoon > 0 ? -Math.max(0, f * dNetto - dUitkering) : Math.max(0, f * -dNetto + dUitkering);
};

// [stakeholder, post, verschil]; typeWaardering and overdracht come from p.posts.
const posten = (p, a, b) => {
  const rijen = [
    ["Deelnemer", "Bruto loon", b.loon - a.loon],
    ["Deelnemer", "Verwachte loonwinst na opleiding", b.loonwinst - a.loonwinst],
    ["Deelnemer", "Belasting en premies", -(b.belasting - a.belasting)],
    ["Deelnemer", "Uitkering", b.uitkering - a.uitkering],
    ["Deelnemer", "Opgegeven vrije tijd", vrijeTijd(p, a, b)],
    ["Rijk", "Belasting en premies", b.belasting - a.belasting],
  ];
  const perPayer = (veld, payer) => {
    const som = new Map();
    for (const [m, teken] of [[a, 1], [b, -1]]) {
      if (m[payer]) som.set(m[payer], (som.get(m[payer]) ?? 0) + teken * m[veld]);
    }
    return [...som];
  };
  for (const [sh, w] of perPayer("uitkering", "uitkeringPayer")) rijen.push([sh, "Uitkering", w]);
  rijen.push(["Gemeente", "Uitvoeringskosten bijstand", a.uitvoering - b.uitvoering]);
  rijen.push(["Gemeente", "Loonkostensubsidie", a.lks - b.lks]);
  rijen.push(["Werkgever", "Loonkostensubsidie", b.lks - a.lks]);
  for (const [sh, w] of perPayer("dagbesteding", "dagbestedingPayer")) rijen.push([sh, "Dagbesteding", w]);
  rijen.push([p.volunteerValueStakeholder, "Vrijwilligerswerk", b.vrijwilligerswerk - a.vrijwilligerswerk]);
  return rijen.filter(([, , w]) => Math.abs(w) >= 0.5);
};

const postType = (p, sh, post) => {
  const kandidaten = p.posts.filter((x) => x.post === post);
  return kandidaten.find((x) => x.stakeholder === sh) ?? kandidaten.find((x) => !p.calculation.stakeholders.includes(x.stakeholder));
};

const CASES = [
  {
    "naam": "bijstand naar voltijd werk mbo",
    "t0": {
      "opleiding": "MBO 2-4/havovwo",
      "uitkering": "Bijstandsuitkering"
    },
    "t1": {
      "werk": "Voltijd",
      "opleiding": "MBO 2-4/havovwo",
      "uitkering": "Bijstandsuitkering"
    },
    "posten": [
      [
        "Deelnemer",
        "Bruto loon",
        "direct financieel",
        false,
        42682.0
      ],
      [
        "Deelnemer",
        "Belasting en premies",
        "direct financieel",
        true,
        -3817.98
      ],
      [
        "Deelnemer",
        "Uitkering",
        "direct financieel",
        true,
        -18768.0
      ],
      [
        "Deelnemer",
        "Opgegeven vrije tijd",
        "niet-financieel",
        false,
        -8436.81
      ],
      [
        "Rijk",
        "Belasting en premies",
        "direct financieel",
        true,
        3817.98
      ],
      [
        "Gemeente",
        "Uitkering",
        "direct financieel",
        true,
        18768.0
      ],
      [
        "Gemeente",
        "Uitvoeringskosten bijstand",
        "direct financieel",
        false,
        3500.0
      ]
    ]
  },
  {
    "naam": "bijstand naar 12-20 uur met aanvulling",
    "t0": {
      "uitkering": "Bijstandsuitkering"
    },
    "t1": {
      "werk": "12 tot 20 uur per week",
      "uitkering": "Bijstandsuitkering"
    },
    "posten": [
      [
        "Deelnemer",
        "Bruto loon",
        "direct financieel",
        false,
        14061.0
      ],
      [
        "Deelnemer",
        "Belasting en premies",
        "direct financieel",
        true,
        1645.95
      ],
      [
        "Deelnemer",
        "Uitkering",
        "direct financieel",
        true,
        -14061.0
      ],
      [
        "Rijk",
        "Belasting en premies",
        "direct financieel",
        true,
        -1645.95
      ],
      [
        "Gemeente",
        "Uitkering",
        "direct financieel",
        true,
        14061.0
      ]
    ]
  },
  {
    "naam": "werk 12-20 naar 20-35 uur",
    "t0": {
      "werk": "12 tot 20 uur per week"
    },
    "t1": {
      "werk": "20 tot 35 uur per week"
    },
    "posten": [
      [
        "Deelnemer",
        "Bruto loon",
        "direct financieel",
        false,
        10106.0
      ],
      [
        "Deelnemer",
        "Belasting en premies",
        "direct financieel",
        true,
        -479.13
      ],
      [
        "Deelnemer",
        "Opgegeven vrije tijd",
        "niet-financieel",
        false,
        -8664.19
      ],
      [
        "Rijk",
        "Belasting en premies",
        "direct financieel",
        true,
        479.13
      ]
    ]
  },
  {
    "naam": "bijstand naar mbo-opleiding met bijstand",
    "t0": {
      "uitkering": "Bijstandsuitkering"
    },
    "t1": {
      "uitkering": "Bijstandsuitkering",
      "opleidingDoel": "MBO 2-4/havovwo"
    },
    "posten": [
      [
        "Deelnemer",
        "Verwachte loonwinst na opleiding",
        "indirect financieel",
        false,
        4822.32
      ]
    ]
  },
  {
    "naam": "mbo-opleiding met bijstand naar mbo-diploma en werk 20-35",
    "t0": {
      "uitkering": "Bijstandsuitkering",
      "opleidingDoel": "MBO 2-4/havovwo"
    },
    "t1": {
      "werk": "20 tot 35 uur per week",
      "opleiding": "MBO 2-4/havovwo",
      "uitkering": "Bijstandsuitkering"
    },
    "posten": [
      [
        "Deelnemer",
        "Bruto loon",
        "direct financieel",
        false,
        30888.0
      ],
      [
        "Deelnemer",
        "Verwachte loonwinst na opleiding",
        "indirect financieel",
        false,
        -4822.32
      ],
      [
        "Deelnemer",
        "Belasting en premies",
        "direct financieel",
        true,
        991.73
      ],
      [
        "Deelnemer",
        "Uitkering",
        "direct financieel",
        true,
        -18768.0
      ],
      [
        "Deelnemer",
        "Opgegeven vrije tijd",
        "niet-financieel",
        false,
        -3547.81
      ],
      [
        "Rijk",
        "Belasting en premies",
        "direct financieel",
        true,
        -991.73
      ],
      [
        "Gemeente",
        "Uitkering",
        "direct financieel",
        true,
        18768.0
      ],
      [
        "Gemeente",
        "Uitvoeringskosten bijstand",
        "direct financieel",
        false,
        3500.0
      ]
    ]
  },
  {
    "naam": "Wajong naar 12-20 uur half inzetbaar",
    "t0": {
      "uitkering": "Wajong"
    },
    "t1": {
      "werk": "12 tot 20 uur per week",
      "inzetbaar": 0.5,
      "uitkering": "Wajong"
    },
    "posten": [
      [
        "Deelnemer",
        "Bruto loon",
        "direct financieel",
        false,
        7030.5
      ],
      [
        "Deelnemer",
        "Belasting en premies",
        "direct financieel",
        true,
        585.22
      ],
      [
        "Deelnemer",
        "Uitkering",
        "direct financieel",
        true,
        -7030.5
      ],
      [
        "Rijk",
        "Belasting en premies",
        "direct financieel",
        true,
        -585.22
      ],
      [
        "UWV",
        "Uitkering",
        "direct financieel",
        true,
        7030.5
      ]
    ]
  },
  {
    "naam": "bijstand naar bijstand met 8 uur vrijwilligerswerk",
    "t0": {
      "uitkering": "Bijstandsuitkering"
    },
    "t1": {
      "uitkering": "Bijstandsuitkering",
      "vrijwilligersuren": 8
    },
    "posten": [
      [
        "Maatschappij",
        "Vrijwilligerswerk",
        "niet-financieel",
        false,
        4576
      ]
    ]
  },
  {
    "naam": "Wlz-dagbesteding 4 dagdelen naar werk 12-20 met loonkostensubsidie",
    "t0": {
      "dagbesteding": "Wlz",
      "dagdelen": 4
    },
    "t1": {
      "werk": "12 tot 20 uur per week",
      "lks": true
    },
    "posten": [
      [
        "Deelnemer",
        "Bruto loon",
        "direct financieel",
        false,
        14061.0
      ],
      [
        "Deelnemer",
        "Belasting en premies",
        "direct financieel",
        true,
        -265.86
      ],
      [
        "Deelnemer",
        "Opgegeven vrije tijd",
        "niet-financieel",
        false,
        -9656.6
      ],
      [
        "Rijk",
        "Belasting en premies",
        "direct financieel",
        true,
        265.86
      ],
      [
        "Gemeente",
        "Loonkostensubsidie",
        "direct financieel",
        true,
        -13144.0
      ],
      [
        "Werkgever",
        "Loonkostensubsidie",
        "direct financieel",
        true,
        13144.0
      ],
      [
        "Rijk",
        "Dagbesteding",
        "direct financieel",
        false,
        16640.0
      ]
    ]
  },
  {
    "naam": "voltijd naar 12-20 uur",
    "t0": {
      "werk": "Voltijd"
    },
    "t1": {
      "werk": "12 tot 20 uur per week"
    },
    "posten": [
      [
        "Deelnemer",
        "Bruto loon",
        "direct financieel",
        false,
        -19333.0
      ],
      [
        "Deelnemer",
        "Belasting en premies",
        "direct financieel",
        true,
        3344.33
      ],
      [
        "Deelnemer",
        "Opgegeven vrije tijd",
        "niet-financieel",
        false,
        14389.8
      ],
      [
        "Rijk",
        "Belasting en premies",
        "direct financieel",
        true,
        -3344.33
      ]
    ]
  }
];

for (const { naam, t0, t1, posten: verwacht } of CASES) {
  test(`2026.3 testgeval ${naam}`, () => {
    const p = PARAMETERS_2026_3;
    const uitkomst = posten(p, situatie(p, t0), situatie(p, t1));
    assert.deepEqual(
      uitkomst.map(([sh, post]) => `${sh} / ${post}`),
      verwacht.map(([sh, post]) => `${sh} / ${post}`)
    );
    uitkomst.forEach(([sh, post, w], i) => {
      const [, , typeWaardering, overdracht, bedrag] = verwacht[i];
      assert.ok(Math.abs(w - bedrag) < 0.01, `${sh} / ${post}: ${w} != ${bedrag}`);
      const type = postType(p, sh, post);
      assert.equal(type.typeWaardering, typeWaardering, `${sh} / ${post}`);
      assert.equal(type.overdracht, overdracht, `${sh} / ${post}`);
    });
    // De overdrachten vallen in de som tegen elkaar weg.
    const overdrachten = uitkomst.filter(([sh, post]) => postType(p, sh, post).overdracht);
    assert.ok(Math.abs(overdrachten.reduce((s, [, , w]) => s + w, 0)) < 0.01);
  });
}

test("2026.3: income is hourly wage × hours × 52, rounded", () => {
  const p = PARAMETERS_2026_3;
  for (const [opleiding, perBand] of Object.entries(p.incomeByEducationAndHoursBand)) {
    for (const [band, loon] of Object.entries(perBand)) {
      assert.equal(loon, Math.round(p.hourlyWageByEducation[opleiding] * p.hoursPerWeekByBand[band] * p.weeksPerYear), `${opleiding} ${band}`);
    }
  }
});

test("2026.3: dagdelen are whole numbers 1 to 10, every post has a known type", () => {
  const p = PARAMETERS_2026_3;
  assert.deepEqual(p.options.dagdelenPerWeek, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const post of p.posts) {
    assert.ok(["direct financieel", "indirect financieel", "niet-financieel"].includes(post.typeWaardering), post.post);
  }
  assert.equal(p.volunteerValueStakeholder, "Maatschappij");
});

test("2026.3: every benefitType has an amount and a payer, and benefitShare is gone", () => {
  const p = PARAMETERS_2026_3;
  for (const type of p.options.benefitType.filter((t) => t !== "Geen")) {
    assert.ok(p.benefitAmountPerYear[type] < 0, type);
    assert.ok(p.calculation.stakeholders.includes(p.benefitPayer[type]), type);
  }
  assert.equal(p.options.benefitShare, undefined);
  assert.equal(p.benefitRules.shareAppliesTo, undefined);
});

test("2026.3: treden keep name and description, without a fixed valuation", () => {
  for (const lvl of PARAMETERS_2026_3.ladderLevels) {
    assert.deepEqual(Object.keys(lvl), ["trede", "label", "description"]);
  }
});

test("2026.3: every bron reference resolves", () => {
  const p = PARAMETERS_2026_3;
  const known = new Set(Object.keys(p.bronnen));
  for (const [key, b] of Object.entries(p.bronnen)) assert.equal(key, b.id);
  const refs = Object.values(p.sourceRefs).flatMap((v) => (Array.isArray(v) ? v : Object.values(v).flat()));
  for (const id of refs) assert.ok(known.has(id), `unknown bron id referenced: ${id}`);
  for (const type of Object.keys(p.benefitAmountPerYear)) assert.ok(p.sourceRefs.benefitAmountPerYear[type], type);
});

test("2026.1 and 2026.2 are unchanged by 2026.3", () => {
  assert.equal(PARAMETERS_2026_2.volunteerValuePerHour, 10);
  assert.equal(PARAMETERS_2026_2.bijstandUitvoeringskostenPerYear, -2900);
  assert.equal(PARAMETERS_2026_2.ladderLevels[0].valuePerYear, -21150);
});

test("2026.3: the old combined benefitType maps to an option that exists", () => {
  const p = PARAMETERS_2026_3;
  for (const [oud, nieuw] of Object.entries(p.benefitRules.legacyBenefitType)) {
    assert.ok(PARAMETERS_2026_2.options.benefitType.includes(oud), oud);
    assert.ok(p.options.benefitType.includes(nieuw), nieuw);
  }
  assert.equal(p.benefitRules.legacyBenefitType["WAO/WIA/WAZ/WAJONG"], "WAO/WIA/WAZ");
});

test("2026.3: the age transition uses 18, and 67 for AOW, detected by birth date", () => {
  const { ageTransition } = PARAMETERS_2026_3.calculation;
  assert.deepEqual(ageTransition.ageLimits, { default: 18, AOW: 67 });
  for (const type of Object.keys(ageTransition.ageLimits).filter((k) => k !== "default")) {
    assert.ok(PARAMETERS_2026_3.options.benefitType.includes(type), type);
  }
  assert.match(ageTransition.detection, /geboortedatum/);
});
