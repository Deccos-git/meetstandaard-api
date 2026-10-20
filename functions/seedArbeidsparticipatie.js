/**
 * Seed one participatieladder parameter set to Firestore so the
 * `arbeidsparticipatie` Cloud Function can serve it.
 *
 * Writes MeetstandaardParameters/{version} from the canonical constant. The
 * version is required and an existing version is skipped: the app fetches the
 * newest set unpinned (deccos-projects, useParticipationParameters.js), so
 * seeding a version changes the app's figures at once. Seed 2026.3 only after
 * the app computes with it and pins it.
 *
 * Run: node seedArbeidsparticipatie.js --version 2026.3
 */

import admin from "firebase-admin";
import serviceAccount from "./serviceAcountSecretKey.json" with { type: "json" };
import { PARAMETERS_2026_1, PARAMETERS_2026_2, PARAMETERS_2026_3 } from "./arbeidsparticipatie.js";

const SETS = Object.fromEntries(
  [PARAMETERS_2026_1, PARAMETERS_2026_2, PARAMETERS_2026_3].map((p) => [p.meta.version, p])
);

const flag = process.argv.indexOf("--version");
const version = flag === -1 ? null : process.argv[flag + 1];
if (!SETS[version]) {
  console.error(`Geef --version met een van: ${Object.keys(SETS).join(", ")}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const ref = admin.firestore().collection("MeetstandaardParameters").doc(version);

if ((await ref.get()).exists) {
  console.log(`Skipped MeetstandaardParameters/${version} — bestaat al; een gepubliceerde versie wordt niet overschreven.`);
  process.exit(0);
}

await ref.set(SETS[version]);
console.log(`Seeded MeetstandaardParameters/${version}`);
process.exit(0);
