import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAMETERS_2026_1, PARAMETERS_2026_2 } from "./arbeidsparticipatie.js";

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
