import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STANDAARDEN,
  MEETSTANDAARD_ENERGIEARMOEDE_0_9,
  MEETSTANDAARD_ENERGIEARMOEDE_0_10,
  MEETSTANDAARD_ENERGIEARMOEDE_0_11,
  MEETSTANDAARD_ENERGIEARMOEDE_0_12,
  MEETSTANDAARD_ENERGIEARMOEDE_0_13,
  MEETSTANDAARD_WIJKBEDRIJVEN_0_1,
  MEETSTANDAARD_WIJKBEDRIJVEN_0_2,
  INTERVENTIEBIBLIOTHEEK_MILIEU_CIRCULARITEIT_0_9,
  handleMeetstandaard,
} from "./meetstandaard.js";
import { fakeFirestore, fakeResponse } from "./versionedResource.test.js";

// --- Document integrity ---

// Every published version is held to the same invariants: a regeneration that
// drops a sign or an effect must fail no matter which version it produced.
for (const doc of [
  MEETSTANDAARD_ENERGIEARMOEDE_0_9,
  MEETSTANDAARD_ENERGIEARMOEDE_0_10,
  MEETSTANDAARD_ENERGIEARMOEDE_0_11,
  MEETSTANDAARD_ENERGIEARMOEDE_0_12,
  MEETSTANDAARD_ENERGIEARMOEDE_0_13,
]) {
  const versie = doc.meta.version;

  test(`${versie}: meta pins the published version and sector`, () => {
    assert.equal(doc.meta.version, versie);
    assert.equal(doc.meta.sector, "energiearmoede");
    assert.ok(doc.meta.releasedAt, "a published version must record when it was released");
    assert.ok(doc.meta.toelichting, "consumers render this note alongside the values");
  });

  // The 13 effects are the contract with the source workbook — pin the ids so a
  // regenerated document cannot silently drop or renumber one.
  test(`${versie}: all 13 effecten are present with stable ids and slugs`, () => {
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

  test(`${versie}: every effect carries the fields a consumer renders`, () => {
    for (const effect of doc.effecten) {
      assert.ok(effect.effect, `${effect.id} has no display name`);
      assert.ok(effect.categorie, `${effect.id} has no categorie`);
      // From 0.13 EFF-11 is an outputmeting: asked administratively, valued by
      // the participatieladder rekenmodel, so it has no niveaus of its own.
      if (effect.typeEffect?.startsWith("outputmeting")) continue;
      assert.ok(effect.monetarisering.niveaus.length > 0, `${effect.id} has no monetarisering niveaus`);
    }
  });

  // EFF-09 (CO2) is measured per maatregel and EFF-11 uses the participatieladder,
  // so only the Likert-scored effects carry stellingen.
  test(`${versie}: Likert-scored effecten have stellingen and situatieschetsen`, () => {
    const likert = doc.effecten.filter(
      (e) => e.monetarisering.niveaus.length > 0 && e.monetarisering.niveaus.every((n) => n.score !== null)
    );
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
  test(`${versie}: every value-carrying proxyregel is traceable`, () => {
    const proxies = doc.effecten.flatMap((e) => e.monetarisering.niveaus.flatMap((n) => n.proxies));
    // 0.13 adds proxyregels from Bart Maas' onderbouwing (MSI log 2026-10-19).
    assert.equal(proxies.length, versie === "0.13" ? 209 : 198);

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
  test(`${versie}: proxy amounts keep the sign of their source text`, () => {
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
  test(`${versie}: niveau totals match their proxy sum, except where controle declares otherwise`, () => {
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

  test(`${versie}: controle lists every proxy whose bedrag is not a single amount`, () => {
    const textual = doc.effecten.flatMap((e) =>
      e.monetarisering.niveaus.flatMap((n) => n.proxies.filter((p) => p.bedrag === null))
    );
    assert.equal(doc.controle.nietGemonetariseerd.length, textual.length);
    assert.ok(textual.length > 0, "the workbook has PM/n.v.t. rows — expected them to be flagged");
  });

  test(`${versie}: aggregatie covers every overlapgroep used by a proxy`, () => {
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

  test(`${versie}: parameters and bronnen have unique ids`, () => {
    const ids = doc.parameters.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, "parameter ids must be unique");
    for (const [key, bron] of Object.entries(doc.bronnen)) {
      assert.equal(key, bron.id, `bronnen key ${key} must match its id`);
      assert.ok(bron.apaReferentie, `bron ${key} has no reference`);
    }
  });
}

// --- HTTP handler routing ---

const COLLECTION = STANDAARDEN.energiearmoede.collection;
// --- Overlapregel (2026-10-13) ---

// From 0.11 overlap is shown, never corrected: no factor may come back in through
// a regenerated sheet 8, and every proxy must say how strong its overlap is.
for (const doc of [MEETSTANDAARD_ENERGIEARMOEDE_0_11, MEETSTANDAARD_ENERGIEARMOEDE_0_12, MEETSTANDAARD_ENERGIEARMOEDE_0_13]) {
  test(`${doc.meta.version}: aggregatie shows overlap without correcting it`, () => {
    const { overlapgroepen } = doc.aggregatie;
    assert.ok(overlapgroepen.length > 0);
    for (const groep of overlapgroepen) {
      assert.equal(groep.correctiefactor, "geen", `${groep.overlapgroep} carries a correction`);
      assert.equal(groep.correctieNodig, false, `${groep.overlapgroep} asks for a correction`);
      assert.ok(groep.overlapSterkte, `${groep.overlapgroep} has no overlapSterkte`);
      assert.equal("alpha" in groep, false, `${groep.overlapgroep} still has an alpha`);
    }
  });

  test(`${doc.meta.version}: every proxy states its overlap strength and post type`, () => {
    for (const effect of doc.effecten) {
      for (const niveau of effect.monetarisering.niveaus) {
        for (const proxy of niveau.proxies) {
          assert.ok(proxy.overlapSterkte, `${effect.id} ${niveau.niveau} "${proxy.proxy}" has no overlapSterkte`);
          assert.ok(["reeel", "overdracht"].includes(proxy.typePost), `${effect.id} "${proxy.proxy}" typePost ${proxy.typePost}`);
        }
      }
    }
  });

  test(`${doc.meta.version}: reeel plus overdracht equals the niveau total`, () => {
    for (const effect of doc.effecten) {
      for (const niveau of effect.monetarisering.niveaus) {
        if (niveau.totaleWaardeIndicatief === null) continue;
        const som = niveau.waarvanReeel + niveau.waarvanOverdracht;
        assert.ok(Math.abs(som - niveau.totaleWaardeIndicatief) <= 0.01, `${effect.id} ${niveau.niveau}: ${som}`);
      }
    }
  });
}

// --- Eenheid per niveau (0.12) ---

// Up to 0.11 the last row's eenheid stood for the whole effect, so the euros of
// EFF-07 niveau 1-4 were announced as a percentage. From 0.12 every niveau
// carries its own eenheid.
test("0.12: every monetarisering niveau states its own eenheid", () => {
  for (const effect of MEETSTANDAARD_ENERGIEARMOEDE_0_12.effecten) {
    const { eenheid, niveaus } = effect.monetarisering;
    for (const niveau of niveaus) {
      assert.ok(niveau.eenheid, `${effect.id} niveau ${niveau.niveau} has no eenheid`);
    }
    const aantal = (e) => niveaus.filter((n) => n.eenheid === e).length;
    assert.ok(
      niveaus.every((n) => aantal(n.eenheid) <= aantal(eenheid)),
      `${effect.id}: effect-eenheid is not the eenheid of most niveaus`
    );
  }
});

test("0.12: EFF-07 is euros on niveau 1-4 and a percentage on niveau 5", () => {
  const effect = MEETSTANDAARD_ENERGIEARMOEDE_0_12.effecten.find((e) => e.id === "EFF-07");
  for (const niveau of effect.monetarisering.niveaus) {
    if (niveau.niveau === "5") {
      assert.equal(niveau.totaleWaardeIndicatief, null);
      assert.match(niveau.eenheid, /^%/);
    } else {
      assert.equal(typeof niveau.totaleWaardeIndicatief, "number");
      assert.match(niveau.eenheid, /^€/);
    }
  }
  assert.match(effect.monetarisering.eenheid, /^€/);
});

// --- Nieuwe opbouw (0.13) ---

// From 0.13 one paragraph `onderbouwing` replaces bronEffectProxyRelatie,
// toelichtingProxykeuze, aannames and aannamescore (MSI besluit 2026-10-20).
test("0.13: every proxy carries its onderbouwing and type waardering", () => {
  for (const effect of MEETSTANDAARD_ENERGIEARMOEDE_0_13.effecten) {
    for (const niveau of effect.monetarisering.niveaus) {
      for (const proxy of niveau.proxies) {
        assert.ok(proxy.onderbouwing, `${effect.id} ${niveau.niveau} "${proxy.proxy}" has no onderbouwing`);
        assert.ok(proxy.typeWaardering, `${effect.id} ${niveau.niveau} "${proxy.proxy}" has no typeWaardering`);
        assert.equal(proxy.aannamescore, null);
      }
    }
  }
});

test("0.13: EFF-07 niveau 5 is zero euros, in the same eenheid as niveau 1-4", () => {
  const effect = MEETSTANDAARD_ENERGIEARMOEDE_0_13.effecten.find((e) => e.id === "EFF-07");
  for (const niveau of effect.monetarisering.niveaus) {
    assert.equal(typeof niveau.totaleWaardeIndicatief, "number");
    assert.match(niveau.eenheid, /^€/);
  }
  assert.equal(effect.monetarisering.niveaus.find((n) => n.niveau === "5").totaleWaardeIndicatief, 0);
});

test("0.13: EFF-11 is an outputmeting without stellingen or niveaus", () => {
  const effect = MEETSTANDAARD_ENERGIEARMOEDE_0_13.effecten.find((e) => e.id === "EFF-11");
  assert.match(effect.typeEffect, /^outputmeting/);
  assert.equal(effect.stellingen.length, 0);
  assert.equal(effect.monetarisering.niveaus.length, 0);
});

test("0.13: rekenregels, organisatievragen and kwalificering are published", () => {
  const doc = MEETSTANDAARD_ENERGIEARMOEDE_0_13;
  assert.equal(doc.rekenregels.length, 22);
  assert.equal(doc.organisatievragen.length, 12);
  assert.equal(doc.kwalificering.length, 3);
  for (const vraag of doc.kwalificering) assert.ok(vraag.stelling && vraag.bron, `kwalificering ${vraag.nummer}`);
});

// Niveau 1 was missing from every Likert effect in 0.9 to 0.11 (MSI log 2026-10-15).
test("0.12: Likert-scored effecten describe all five niveaus", () => {
  for (const effect of MEETSTANDAARD_ENERGIEARMOEDE_0_12.effecten) {
    if (!effect.monetarisering.niveaus.every((n) => n.score !== null)) continue;
    assert.deepEqual(
      effect.situatieschetsen.map((s) => s.score),
      [1, 2, 3, 4, 5],
      `${effect.id} situatieschetsen`
    );
  }
});

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

// --- Wijkbedrijven 0.1 ---
//
// Generated by MSI sectoren/wijkbedrijven/output/build/bouw.py, which computes every
// proxy as hoeveelheid × canonieke prijs. Pin the shape so a regeneration that drops
// an effect, a sketch or a sign fails here.

const wijk = MEETSTANDAARD_WIJKBEDRIJVEN_0_1;
const wijkProxies = wijk.effecten.flatMap((e) => e.monetarisering.niveaus.flatMap((n) => n.proxies));

test("wijkbedrijven 0.1: 13 effecten, 56 stellingen, 186 proxyregels", () => {
  assert.equal(wijk.meta.version, "0.1");
  assert.equal(wijk.meta.sector, "wijkbedrijven");
  assert.equal(wijk.effecten.length, 13);
  assert.equal(wijk.effecten.reduce((n, e) => n + e.stellingen.length, 0), 56);
  assert.equal(wijkProxies.length, 186);
  for (const e of wijk.effecten) {
    assert.equal(e.uid, `wijkbedrijven:${e.slug}`);
    assert.ok(e.stellingen.length >= 3 && e.stellingen.length <= 5, `${e.id}: ${e.stellingen.length} stellingen`);
  }
});

test("wijkbedrijven 0.1: every effect has five sketches with a source", () => {
  for (const e of wijk.effecten) {
    assert.deepEqual(e.situatieschetsen.map((s) => s.score), [1, 2, 3, 4, 5], e.id);
    for (const s of e.situatieschetsen) assert.ok(s.situatieschets && s.bron, `${e.id} niveau ${s.niveau}`);
  }
});

test("wijkbedrijven 0.1: niveau 4 is the zero line and totals equal their proxies", () => {
  assert.deepEqual(wijk.controle.somAfwijkingen, []);
  assert.deepEqual(wijk.controle.nietGemonetariseerd, []);
  for (const e of wijk.effecten) {
    const niveaus = e.monetarisering.niveaus;
    if (niveaus.length === 0) {
      assert.equal(e.monetariseerbaarheid, "niet verantwoord", `${e.id} has no niveaus but claims to be monetised`);
      continue;
    }
    assert.equal(niveaus.find((n) => n.niveau === "4").totaleWaardeIndicatief, 0, e.id);
    for (const n of niveaus) {
      const som = n.waarvanReeel + n.waarvanOverdracht;
      assert.ok(Math.abs(som - n.totaleWaardeIndicatief) <= 0.01, `${e.id} ${n.niveau}: ${som}`);
    }
    // Costs below the zero line, benefits above it.
    assert.ok(niveaus.find((n) => n.niveau === "1").waarvanReeel < 0, `${e.id} niveau 1`);
    assert.ok(niveaus.find((n) => n.niveau === "5").waarvanReeel > 0, `${e.id} niveau 5`);
  }
});

test("wijkbedrijven 0.1: every proxy is traceable and its overlap is shown, not corrected", () => {
  const groepen = new Set(wijk.aggregatie.overlapgroepen.map((g) => g.overlapgroep));
  for (const p of wijkProxies) {
    assert.ok(p.bronBedrag && p.berekening && p.aannames, `"${p.proxy}" is not traceable`);
    assert.ok(Number.isInteger(p.aannamescore) && p.aannamescore >= 1 && p.aannamescore <= 10, `"${p.proxy}" aannamescore`);
    assert.ok(["reeel", "overdracht"].includes(p.typePost), `"${p.proxy}" typePost ${p.typePost}`);
    assert.ok(p.overlapSterkte, `"${p.proxy}" has no overlapSterkte`);
    assert.ok(groepen.has(p.overlapgroep), `overlapgroep "${p.overlapgroep}" missing from aggregatie`);
  }
  for (const g of wijk.aggregatie.overlapgroepen) {
    assert.equal(g.correctiefactor, "geen", g.overlapgroep);
    assert.equal(g.correctieNodig, false, g.overlapgroep);
  }
});

// 0.2 adds the cohesielaag. The thirteen effects of 0.1 keep their stellingen, so
// measurements stay comparable; only the shape of the new layer is pinned here,
// the invariants above hold for 0.2 as well.
const wijk02 = MEETSTANDAARD_WIJKBEDRIJVEN_0_2;
const wijk02Proxies = wijk02.effecten.flatMap((e) => e.monetarisering.niveaus.flatMap((n) => n.proxies));

test("wijkbedrijven 0.2: 19 effecten, 80 stellingen, 199 proxyregels", () => {
  assert.equal(wijk02.meta.version, "0.2");
  assert.equal(wijk02.effecten.length, 19);
  assert.equal(wijk02.effecten.reduce((n, e) => n + e.stellingen.length, 0), 80);
  assert.equal(wijk02Proxies.length, 199);
  assert.deepEqual(wijk02.controle.somAfwijkingen, []);
  for (const e of wijk02.effecten) {
    assert.equal(e.uid, `wijkbedrijven:${e.slug}`);
    assert.ok(e.stellingen.length >= 3 && e.stellingen.length <= 5, `${e.id}: ${e.stellingen.length} stellingen`);
    assert.deepEqual(e.situatieschetsen.map((s) => s.score), [1, 2, 3, 4, 5], e.id);
    const niveaus = e.monetarisering.niveaus;
    if (niveaus.length === 0) {
      assert.equal(e.monetariseerbaarheid, "niet verantwoord", `${e.id} has no niveaus but claims to be monetised`);
      continue;
    }
    assert.equal(niveaus.find((n) => n.niveau === "4").totaleWaardeIndicatief, 0, e.id);
    assert.ok(niveaus.find((n) => n.niveau === "1").waarvanReeel < 0, `${e.id} niveau 1`);
    assert.ok(niveaus.find((n) => n.niveau === "5").waarvanReeel > 0, `${e.id} niveau 5`);
  }
});
test("wijkbedrijven 0.2 keeps the stellingen of 0.1", () => {
  const vorige = new Map(wijk.effecten.map((e) => [e.id, e.stellingen.map((s) => s.stelling)]));
  for (const e of wijk02.effecten.filter((x) => vorige.has(x.id))) {
    assert.deepEqual(e.stellingen.map((s) => s.stelling), vorige.get(e.id), e.id);
  }
});
test("wijkbedrijven 0.2: every proxy is traceable and its overlap is shown, not corrected", () => {
  const groepen = new Set(wijk02.aggregatie.overlapgroepen.map((g) => g.overlapgroep));
  for (const p of wijk02Proxies) {
    assert.ok(p.bronBedrag && p.berekening && p.aannames, `"${p.proxy}" is not traceable`);
    assert.ok(["reeel", "overdracht"].includes(p.typePost), `"${p.proxy}" typePost ${p.typePost}`);
    assert.ok(p.overlapSterkte, `"${p.proxy}" has no overlapSterkte`);
    assert.ok(groepen.has(p.overlapgroep), `overlapgroep "${p.overlapgroep}" missing from aggregatie`);
  }
  for (const g of wijk02.aggregatie.overlapgroepen) assert.equal(g.correctiefactor, "geen", g.overlapgroep);
});
