import { test } from "node:test";
import assert from "node:assert/strict";
import arbeidsparticipatie from "./data/meetstandaard-arbeidsparticipatie-0.9.json" with { type: "json" };
import gelijkeKansen from "./data/meetstandaard-gelijke-kansen-1.0.json" with { type: "json" };
import { richtingVan, slugify } from "./exportEffectenStandaard.js";

const documenten = [
  { naam: "arbeidsparticipatie", doc: arbeidsparticipatie, version: "0.9", effecten: 21, stellingen: 86 },
  { naam: "gelijke-kansen", doc: gelijkeKansen, version: "1.0", effecten: 10, stellingen: 53 },
];

// --- Document integrity ---
//
// These two are snapshots of a live collection rather than of a workbook, so a
// regeneration can pick up an edit made in the dashboard. Pinning the counts is
// what turns that from a silent change into a failing test.

for (const { naam, doc, version, effecten, stellingen } of documenten) {
  test(`${naam}: meta pins the version that used to live in the frontend`, () => {
    assert.equal(doc.meta.version, version);
    assert.equal(doc.meta.sector, naam);
    assert.equal(doc.meta.kind, "meetstandaard");
    assert.ok(doc.meta.releasedAt);
    assert.ok(doc.meta.toelichting);
  });

  test(`${naam}: effect- en stellingaantallen zijn vastgepind`, () => {
    assert.equal(doc.effecten.length, effecten);
    assert.equal(
      doc.effecten.reduce((n, e) => n + e.stellingen.length, 0),
      stellingen
    );
    assert.equal(doc.controle.aantallen.effecten, effecten);
    assert.equal(doc.controle.aantallen.stellingen, stellingen);
  });

  test(`${naam}: ids zijn opeenvolgend en slugs zijn unieke joinsleutels`, () => {
    assert.deepEqual(
      doc.effecten.map((e) => e.id),
      Array.from({ length: effecten }, (_, i) => `EFF-${String(i + 1).padStart(2, "0")}`)
    );

    const slugs = doc.effecten.map((e) => e.slug);
    assert.equal(new Set(slugs).size, slugs.length, "slugs moeten uniek zijn");
    for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  // `uid` is the key an external consumer joins on (their MSIId). It is
  // namespaced by sector because EFF-xx restarts per standaard and slugs repeat
  // across sectors — "fysieke-gezondheid" exists in gelijke-kansen as well as in
  // energiearmoede. A collision here silently merges two effects' answers.
  test(`${naam}: uid is sector:slug en uniek`, () => {
    for (const effect of doc.effecten) {
      assert.equal(effect.uid, `${doc.meta.sector}:${effect.slug}`, effect.id);
    }
    const uids = doc.effecten.map((e) => e.uid);
    assert.equal(new Set(uids).size, uids.length, "uid is een joinsleutel en moet uniek zijn");
  });

  test(`${naam}: elk effect houdt de link naar zijn dashboardrecord`, () => {
    for (const effect of doc.effecten) {
      assert.ok(effect.effect, `${effect.id} heeft geen naam`);
      assert.ok(effect.effectId, `${effect.id} heeft geen effectId`);
    }
    const ids = doc.effecten.map((e) => e.effectId);
    assert.equal(new Set(ids).size, ids.length, "twee effecten wijzen naar hetzelfde record");
  });

  // A derived polarity must never become indistinguishable from a recorded one:
  // that is the whole reason `herkomstRichting` exists. A reverse-coded statement
  // that is read as positief flips the effect's score.
  test(`${naam}: afgeleide en vastgelegde richting blijven uit elkaar te houden`, () => {
    for (const effect of doc.effecten) {
      for (const stelling of effect.stellingen) {
        const waar = `${effect.id} #${stelling.nummer}`;
        assert.ok(["positief", "negatief"].includes(stelling.richting), waar);
        assert.equal(stelling.negatiefGeformuleerd, stelling.richting === "negatief", waar);

        if (stelling.bronPosNeg === null) {
          assert.equal(stelling.herkomstRichting, "afgeleid", waar);
          // The convention is that only reverse-coded statements were tagged, so
          // a blank can only ever derive to positief.
          assert.equal(stelling.richting, "positief", waar);
        } else {
          assert.equal(stelling.herkomstRichting, "vastgelegd", waar);
          assert.equal(stelling.negatiefGeformuleerd, stelling.bronPosNeg === "negative", waar);
        }
      }
    }
  });

  test(`${naam}: controle telt precies de afgeleide richtingen`, () => {
    const afgeleid = doc.effecten.flatMap((e) =>
      e.stellingen.filter((s) => s.herkomstRichting === "afgeleid").map((s) => `${e.id} #${s.nummer}`)
    );
    assert.deepEqual(doc.controle.afgeleideRichting, afgeleid);
    assert.ok(afgeleid.length > 0, "verwacht dat deze standaard afgeleide richtingen heeft");
  });

  test(`${naam}: een bedrag is een getal of ontbreekt, nooit een 0 die iets anders betekent`, () => {
    for (const effect of doc.effecten) {
      const niveaus = effect.monetarisering.niveaus.map((n) => n.niveau);
      assert.deepEqual(niveaus, [...niveaus].sort((a, b) => a - b), "niveaus staan niet op volgorde");

      if (niveaus.length === 0) {
        assert.ok(
          doc.controle.zonderMonetarisering.includes(effect.id),
          `${effect.id} heeft geen niveaus maar staat niet in controle`
        );
      }

      for (const niveau of effect.monetarisering.niveaus) {
        assert.ok(
          niveau.totaleWaardeIndicatief === null || typeof niveau.totaleWaardeIndicatief === "number",
          `${effect.id} niveau ${niveau.niveau} heeft een bedrag dat geen getal is`
        );
        // No overlapgroep exists in this data, so there is nothing to split an
        // amount into — but the field must exist, and be a list, or a consumer
        // written against the workbook shape crashes on it.
        assert.deepEqual(niveau.proxies, []);
      }

      // Every niveau that has an amount must have its situatieschets, or the
      // figure is shown without the situation it values.
      for (const niveau of effect.monetarisering.niveaus) {
        assert.ok(
          effect.situatieschetsen.some((s) => s.niveau === niveau.niveau),
          `${effect.id} niveau ${niveau.niveau} heeft geen situatieschets`
        );
      }
    }
  });

  // The renderer switches on meta.kind, so a second shape under one kind would
  // break every consumer written against the workbook-generated documents.
  test(`${naam}: de vorm komt overeen met een workbookdocument van dezelfde kind`, () => {
    for (const effect of doc.effecten) {
      for (const veld of ["id", "slug", "effect", "categorie", "stellingen", "situatieschetsen", "monetarisering"]) {
        assert.ok(veld in effect, `${effect.id} mist ${veld}`);
      }
      assert.ok(Array.isArray(effect.situatieschetsen));
      assert.ok(Array.isArray(effect.monetarisering.niveaus));
      assert.ok("eenheid" in effect.monetarisering);
      for (const stelling of effect.stellingen) {
        assert.ok("bron" in stelling, `${effect.id} #${stelling.nummer} mist bron`);
      }
    }
  });
}

// --- Generator ---

test("richtingVan merkt een afgeleide polariteit als afgeleid", () => {
  assert.deepEqual(richtingVan("negative"), {
    richting: "negatief",
    negatiefGeformuleerd: true,
    herkomstRichting: "vastgelegd",
  });
  assert.deepEqual(richtingVan("positive"), {
    richting: "positief",
    negatiefGeformuleerd: false,
    herkomstRichting: "vastgelegd",
  });
  for (const leeg of [undefined, null, ""]) {
    assert.deepEqual(richtingVan(leeg), {
      richting: "positief",
      negatiefGeformuleerd: false,
      herkomstRichting: "afgeleid",
    });
  }
});

test("slugify maakt url-veilige sleutels van Nederlandse effectnamen", () => {
  assert.equal(slugify("Mentale gezondheid "), "mentale-gezondheid");
  assert.equal(slugify("Financiële zelfredzaamheid"), "financiele-zelfredzaamheid");
  assert.equal(slugify("Werk & inkomen"), "werk-inkomen");
});
