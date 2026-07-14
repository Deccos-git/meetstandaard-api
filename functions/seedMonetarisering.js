/**
 * One-off seed: write the monetarisering onderbouwing to Firestore so the
 * `monetarisering` Cloud Function can serve it.
 *
 * Writes MeetstandaardMonetarisering/{version} from the canonical constant.
 * Before writing, resolves each effect's Firestore id (from the `effects`
 * collection, matched case- and accent-insensitively on name) and stores it as
 * `effectId`, so API consumers can join the onderbouwing onto the `database`
 * endpoint's effects. Additive (one doc, own collection); safe to re-run
 * (overwrites the same doc).
 *
 * Run: node seedMonetarisering.js
 */

import admin from "firebase-admin";
import serviceAccount from "./serviceAcountSecretKey.json" assert { type: "json" };
import { MONETARISERING_1_0 } from "./monetarisering.js";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();

const normalize = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const effectsSnapshot = await firestore.collection("effects").get();
const idByName = new Map(
  effectsSnapshot.docs.map((d) => [normalize(d.data().name), d.data().id])
);

const payload = {
  ...MONETARISERING_1_0,
  effecten: MONETARISERING_1_0.effecten.map((effect) => {
    const effectId = idByName.get(normalize(effect.effect)) || null;
    if (!effectId) {
      console.warn(`No effect in Firestore matches "${effect.effect}" — effectId set to null`);
    }
    return { ...effect, effectId };
  }),
};

const version = payload.meta.version;

await firestore.collection("MeetstandaardMonetarisering").doc(version).set(payload);

console.log(`Seeded MeetstandaardMonetarisering/${version}`);
process.exit(0);
