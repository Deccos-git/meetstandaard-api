/**
 * Snapshot arbeidsparticipatie and gelijke kansen out of the shared `effects`
 * collection into versioned documents, so all five standaarden are served by
 * one endpoint and every version comes from the API instead of a constant in
 * the frontend.
 *
 * This is not the migration in docs/migratie-standaarden.md. That one routes
 * these standaarden through a workbook so they can be *edited* again, and adds
 * the fields the current data has never had. This only publishes what exists
 * today, and states in `controle` exactly what it could not fill.
 *
 * Run:  node exportEffectenStandaard.js --sector arbeidsparticipatie --version 0.9 --released-at 2026-08-24
 *       node exportEffectenStandaard.js --all
 */

import { writeFileSync } from "node:fs";
import admin from "firebase-admin";
import serviceAccount from "./serviceAcountSecretKey.json" with { type: "json" };

// The two standaarden that live as a sector tag on the shared collection, with
// the version each is known by. Those version numbers existed only in
// src/standaarden.js; this is where they stop being a frontend constant.
export const EFFECT_STANDAARDEN = {
  arbeidsparticipatie: { label: "Arbeidsparticipatie", version: "0.9" },
  "gelijke-kansen": { label: "Gelijke kansen", version: "1.0" },
};

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

// Dutch diacritics only — the source is Dutch effect names and nothing else has
// ever appeared in them.
export const slugify = (name) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// `posNeg` records whether a statement is reverse-coded. In arbeidsparticipatie
// only 21 of 86 statements carry it and every one of those says "negative":
// the convention when the questionnaire was entered was to tag only the
// reverse-coded items and leave the rest blank. Confirmed 2026-08-24; see
// docs/decisions.md#adr-008.
//
// So blank means positief — but it is a convention, not a recorded value, and
// the two must stay distinguishable. `herkomst` says which one you are looking
// at, exactly as `afgeleid: true` does on a derived aanname (ADR-007). A
// consumer that will not act on a derived polarity can filter on it.
export const richtingVan = (posNeg) => {
  if (posNeg === "negative")
    return { richting: "negatief", negatiefGeformuleerd: true, herkomstRichting: "vastgelegd" };
  if (posNeg === "positive")
    return { richting: "positief", negatiefGeformuleerd: false, herkomstRichting: "vastgelegd" };
  return { richting: "positief", negatiefGeformuleerd: false, herkomstRichting: "afgeleid" };
};

export const buildDocument = ({ sector, label, version, releasedAt, categories, effects, questions }) => {
  const categorieNaam = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const categoriePositie = Object.fromEntries(categories.map((c) => [c.id, c.position ?? 0]));

  const gekozen = effects
    .filter((e) => (e.sectors || []).includes(sector))
    .sort(
      (a, b) =>
        (categoriePositie[a.categorie] ?? 0) - (categoriePositie[b.categorie] ?? 0) ||
        (a.position ?? 0) - (b.position ?? 0)
    );

  const afgeleideRichting = [];
  const zonderOnderbouwing = [];
  const zonderMonetarisering = [];

  const effecten = gekozen.map((effect, index) => {
    const id = `EFF-${String(index + 1).padStart(2, "0")}`;

    const stellingen = questions
      .filter((q) => q.effectId === effect.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((q, i) => {
        const { richting, negatiefGeformuleerd, herkomstRichting } = richtingVan(q.posNeg);
        if (herkomstRichting === "afgeleid") afgeleideRichting.push(`${id} #${i + 1}`);

        return {
          nummer: i + 1,
          stelling: q.name,
          gebruikteSchaal: "5-punt Likert (1-5)",
          richting,
          negatiefGeformuleerd,
          herkomstRichting,
          // The verbatim source value, so `herkomstRichting: "afgeleid"` can be
          // traced back to a blank rather than taken on faith.
          bronPosNeg: q.posNeg ?? null,
          // Never recorded for these standaarden; the field exists so the shape
          // matches a workbook-generated document rather than to carry a value.
          bron: null,
          doelgroepen: q.targetGroupsMode === "custom" ? q.targetGroups || [] : null,
          bronId: q.id,
        };
      });

    const scores = (effect.scores || []).slice().sort((a, b) => a.score - b.score);

    // Same field names as a workbook-generated meetstandaard, because both
    // publish `meta.kind: "meetstandaard"` and a consumer switches on that. A
    // second shape under one kind would mean every consumer needs a special
    // case, which is exactly what the kind exists to prevent.
    const situatieschetsen = scores.map((s) => ({
      niveau: s.score,
      label: null,
      situatieschets: s.situation ?? null,
      bron: null,
    }));

    const niveaus = scores.map((s) => {
      if (!s.onderbouwing) zonderOnderbouwing.push(`${id} niveau ${s.score}`);
      return {
        niveau: s.score,
        totaleWaardeIndicatief: typeof s.monetaryValue === "number" ? s.monetaryValue : null,
        onderbouwing: s.onderbouwing || null,
        // Energiearmoede splits each amount into stakeholder proxies with an
        // overlapgroep. This data has one lump sum per niveau and no overlap
        // information at all, so there is nothing to split it into — and
        // without overlapgroep these amounts cannot be summed across effects.
        proxies: [],
      };
    });

    if (niveaus.length === 0) zonderMonetarisering.push(id);

    const slug = slugify(effect.name);

    return {
      id,
      slug,
      // Cross-standaard key, and the consumer's MSIId. `id` restarts at EFF-01
      // in every standaard and slugs repeat across sectors, so neither is unique
      // on its own. Same composition the workbook generator uses.
      uid: `${sector}:${slug}`,
      effect: effect.name,
      categorie: categorieNaam[effect.categorie] ?? null,
      definitie: effect.description || null,
      // Unlike the workbook-generated standaarden, this document *is* the
      // effects collection, so the link to the dashboard record is the real id
      // rather than a guess. See the note in seedMeetstandaard.js.
      effectId: effect.id,
      stellingen,
      situatieschetsen,
      // `eenheid` states what an amount is per (person, household, year). It was
      // never recorded here, so it stays null rather than being guessed at.
      monetarisering: { eenheid: null, niveaus },
    };
  });

  const totaalStellingen = effecten.reduce((n, e) => n + e.stellingen.length, 0);

  return {
    meta: {
      version,
      sector,
      sectorLabel: label,
      kind: "meetstandaard",
      releasedAt,
      source: "effects/questions/categories (dashboarddatabase), snapshot",
      generatedBy: "functions/exportEffectenStandaard.js",
      toelichting:
        "Momentopname van de standaard zoals die in de dashboarddatabase staat, gepubliceerd zodat de versie uit de API komt in plaats van uit de frontend. " +
        "Dit document is armer dan een uit een workbook gegenereerde standaard: er zijn geen proxies per stakeholder, geen overlapgroepen en geen bronvermelding per stelling. " +
        "Zie `controle` voor wat ontbreekt. Een stelling met `herkomstRichting: \"afgeleid\"` had geen polariteit in de bron; die is ingevuld volgens de conventie dat alleen omgepoolde stellingen werden gemarkeerd (zie docs/decisions.md#adr-008). Vastgelegd en afgeleid zijn opzettelijk uit elkaar te houden.",
    },
    effecten,
    controle: {
      aantallen: { effecten: effecten.length, stellingen: totaalStellingen },
      afgeleideRichting,
      zonderOnderbouwing,
      zonderMonetarisering,
      ontbrekendeVelden: [
        "stellingen[].bron — de herkomst van een stelling is nooit vastgelegd",
        "stellingen[].posNeg — bij arbeidsparticipatie alleen op omgepoolde stellingen ingevuld; de rest is afgeleid",
        "monetarisering.eenheid — waar een bedrag per geldt is nooit vastgelegd",
        "monetarisering.niveaus[].proxies — één bedrag per niveau, niet uitgesplitst per stakeholder",
        "situatieschetsen[].label en .bron — alleen de omschrijving zelf bestaat",
        "aggregatie/overlapgroep — bedragen mogen niet over effecten heen opgeteld worden",
        "bronnen, parameters, gevoeligheid, audit — bestaan alleen in workbookgestuurde standaarden",
      ],
    },
  };
};

const main = async () => {
  const firestore = admin
    .initializeApp({ credential: admin.credential.cert(serviceAccount) })
    .firestore();

  const [cats, effs, qs] = await Promise.all([
    firestore.collection("categories").get(),
    firestore.collection("effects").get(),
    firestore.collection("questions").get(),
  ]);

  const categories = cats.docs.map((d) => d.data());
  const effects = effs.docs.map((d) => d.data());
  const questions = qs.docs.map((d) => d.data());

  const only = arg("sector");
  const releasedAt = arg("released-at", new Date().toISOString().slice(0, 10));

  for (const [sector, { label, version }] of Object.entries(EFFECT_STANDAARDEN)) {
    if (only && only !== sector) continue;

    const document = buildDocument({
      sector,
      label,
      version: arg("version", version),
      releasedAt,
      categories,
      effects,
      questions,
    });

    const path = `data/meetstandaard-${sector}-${document.meta.version}.json`;
    writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);

    const { aantallen, afgeleideRichting, zonderMonetarisering } = document.controle;
    console.log(
      `${path} — ${aantallen.effecten} effecten, ${aantallen.stellingen} stellingen, ` +
        `${afgeleideRichting.length} afgeleide richting, ${zonderMonetarisering.length} zonder monetarisering`
    );
  }

  process.exit(0);
};

// Importable for tests without hitting Firestore.
if (process.argv[1]?.endsWith("exportEffectenStandaard.js")) await main();
