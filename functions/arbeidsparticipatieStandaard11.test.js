import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEETSTANDAARD_ARBEIDSPARTICIPATIE_1_1 as doc,
  MEETSTANDAARD_ARBEIDSPARTICIPATIE_1_0 as vorige,
} from "./meetstandaard.js";

// Arbeidsparticipatie 1.1 differs from 1.0 in three effecten' stellingen
// (decision 2026-10-23) and in the monetarisering revised on 2026-10-22.
// These tests pin what a regeneration must not lose, and that nothing else
// moved: a consumer migrates question rows from 1.0 on the basis of this diff.

const likert = doc.effecten.filter((e) => !e.typeEffect?.startsWith("outputmeting"));
const proxies = likert.flatMap((e) => e.monetarisering.niveaus.flatMap((n) => n.proxies.map((p) => ({ e, n, p }))));
const stellingen = (d, id) => d.effecten.find((e) => e.id === id).stellingen.map((s) => s.stelling);

test("1.1: meta pins version and sector", () => {
  assert.equal(doc.meta.version, "1.1");
  assert.equal(doc.meta.sector, "arbeidsparticipatie");
  assert.ok(doc.meta.releasedAt);
  assert.match(doc.meta.toelichting, /^Versie 1\.1 /);
});

// A uid or id that changes between versions makes a consumer see a new effect
// and break the series.
test("1.1: same 20 effecten as 1.0, same ids and uids", () => {
  assert.deepEqual(doc.effecten.map((e) => e.id), vorige.effecten.map((e) => e.id));
  assert.deepEqual(doc.effecten.map((e) => e.uid), vorige.effecten.map((e) => e.uid));
});

test("1.1: stellingen change only in EFF-01, EFF-06 and EFF-20", () => {
  const anders = doc.effecten
    .filter((e) => JSON.stringify(stellingen(doc, e.id)) !== JSON.stringify(stellingen(vorige, e.id)))
    .map((e) => e.id);
  assert.deepEqual(anders, ["EFF-01", "EFF-06", "EFF-20"]);
});

test("1.1: mentale gezondheid drops zelfacceptatie and adds two negative stellingen", () => {
  const effect = doc.effecten.find((e) => e.id === "EFF-01");
  assert.ok(!stellingen(doc, "EFF-01").includes("Ik accepteer mezelf zoals ik ben"));
  assert.deepEqual(
    effect.stellingen.slice(3).map((s) => [s.nummer, s.stelling, s.negatiefGeformuleerd]),
    [[4, "Ik heb vaak stress", true], [5, "Ik voel me vaak hopeloos", true]]
  );
});

test("1.1: zingeving #2 without the typo, financiële gezondheid ends with rondkomen", () => {
  assert.equal(stellingen(doc, "EFF-06")[1], "Ik heb het gevoel dat ik iets goeds doe");
  const fin = stellingen(doc, "EFF-20");
  assert.ok(!fin.some((s) => s.startsWith("Ik herken belangrijke post")));
  assert.equal(fin[3], "Ik kan goed rondkomen van mijn/ons totale inkomen");
});

test("1.1: 79 stellingen, each with bron and a known polarity", () => {
  assert.equal(doc.effecten.reduce((n, e) => n + e.stellingen.length, 0), 79);
  for (const effect of likert) {
    for (const s of effect.stellingen) {
      assert.ok(s.stelling && s.bron, `${effect.id} stelling ${s.nummer}`);
      // null would let a consumer guess, and a wrong guess flips every answer.
      assert.equal(typeof s.negatiefGeformuleerd, "boolean", `${effect.id} stelling ${s.nummer}`);
    }
  }
});

test("1.1: the participatieladder (EFF-18) is an outputmeting without stellingen or niveaus", () => {
  const ladder = doc.effecten.find((e) => e.id === "EFF-18");
  assert.match(ladder.typeEffect, /^outputmeting/);
  assert.equal(ladder.stellingen.length, 0);
  assert.equal(ladder.monetarisering.niveaus.length, 0);
  assert.equal(likert.length, 19);
});

test("1.1: Likert effecten have five niveaus, niveau 4 at zero, totals equal their parts", () => {
  assert.deepEqual(doc.controle.somAfwijkingen, []);
  for (const effect of likert) {
    assert.deepEqual(effect.monetarisering.niveaus.map((n) => n.score), [1, 2, 3, 4, 5], effect.id);
    assert.equal(effect.monetarisering.niveaus[3].totaleWaardeIndicatief, 0, effect.id);
    for (const niveau of effect.monetarisering.niveaus) {
      const som = niveau.waarvanReeel + niveau.waarvanOverdracht;
      assert.ok(Math.abs(som - niveau.totaleWaardeIndicatief) <= 0.01, `${effect.id} ${niveau.niveau}: ${som}`);
    }
  }
});

test("1.1: 365 proxyregels, each traceable and substantiated", () => {
  assert.equal(proxies.length, 365);
  for (const { e, n, p } of proxies) {
    const waar = `${e.id} ${n.niveau} "${p.proxy}"`;
    assert.ok(p.stakeholder, waar);
    assert.ok(p.bronBedrag, waar);
    assert.ok(p.onderbouwing, waar);
    assert.ok(["direct financieel", "indirect financieel", "niet-financieel"].includes(p.typeWaardering), waar);
    assert.ok(["reeel", "overdracht"].includes(p.typePost), waar);
    assert.ok(p.overlapgroep && p.overlapSterkte, waar);
  }
});

test("1.1: proxy amounts keep the sign of their source text", () => {
  for (const { e, p } of proxies) {
    if (p.bedrag === null || p.bedrag === 0) continue;
    assert.equal(p.bedrag < 0, /^\s*[-−–—]/.test(p.bedragTekst), `${e.id} "${p.proxy}" ${p.bedragTekst}`);
  }
});

test("1.1: bronbedragVastgesteld only at EFF-01, 02, 03 and 20; rekenregels present", () => {
  const met = likert.filter((e) => e.monetarisering.niveaus.some((n) => n.bronbedragVastgesteld !== null));
  assert.deepEqual(met.map((e) => e.id), ["EFF-01", "EFF-02", "EFF-03", "EFF-20"]);
  assert.equal("gevoeligheid" in doc, false);
  assert.ok(doc.rekenregels.length > 0);
});
