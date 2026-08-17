/**
 * Seed the sector meetstandaarden into Firestore so the `meetstandaard` Cloud
 * Function can serve them.
 *
 * Writes {collection}/{version} per sector from the generated documents in
 * data/. Safe to re-run: it overwrites the same doc per version.
 *
 * Run:  node seedMeetstandaard.js
 *       node seedMeetstandaard.js --sector milieu-circulariteit
 */

import admin from "firebase-admin";
import serviceAccount from "./serviceAcountSecretKey.json" assert { type: "json" };
import { STANDAARDEN } from "./meetstandaard.js";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();

const sectorFlag = process.argv.indexOf("--sector");
const onlySector = sectorFlag === -1 ? null : process.argv[sectorFlag + 1];

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
const withEffectIds = (document) =>
  document.effecten
    ? { ...document, effecten: document.effecten.map((effect) => ({ ...effect, effectId: null })) }
    : document;

for (const { sector, collection, documenten } of Object.values(STANDAARDEN)) {
  if (onlySector && onlySector !== sector) continue;

  for (const document of documenten) {
    const { version } = document.meta;
    const payload = withEffectIds(document);

    await firestore.collection(collection).doc(version).set(payload);
    const aantal = (payload.effecten || payload.interventies || []).length;
    console.log(`Seeded ${collection}/${version} — ${aantal} ${payload.effecten ? "effecten" : "interventies"}`);
  }
}

process.exit(0);
