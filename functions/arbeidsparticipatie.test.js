import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAMETERS_2026_1 } from "./arbeidsparticipatie.js";

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
