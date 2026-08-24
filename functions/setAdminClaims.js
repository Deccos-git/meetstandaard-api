/**
 * Grant the `admin` custom claim to the accounts that run the panel.
 *
 * The claim is the only thing that distinguishes an admin from a visitor who
 * registered on the public site. It is checked in two places that both matter:
 * the Firestore rules (which is what actually protects the panel's data) and
 * the feedback endpoints (which is what lets a status be set).
 *
 * Run:  node setAdminClaims.js            (report who has it)
 *       node setAdminClaims.js --apply    (grant it to ADMIN_EMAILS)
 *
 * A user must sign out and back in — or wait for their ID token to refresh —
 * before a newly granted claim shows up in their token.
 */

import admin from "firebase-admin";
import serviceAccount from "./serviceAcountSecretKey.json" with { type: "json" };

// Deliberately a literal list rather than a flag: granting admin is not
// something to do by typing an address at a prompt. Adding one is a commit.
export const ADMIN_EMAILS = ["info@deccos.nl", "tomas@alexanderimpact.nl"];

const apply = process.argv.includes("--apply");

const auth = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
}).auth();

for (const email of ADMIN_EMAILS) {
  const user = await auth.getUserByEmail(email);
  const isAdmin = user.customClaims?.admin === true;

  if (isAdmin) {
    console.log(`${email} — already admin`);
    continue;
  }
  if (!apply) {
    console.log(`${email} — would grant admin (re-run with --apply)`);
    continue;
  }

  // Merge rather than replace: claims are a single object per user, so setting
  // {admin:true} on its own would drop any other claim that exists.
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
  console.log(`${email} — granted admin`);
}

// Anyone holding the claim who is not on the list is a leftover and should be
// noticed, not silently tolerated.
const { users } = await auth.listUsers(1000);
const unexpected = users.filter(
  (u) => u.customClaims?.admin === true && !ADMIN_EMAILS.includes(u.email)
);
if (unexpected.length > 0) {
  console.log(`\nUnexpected admins: ${unexpected.map((u) => u.email).join(", ")}`);
}

process.exit(0);
