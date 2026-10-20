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
// It mirrors situatie() in the MSI rekenmodel (bouw_outputmeting.py); the six
// cases below are the ones in output/api-wijziging-participatieladder-2026-10-20.md.
const schijftarief = (p, inkomen) => progressiveTax(p, inkomen);

const algemeneHeffingskorting = (p, inkomen) => {
  const { max, afbouwVanaf, afbouwPercentage } = p.taxCredits.algemeneHeffingskorting;
  return Math.max(0, max - Math.max(0, inkomen - afbouwVanaf) * afbouwPercentage);
};

const arbeidskorting = (p, loon) => {
  const schijf = p.taxCredits.arbeidskorting.find(({ upTo }) => upTo === null || loon <= upTo);
  return Math.max(0, schijf.base + schijf.rate * (loon - schijf.from));
};

const situatie = (p, { werk, opleiding = "Geen startkwalificatie", inzetbaar = 1, uitkering = "Geen", vrijwilligersuren = 0 }) => {
  const loon = werk ? p.incomeByEducationAndHoursBand[opleiding][werk] * inzetbaar : 0;
  let uit = uitkering === "Geen" ? 0 : -p.benefitAmountPerYear[uitkering];
  if (werk && uit) uit = Math.max(0, uit - loon);
  const totaal = loon + uit;
  const belasting = Math.max(
    0,
    schijftarief(p, totaal) - algemeneHeffingskorting(p, totaal) - (loon ? arbeidskorting(p, loon) : 0)
  );
  const r = { Deelnemer: loon + uit - belasting, Rijk: belasting, Gemeente: 0, UWV: 0, SVB: 0, reeel: loon };
  if (uit) {
    r[p.benefitPayer[uitkering]] -= uit;
    if (uitkering === "Bijstandsuitkering") {
      r.Gemeente += p.bijstandUitvoeringskostenPerYear;
      r.reeel += p.bijstandUitvoeringskostenPerYear;
    }
  }
  r.vrijwilligerswerk = vrijwilligersuren * p.weeksPerYear * p.volunteerValuePerHour;
  r.reeel += r.vrijwilligerswerk;
  return r;
};

const close = (actual, expected, waar) => assert.ok(Math.abs(actual - expected) < 0.01, `${waar}: ${actual} != ${expected}`);

const CASES = [
  {
    naam: "1: bijstand zonder werk naar 12-20 uur met aanvulling",
    t0: { uitkering: "Bijstandsuitkering" },
    t1: { werk: "12 tot 20 uur per week", uitkering: "Bijstandsuitkering" },
    verwacht: { Deelnemer: [15173.44, 17110.56], Rijk: [3594.56, 1657.44], Gemeente: [-22268, -7268], reeel: [-3500, 11500] },
  },
  {
    naam: "2: bijstand zonder werk naar 20-35 uur",
    t0: { uitkering: "Bijstandsuitkering" },
    t1: { werk: "20 tot 35 uur per week", uitkering: "Bijstandsuitkering" },
    verwacht: { Deelnemer: [15173.44, 27109.02], Rijk: [3594.56, 1890.98], Gemeente: [-22268, 0], reeel: [-3500, 29000] },
  },
  {
    naam: "3: bijstand zonder werk naar voltijd mbo",
    t0: { uitkering: "Bijstandsuitkering" },
    t1: { werk: "Voltijd", opleiding: "MBO 2-4/havovwo", uitkering: "Bijstandsuitkering" },
    verwacht: { Deelnemer: [15173.44, 42260.85], Rijk: [3594.56, 14039.15], Gemeente: [-22268, 0], reeel: [-3500, 56300] },
  },
  {
    naam: "4: bijstand naar bijstand met 8 uur vrijwilligerswerk",
    t0: { uitkering: "Bijstandsuitkering" },
    t1: { uitkering: "Bijstandsuitkering", vrijwilligersuren: 8 },
    verwacht: { Deelnemer: [15173.44, 15173.44], Gemeente: [-22268, -22268], vrijwilligerswerk: [0, 4576], reeel: [-3500, 1076] },
  },
  {
    naam: "5: Wajong naar 12-20 uur, half inzetbaar",
    t0: { uitkering: "Wajong" },
    t1: { werk: "12 tot 20 uur per week", inzetbaar: 0.5, uitkering: "Wajong" },
    verwacht: { Deelnemer: [14584.27, 15208.57], Rijk: [3266.73, 2642.43], UWV: [-17851, -10351], reeel: [0, 7500] },
  },
  {
    naam: "6: 12-20 uur naar 20-35 uur zonder uitkering",
    t0: { werk: "12 tot 20 uur per week" },
    t1: { werk: "20 tot 35 uur per week" },
    verwacht: { Deelnemer: [14689.62, 27109.02], Rijk: [310.38, 1890.98], reeel: [15000, 29000] },
  },
];

for (const { naam, t0, t1, verwacht } of CASES) {
  test(`2026.3 testgeval ${naam}`, () => {
    const s0 = situatie(PARAMETERS_2026_3, t0);
    const s1 = situatie(PARAMETERS_2026_3, t1);
    for (const [veld, [v0, v1]] of Object.entries(verwacht)) {
      close(s0[veld], v0, `${veld} 0-meting`);
      close(s1[veld], v1, `${veld} 1-meting`);
    }
  });
}

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
