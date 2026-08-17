/**
 * One-off seed: write the arbeidsparticipatie parameters to Firestore so the
 * `arbeidsparticipatie` Cloud Function can serve them.
 *
 * Writes MeetstandaardParameters/{version} from the canonical constant.
 * Additive (one doc, new collection); safe to re-run (overwrites the same doc).
 *
 * Run: node seedArbeidsparticipatie.js
 */

import admin from "firebase-admin";
import serviceAccount from "./serviceAcountSecretKey.json" with { type: "json" };
import { PARAMETERS_2026_1 } from "./arbeidsparticipatie.js";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();

const version = PARAMETERS_2026_1.meta.version;

await firestore
  .collection("MeetstandaardParameters")
  .doc(version)
  .set(PARAMETERS_2026_1);

console.log(`Seeded MeetstandaardParameters/${version}`);
process.exit(0);
