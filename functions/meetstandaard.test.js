import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STANDAARDEN,
  MEETSTANDAARD_ENERGIEARMOEDE_0_9,
  INTERVENTIEBIBLIOTHEEK_MILIEU_CIRCULARITEIT_0_9,
  handleMeetstandaard,
} from "./meetstandaard.js";
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

const COLLECTION = STANDAARDEN.energiearmoede.collection;
const docs = { "0.9": { meta: { version: "0.9", releasedAt: "2026-08-17" } } };

const get = async (path, headers = {}) => {
  const response = fakeResponse();
  await handleMeetstandaard(fakeFirestore(docs, COLLECTION), { path, headers }, response);
  return response;
};

// Derived from the registry rather than written out: a literal list here would
// have to be remembered every time a standaard is added, which is the same trap
// as enumerating collections in firestore.rules.
const SECTOREN = Object.keys(STANDAARDEN);

test("GET /meetstandaard lists the available sectoren", async () => {
  const res = await get("/api/v1/meetstandaard");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    JSON.parse(res.body).sectoren.map((s) => s.sector),
    SECTOREN
  );
  assert.deepEqual(JSON.parse(res.body).sectoren[0], {
    sector: "energiearmoede",
    label: "Energiearmoede",
    href: "/api/v1/meetstandaard/energiearmoede",
    versions: "/api/v1/meetstandaard/energiearmoede/versions",
  });
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
  // Pinned: immutable, so it may be cached for a year.
  assert.equal(res.headers["Cache-Control"], "public, max-age=31536000");
});

// Hitting the bare function URL gives request.path === "/", and that is exactly
// where someone exploring the API lands first.
test("the bare function URL lists the sectoren", async () => {
  const res = await get("/");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    JSON.parse(res.body).sectoren.map((s) => s.sector),
    SECTOREN
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
    SECTOREN
  );
});

// --- Interventiebibliotheek (Milieu & circulariteit) ---

const bib = INTERVENTIEBIBLIOTHEEK_MILIEU_CIRCULARITEIT_0_9;

test("the interventiebibliotheek declares its own document kind", () => {
  assert.equal(bib.meta.version, "0.9");
  assert.equal(bib.meta.standaard, "milieu-circulariteit");
  // A consumer must be able to tell the two document shapes apart without
  // guessing from which keys happen to be present.
  assert.equal(bib.meta.kind, "interventiebibliotheek");
  assert.ok(bib.meta.toelichting);
});

test("all 114 interventies are present across the three domeinen", () => {
  assert.equal(bib.interventies.length, 114);

  const perDomein = bib.interventies.reduce((acc, i) => ({ ...acc, [i.domein]: (acc[i.domein] || 0) + 1 }), {});
  assert.deepEqual(perDomein, {
    "Klimaat & Energie": 68,
    "Biodiversiteit & Natuur": 15,
    Circulariteit: 31,
  });

  const slugs = bib.interventies.map((i) => i.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs must be unique — they are join keys");
  for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `slug not url-safe: ${slug}`);
});

test("every interventie says what it is and how firm it is", () => {
  for (const i of bib.interventies) {
    assert.ok(i.interventie, `${i.id} has no name`);
    assert.ok(i.eenheid, `${i.id} has no eenheid — a kengetal is meaningless without one`);
    assert.ok(i.bewijssterkte, `${i.id} has no bewijssterkte`);
    assert.ok(i.statusKengetal, `${i.id} has no statusKengetal`);
    assert.ok(i.onderbouwing, `${i.id} has no onderbouwing`);
  }
});

// The workbook's savings/CO2 columns are Excel formulas with no cached values,
// so these are recomputed here. Pin the arithmetic against the same formula the
// workbook uses, or a silent change to a price would go unnoticed.
test("recomputed jaarcijfers match the workbook formula", () => {
  const a = Object.fromEntries(bib.aannames.map((x) => [x.id, x.waarde]));
  const gasPrijs = a["gasprijs-variabel-incl-belasting"];
  // The savings column bills electricity at the weighted price (grey plus the
  // green-certificate surcharge), not the bare one — Aannames B12, not B2.
  const elekPrijs = a["elektriciteitsprijs-gewogen-incl-groenestroomopslag"];
  const waterPrijs = a["waterprijs-incl-belastingen"];
  const efGas = a["emissiefactor-aardgas-wtw"];
  const efElek = a["emissiefactor-elektriciteit-location-based"];
  const efWater = a["emissiefactor-drinkwater"];
  const schaduwprijs = a["co2-schaduwprijs-milieuprijs-centraal-2021"];

  let checked = 0;
  for (const i of bib.interventies) {
    const { gasM3PerJaar: g, elektraKwhPerJaar: e, waterM3PerJaar: w, bestendiging } = i.kengetallen;
    if (i.berekend.co2eKgPerJaar === null) continue;
    const f = bestendiging === null ? 1 : bestendiging;
    const b = i.berekend;

    assert.ok(
      Math.abs(((g || 0) * gasPrijs + (e || 0) * elekPrijs + (w || 0) * waterPrijs) * f - b.besparingHuishoudenEurPerJaar) <= 0.011,
      `${i.id}: besparing does not follow from aannames`
    );
    assert.ok(
      Math.abs(((g || 0) * efGas + (e || 0) * efElek + (w || 0) * efWater) * f - b.co2eKgPerJaar) <= 0.011,
      `${i.id}: CO2e does not follow from aannames`
    );
    assert.ok(
      Math.abs(b.co2eKgPerJaar * schaduwprijs - b.maatschappelijkeBesparingEurPerJaar) <= 0.011,
      `${i.id}: maatschappelijke besparing does not follow from the shadow price`
    );
    assert.ok(
      Math.abs(b.besparingHuishoudenEurPerJaar + b.maatschappelijkeBesparingEurPerJaar - b.totaleWaardeEurPerJaar) <= 0.011,
      `${i.id}: totale waarde is not the sum of the two components`
    );
    checked += 1;
  }
  // Pinned so a regeneration cannot silently stop recomputing rows. 57, not the
  // 68 in that domein: five rows had their consumption blanked in the workbook
  // because a literal 0 there asserted "no impact" where nothing was actually
  // established, and six carry no physical consumption at all.
  assert.equal(checked, 57, "expected the Klimaat & Energie rows to be recomputed");
});

// The weighted electricity price is a formula in the workbook too (=B2+B10*B11),
// so it is derived here as well and has to be re-derivable by a consumer.
test("the derived aanname shows its own derivation", () => {
  const a = Object.fromEntries(bib.aannames.map((x) => [x.id, x]));
  const gewogen = a["elektriciteitsprijs-gewogen-incl-groenestroomopslag"];

  assert.equal(gewogen.afgeleid, true);
  assert.equal(gewogen.formule, "=B2+B10*B11");
  assert.ok(
    Math.abs(
      a["elektriciteitsprijs-variabel-incl-belasting"].waarde +
        a["aandeel-huishoudens-met-groenestroomcontract"].waarde * a["meerprijs-groene-stroom-gvo-opslag"].waarde -
        gewogen.waarde
    ) <= 1e-9,
    "the weighted price does not follow from its inputs"
  );

  // Every other aanname is read, not computed — a stray formule there would mean
  // a figure nobody can trace.
  for (const x of bib.aannames) {
    if (x.id === gewogen.id) continue;
    assert.equal(x.afgeleid, false, `${x.id} is marked derived`);
    assert.equal(x.formule, null);
  }
});

// Gedragsmaatregelen are published at their first-year effect times the central
// persistence factor. The workbook holds that as a formula (=Aannames!$B$8) with
// no cached value, so a naive read yields nothing and the figure silently
// inflates by 25%. Assert it is resolved, never defaulted.
test("the bestendigingsfactor is resolved, not defaulted to 1", () => {
  const factor = bib.aannames.find((x) => x.id.startsWith("bestendigingsfactor")).waarde;
  assert.equal(factor, 0.8);

  const met = bib.interventies.filter((i) => i.kengetallen.bestendiging === factor);
  assert.equal(met.length, 18);
  assert.deepEqual(bib.controle.metBestendigingsfactor, met.map((i) => i.id));

  for (const i of bib.interventies) {
    if (i.berekend.co2eKgPerJaar === null) continue;
    assert.ok(
      i.kengetallen.bestendiging !== null,
      `${i.id} was recomputed without a bestendiging — the formula was not resolved`
    );
  }
});

test("CO2 monetisation uses the shadow price from aannames", () => {
  const schaduwprijs = bib.aannames.find((a) => a.id.startsWith("co2-schaduwprijs")).waarde;
  assert.equal(schaduwprijs, 0.13);

  for (const i of bib.interventies) {
    const perEenheid = i.berekend.maatschappelijkeBesparingEurPerEenheid;
    if (i.kengetallen.co2ePerEenheid === null) {
      assert.equal(perEenheid, null, `${i.id} monetised without a kengetal`);
      continue;
    }
    assert.ok(
      Math.abs(i.kengetallen.co2ePerEenheid * schaduwprijs - perEenheid) <= 0.011,
      `${i.id}: monetary CO2 does not follow from the shadow price`
    );
  }
});

// "Geen kengetallen verzinnen" is the workbook's own rule; an unavailable figure
// must stay unavailable rather than defaulting to zero.
test("interventies without a kengetal are declared, not zeroed", () => {
  const missing = bib.interventies.filter(
    (i) => i.kengetallen.co2ePerEenheid === null && i.berekend.co2eKgPerJaar === null
  );
  assert.equal(bib.controle.zonderKengetal.length, missing.length);
  assert.ok(missing.length > 0, "the workbook has needs-verification rows — expected them flagged");

  for (const i of missing) {
    for (const [key, value] of Object.entries(i.berekend)) {
      assert.equal(value, null, `${i.id} has a ${key} it cannot justify`);
    }
  }
});

test("statusKengetal is normalised to a known vocabulary", () => {
  const allowed = new Set([
    "direct brongetal",
    "herleidbare omrekening",
    "casusgebonden / vergelijkend",
    "enabler / output",
    "needs verification",
  ]);
  for (const i of bib.interventies) {
    assert.ok(allowed.has(i.statusKengetal), `${i.id} has unknown status "${i.statusKengetal}"`);
  }
  // The source spelled two of them inconsistently; the mapping is published.
  assert.ok(bib.controle.statusGenormaliseerd.length > 0);
});

test("aannames and bronnen have unique ids", () => {
  for (const list of [bib.aannames, bib.bronnen]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  assert.ok(bib.bronnen.length >= 25);
});
