/**
 * Seed the sector meetstandaarden into Firestore so the `meetstandaard` Cloud
 * Function can serve them.
 *
 * Writes {collection}/{version} per sector from the generated documents in
 * data/. A version that already exists is SKIPPED unless --force is given: a
 * published version is immutable (ADR-001), and this script writes with set(),
 * which replaces the whole document.
 *
 * That is not theoretical. The live energiearmoede 0.9 carries a `uid` on every
 * effect that exists nowhere in this repo — added out of band — and the API
 * serves it. An unguarded re-seed silently deleted all thirteen of them.
 *
 * Run:  node seedMeetstandaard.js
 *       node seedMeetstandaard.js --sector milieu-circulariteit
 *       node seedMeetstandaard.js --sector energiearmoede --force
 */

import admin from "firebase-admin";
import serviceAccount from "./serviceAcountSecretKey.json" with { type: "json" };
import { STANDAARDEN } from "./meetstandaard.js";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();

const sectorFlag = process.argv.indexOf("--sector");
const onlySector = sectorFlag === -1 ? null : process.argv[sectorFlag + 1];
const force = process.argv.includes("--force");

// Which field paths a re-seed would change. Reported before skipping, because
// "already there, identical" and "would rewrite 13 fields" are the same event
// to the script and completely different events to whoever ran it.
const verschillen = (live, nieuw, pad = "", uit = []) => {
  if (uit.length > 12 || live === nieuw) return uit;

  const beideObject = live && typeof live === "object" && nieuw && typeof nieuw === "object";
  if (!beideObject) {
    uit.push(pad || "(hele document)");
    return uit;
  }
  for (const sleutel of new Set([...Object.keys(live), ...Object.keys(nieuw)])) {
    verschillen(live[sleutel], nieuw[sleutel], `${pad}.${sleutel}`, uit);
  }
  return uit;
};

// `effectId` links an effect in this standard to a record in the dashboard's
// `effects` collection. It is deliberately left null for every effect. Only the
// effect-based standaarden have `effecten` at all — an interventiebibliotheek
// passes through untouched.
//
// That collection holds one record per (effect, sector), each with its own
// question wording, and it has no energiearmoede records — so the only
// candidates are another sector's variants. Matching them on name produced joins
// that assert two effects are the same when their questions differ, which is
// exactly the comparison this standard exists to prevent: an effect is only the
// same across sectors when its questions are *identical*. A wrong id is worse
// than a missing one, because software trusts it silently.
//
// Consumers key on `slug` (stable, url-safe) or `id` (EFF-01…EFF-13) instead;
// `null` is documented as "no counterpart in the dashboard".
//
// To restore the join, add energiearmoede records to the `effects` collection
// and resolve against those — not by name against another sector's records.
//
// The snapshots in exportEffectenStandaard.js are the exception: those documents
// *are* the effects collection, so their `effectId` is the record's own id — a
// real link, not a name match. Only fill in the null where the generator left
// the field out entirely.
const withEffectIds = (document) =>
  document.effecten
    ? {
        ...document,
        effecten: document.effecten.map((effect) => ({
          ...effect,
          effectId: effect.effectId ?? null,
        })),
      }
    : document;

let geschreven = 0;
let overgeslagen = 0;

for (const { sector, collection, documenten } of Object.values(STANDAARDEN)) {
  if (onlySector && onlySector !== sector) continue;

  for (const document of documenten) {
    const { version } = document.meta;
    const payload = withEffectIds(document);
    const ref = firestore.collection(collection).doc(version);

    const bestaand = await ref.get();
    if (bestaand.exists && !force) {
      const paden = verschillen(bestaand.data(), payload);
      overgeslagen += 1;

      if (paden.length === 0) {
        console.log(`Skipped ${collection}/${version} — bestaat al, identiek`);
      } else {
        console.log(
          `Skipped ${collection}/${version} — bestaat al en WIJKT AF; --force zou dit overschrijven:`
        );
        for (const p of paden.slice(0, 8)) console.log(`    ${p}`);
        if (paden.length > 8) console.log(`    … en meer`);
      }
      continue;
    }

    await ref.set(payload);
    geschreven += 1;
    const aantal = (payload.effecten || payload.interventies || []).length;
    const hoe = bestaand.exists ? "Overwrote" : "Seeded";
    console.log(`${hoe} ${collection}/${version} — ${aantal} ${payload.effecten ? "effecten" : "interventies"}`);
  }
}

console.log(`\nKlaar: ${geschreven} geschreven, ${overgeslagen} overgeslagen.`);
if (overgeslagen > 0 && !force) {
  console.log("Een bestaande versie is niet aangeraakt. Gebruik --force als dat wel de bedoeling is.");
}

process.exit(0);
