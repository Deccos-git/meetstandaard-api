import { test } from "node:test";
import assert from "node:assert/strict";
import { MEETSTANDAARD_ARBEIDSPARTICIPATIE_1_0 as doc } from "./meetstandaard.js";
import vorige from "./data/meetstandaard-arbeidsparticipatie-0.9.json" with { type: "json" };

// Arbeidsparticipatie 1.0 is the first version generated from the workbook
// instead of snapshotted from the `effects` collection. These tests pin what a
// regeneration must not lose.

const likert = doc.effecten.filter((e) => !e.typeEffect?.startsWith("outputmeting"));
const proxies = likert.flatMap((e) => e.monetarisering.niveaus.flatMap((n) => n.proxies.map((p) => ({ e, n, p }))));

test("1.0: meta pins version and sector", () => {
  assert.equal(doc.meta.version, "1.0");
  assert.equal(doc.meta.sector, "arbeidsparticipatie");
  assert.ok(doc.meta.releasedAt);
  assert.ok(doc.meta.toelichting);
});

test("1.0: 20 effecten EFF-01 to EFF-20, uid carries the sector", () => {
  assert.deepEqual(
    doc.effecten.map((e) => e.id),
    Array.from({ length: 20 }, (_, i) => `EFF-${String(i + 1).padStart(2, "0")}`)
  );
  for (const effect of doc.effecten) assert.equal(effect.uid, `arbeidsparticipatie:${effect.slug}`);
});

// A uid that changes between versions makes a consumer see a new effect and
// break the series. Only the merged effect (Zelf-effectiviteit + Empowerment)
// may get a new one.
test("1.0: every effect points to its 0.9 predecessor and keeps its uid", () => {
  const oud = new Map(vorige.effecten.map((e) => [e.id, e]));
  for (const effect of doc.effecten) {
    const ids = effect.effectIdsVorigeVersie;
    assert.ok(ids.length > 0, `${effect.id} has no predecessor`);
    for (const id of ids) assert.ok(oud.has(id), `${effect.id} points to unknown 0.9 id ${id}`);
    if (ids.length === 1) assert.equal(effect.uid, oud.get(ids[0]).uid, `${effect.id} changed uid`);
  }
  const samengevoegd = doc.effecten.find((e) => e.id === "EFF-11");
  assert.deepEqual(samengevoegd.effectIdsVorigeVersie, ["EFF-11", "EFF-12"]);
});

test("1.0: 78 stellingen, each with bron and a known polarity", () => {
  assert.equal(doc.effecten.reduce((n, e) => n + e.stellingen.length, 0), 78);
  for (const effect of likert) {
    assert.ok(effect.stellingen.length >= 3 && effect.stellingen.length <= 5, `${effect.id}: ${effect.stellingen.length}`);
    for (const s of effect.stellingen) {
      assert.ok(s.stelling && s.bron, `${effect.id} stelling ${s.nummer}`);
      // null would let a consumer guess, and a wrong guess flips every answer.
      assert.equal(typeof s.negatiefGeformuleerd, "boolean", `${effect.id} stelling ${s.nummer}`);
    }
  }
});

test("1.0: the participatieladder (EFF-18) is an outputmeting without stellingen or niveaus", () => {
  const ladder = doc.effecten.find((e) => e.id === "EFF-18");
  assert.match(ladder.typeEffect, /^outputmeting/);
  assert.equal(ladder.stellingen.length, 0);
  assert.equal(ladder.monetarisering.niveaus.length, 0);
  assert.equal(likert.length, 19);
});

test("1.0: Likert effecten have five niveaus and five situatieschetsen, niveau 4 at zero", () => {
  for (const effect of likert) {
    assert.deepEqual(effect.monetarisering.niveaus.map((n) => n.score), [1, 2, 3, 4, 5], effect.id);
    assert.deepEqual(effect.situatieschetsen.map((s) => s.score), [1, 2, 3, 4, 5], effect.id);
    assert.equal(effect.monetarisering.niveaus[3].totaleWaardeIndicatief, 0, effect.id);
  }
});

test("1.0: niveau totals equal the sum of their proxies, and reeel plus overdracht", () => {
  assert.deepEqual(doc.controle.somAfwijkingen, []);
  for (const effect of likert) {
    for (const niveau of effect.monetarisering.niveaus) {
      const som = niveau.waarvanReeel + niveau.waarvanOverdracht;
      assert.ok(Math.abs(som - niveau.totaleWaardeIndicatief) <= 0.01, `${effect.id} ${niveau.niveau}: ${som}`);
    }
  }
});

test("1.0: 301 proxyregels, each traceable and substantiated", () => {
  assert.equal(proxies.length, 301);
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

test("1.0: proxy amounts keep the sign of their source text", () => {
  for (const { e, p } of proxies) {
    if (p.bedrag === null || p.bedrag === 0) continue;
    assert.equal(p.bedrag < 0, /^\s*[-−–—]/.test(p.bedragTekst), `${e.id} "${p.proxy}" ${p.bedragTekst}`);
  }
});

// Audit A-01: the uitwerking leads; the bedrag the source workbook fixed without
// a calculation is published beside it, never instead of it.
test("1.0: bronbedragVastgesteld only where the source fixed one (EFF-01, 02, 03, 20)", () => {
  const met = likert.filter((e) => e.monetarisering.niveaus.some((n) => n.bronbedragVastgesteld !== null));
  assert.deepEqual(met.map((e) => e.id), ["EFF-01", "EFF-02", "EFF-03", "EFF-20"]);
});

test("1.0: no gevoeligheid, rekenregels present", () => {
  assert.equal("gevoeligheid" in doc, false);
  assert.ok(doc.rekenregels.length > 0);
});
