import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTOREN, MEETSTANDAARD_ENERGIEARMOEDE_0_9, handleMeetstandaard } from "./meetstandaard.js";
import { fakeFirestore, fakeResponse } from "./versionedResource.test.js";

const doc = MEETSTANDAARD_ENERGIEARMOEDE_0_9;

// --- Document integrity ---

test("meta pins the published version and sector", () => {
  assert.equal(doc.meta.version, "0.9");
  assert.equal(doc.meta.sector, "energiearmoede");
  assert.ok(doc.meta.releasedAt, "a published version must record when it was released");
  assert.ok(doc.meta.toelichting, "consumers render this note alongside the values");
});

// The 13 effects are the contract with the source workbook — pin the ids so a
// regenerated document cannot silently drop or renumber one.
test("all 13 effecten are present with stable ids and slugs", () => {
  assert.equal(doc.effecten.length, 13);
  assert.deepEqual(
    doc.effecten.map((e) => e.id),
    Array.from({ length: 13 }, (_, i) => `EFF-${String(i + 1).padStart(2, "0")}`)
  );

  const slugs = doc.effecten.map((e) => e.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs must be unique — they are join keys");
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `slug is not url-safe: ${slug}`);
  }
});

test("every effect carries the fields a consumer renders", () => {
  for (const effect of doc.effecten) {
    assert.ok(effect.effect, `${effect.id} has no display name`);
    assert.ok(effect.categorie, `${effect.id} has no categorie`);
    assert.ok(effect.monetarisering.niveaus.length > 0, `${effect.id} has no monetarisering niveaus`);
  }
});

// EFF-09 (CO2) is measured per maatregel and EFF-11 uses the participatieladder,
// so only the Likert-scored effects carry stellingen.
test("Likert-scored effecten have stellingen and situatieschetsen", () => {
  const likert = doc.effecten.filter((e) => e.monetarisering.niveaus.every((n) => n.score !== null));
  assert.ok(likert.length >= 10, "expected most effecten to be Likert-scored");

  for (const effect of likert) {
    assert.ok(effect.stellingen.length > 0, `${effect.id} has no stellingen`);
    assert.ok(effect.situatieschetsen.length > 0, `${effect.id} has no situatieschetsen`);
    for (const stelling of effect.stellingen) {
      assert.ok(stelling.stelling, `${effect.id} stelling ${stelling.nummer} has no text`);
      assert.ok(stelling.bron, `${effect.id} stelling ${stelling.nummer} has no bron`);
    }
  }
});

// This standard's claim is traceability: every proxy that carries value must say
// who bears the amount, where the amount comes from, and which overlapgroep it
// belongs to (without that, aggregating across effects double-counts). Baseline
// rows sit at exactly 0 and legitimately have no stakeholder to attribute to.
test("every value-carrying proxyregel is traceable", () => {
  const proxies = doc.effecten.flatMap((e) => e.monetarisering.niveaus.flatMap((n) => n.proxies));
  assert.equal(proxies.length, 198);

  for (const proxy of proxies) {
    assert.ok(proxy.bedragTekst, `proxy "${proxy.proxy}" has no bedrag`);
    assert.ok(proxy.eenheid, `proxy "${proxy.proxy}" has no eenheid`);
    assert.ok(proxy.bronBedrag, `proxy "${proxy.proxy}" has no bronBedrag`);

    if (proxy.bedrag === 0) continue;
    assert.ok(proxy.stakeholder, `proxy "${proxy.proxy}" has no stakeholder`);
    assert.ok(proxy.overlapgroep, `proxy "${proxy.proxy}" has no overlapgroep`);
  }
});

// Costs are negative and benefits positive; a dropped sign flips a cost into a
// benefit, which is the single most damaging conversion error possible here.
test("proxy amounts keep the sign of their source text", () => {
  for (const effect of doc.effecten) {
    for (const niveau of effect.monetarisering.niveaus) {
      for (const proxy of niveau.proxies) {
        if (proxy.bedrag === null) continue;
        const negative = /^\s*[-−–—]/.test(proxy.bedragTekst);
        assert.equal(
          proxy.bedrag < 0,
          negative,
          `${effect.id} "${proxy.proxy}": ${proxy.bedragTekst} parsed as ${proxy.bedrag}`
        );
      }
    }
  }
});

// A niveau total that disagrees with its proxies is a defect in the source, not
// something to reconcile silently — but it must be declared, not hidden.
test("niveau totals match their proxy sum, except where controle declares otherwise", () => {
  const declared = new Set(doc.controle.somAfwijkingen.map((a) => `${a.effectId}|${a.niveau}`));

  for (const effect of doc.effecten) {
    for (const niveau of effect.monetarisering.niveaus) {
      if (niveau.totaleWaardeIndicatief === null) continue;
      const sum = niveau.proxies.reduce((acc, p) => acc + (p.bedrag ?? 0), 0);
      const matches = Math.abs(sum - niveau.totaleWaardeIndicatief) <= 0.01;
      assert.equal(
        matches,
        !declared.has(`${effect.id}|${niveau.niveau}`),
        `${effect.id} niveau ${niveau.niveau}: sum ${sum} vs total ${niveau.totaleWaardeIndicatief}`
      );
    }
  }
});

test("controle lists every proxy whose bedrag is not a single amount", () => {
  const textual = doc.effecten.flatMap((e) =>
    e.monetarisering.niveaus.flatMap((n) => n.proxies.filter((p) => p.bedrag === null))
  );
  assert.equal(doc.controle.nietGemonetariseerd.length, textual.length);
  assert.ok(textual.length > 0, "the workbook has PM/n.v.t. rows — expected them to be flagged");
});

test("aggregatie covers every overlapgroep used by a proxy", () => {
  const known = new Set(doc.aggregatie.overlapgroepen.map((g) => g.overlapgroep));
  const used = new Set(
    doc.effecten
      .flatMap((e) => e.monetarisering.niveaus.flatMap((n) => n.proxies.map((p) => p.overlapgroep)))
      // "n.v.t." and "—" mark baseline rows that carry no value to deduplicate.
      .filter((groep) => groep && !/^(n\.v\.t\.|—|-)$/i.test(groep))
  );

  for (const groep of used) {
    assert.ok(known.has(groep), `overlapgroep "${groep}" is used but not in aggregatie`);
  }
});

test("parameters and bronnen have unique ids", () => {
  const ids = doc.parameters.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "parameter ids must be unique");
  for (const [key, bron] of Object.entries(doc.bronnen)) {
    assert.equal(key, bron.id, `bronnen key ${key} must match its id`);
    assert.ok(bron.apaReferentie, `bron ${key} has no reference`);
  }
});

// --- HTTP handler routing ---

const COLLECTION = SECTOREN.energiearmoede.collection;
const docs = { "0.9": { meta: { version: "0.9", releasedAt: "2026-08-17" } } };

const get = async (path, headers = {}) => {
  const response = fakeResponse();
  await handleMeetstandaard(fakeFirestore(docs, COLLECTION), { path, headers }, response);
  return response;
};

test("GET /meetstandaard lists the available sectoren", async () => {
  const res = await get("/api/v1/meetstandaard");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body).sectoren, [
    {
      sector: "energiearmoede",
      label: "Energiearmoede",
      href: "/api/v1/meetstandaard/energiearmoede",
      versions: "/api/v1/meetstandaard/energiearmoede/versions",
    },
  ]);
});

test("GET /meetstandaard/{sector} serves the latest version of that sector", async () => {
  const res = await get("/api/v1/meetstandaard/energiearmoede");
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).meta.version, "0.9");
  assert.equal(res.headers["X-Meetstandaard-Version"], "0.9");
});

test("GET /meetstandaard/{sector}/versions is scoped to that sector", async () => {
  const res = await get("/api/v1/meetstandaard/energiearmoede/versions");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body).versions, ["0.9"]);
  assert.equal(JSON.parse(res.body).latest, "0.9");
});

test("GET /meetstandaard/{sector}/{version} pins a version", async () => {
  const res = await get("/api/v1/meetstandaard/energiearmoede/0.9");
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["X-Meetstandaard-Version"], "0.9");
  assert.equal(res.headers["Cache-Control"], "public, max-age=86400");
});

// Hitting the bare function URL gives request.path === "/", and that is exactly
// where someone exploring the API lands first.
test("the bare function URL lists the sectoren", async () => {
  const res = await get("/");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    JSON.parse(res.body).sectoren.map((s) => s.sector),
    ["energiearmoede"]
  );
});

test("a bare /versions points at the per-sector route", async () => {
  const res = await get("/api/v1/meetstandaard/versions");
  assert.equal(res.statusCode, 404);
  assert.match(res.body.error, /per sector/);
});

test("an unknown sector 404s with the sectoren that do exist", async () => {
  const res = await get("/api/v1/meetstandaard/warmtetransitie");
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, "Unknown sector: warmtetransitie");
  assert.deepEqual(
    res.body.sectoren.map((s) => s.sector),
    ["energiearmoede"]
  );
});
