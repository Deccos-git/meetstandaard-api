import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEETSTANDAARD_ARBEIDSPARTICIPATIE_1_2 as doc,
  MEETSTANDAARD_ARBEIDSPARTICIPATIE_1_1 as vorige,
} from "./meetstandaard.js";

// Arbeidsparticipatie 1.2 differs from 1.1 only in amounts (gemist brutoloon on
// minimumloon, belasting with heffingskortingen; kennisbank 2026-10-26). A
// consumer needs no question migration from 1.1, and these tests pin that.

const likert = doc.effecten.filter((e) => !e.typeEffect?.startsWith("outputmeting"));
const proxies = likert.flatMap((e) => e.monetarisering.niveaus.flatMap((n) => n.proxies.map((p) => ({ e, n, p }))));
const vragen = (d) => d.effecten.map((e) => e.stellingen.map((s) => [s.nummer, s.stelling, s.negatiefGeformuleerd]));

test("1.2: meta pins version and sector", () => {
  assert.equal(doc.meta.version, "1.2");
  assert.equal(doc.meta.sector, "arbeidsparticipatie");
  assert.ok(doc.meta.releasedAt);
  assert.match(doc.meta.toelichting, /^Versie 1\.2 /);
});

test("1.2: same effecten, ids, uids and stellingen as 1.1", () => {
  assert.deepEqual(doc.effecten.map((e) => e.id), vorige.effecten.map((e) => e.id));
  assert.deepEqual(doc.effecten.map((e) => e.uid), vorige.effecten.map((e) => e.uid));
  assert.deepEqual(vragen(doc), vragen(vorige));
});

test("1.2: the participatieladder (EFF-18) is an outputmeting without stellingen or niveaus", () => {
  const ladder = doc.effecten.find((e) => e.id === "EFF-18");
  assert.match(ladder.typeEffect, /^outputmeting/);
  assert.equal(ladder.stellingen.length, 0);
  assert.equal(ladder.monetarisering.niveaus.length, 0);
  assert.equal(likert.length, 19);
});

test("1.2: Likert effecten have five niveaus, niveau 4 at zero, totals equal their parts", () => {
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

test("1.2: 365 proxyregels, each traceable and substantiated", () => {
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

test("1.2: proxy amounts keep the sign of their source text", () => {
  for (const { e, p } of proxies) {
    if (p.bedrag === null || p.bedrag === 0) continue;
    assert.equal(p.bedrag < 0, /^\s*[-−–—]/.test(p.bedragTekst), `${e.id} "${p.proxy}" ${p.bedragTekst}`);
  }
});

test("1.2: bronbedragVastgesteld only at EFF-01, 02, 03 and 20; rekenregels present", () => {
  const met = likert.filter((e) => e.monetarisering.niveaus.some((n) => n.bronbedragVastgesteld !== null));
  assert.deepEqual(met.map((e) => e.id), ["EFF-01", "EFF-02", "EFF-03", "EFF-20"]);
  assert.equal("gevoeligheid" in doc, false);
  assert.ok(doc.rekenregels.length > 0);
});
