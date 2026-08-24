import { sendError } from "./versionedResource.js";

// Registration writes a profile, and a profile is a client write — which no
// longer exists. So it goes through here instead: the browser creates the
// account with Firebase Auth (that is Auth, not Firestore) and then posts the
// name and company with its fresh ID token.
//
// Two rules make this safe to expose:
//
// - Only `naam` and `bedrijf` are ever written. The body is not spread into the
//   document, so a caller cannot smuggle in a field the rules would have
//   refused — `admin: true` included.
// - The email and uid come from the verified token, never from the body. A
//   caller can only ever write their own profile.

export const MAX_LENGTE = { naam: 120, bedrijf: 160 };

// Trim first, then measure: " " is not a name, and a 200-character company is a
// paste accident or an attempt to make a document unreadable.
export const valideerProfiel = (body) => {
  const fouten = {};
  const waarde = {};

  for (const veld of ["naam", "bedrijf"]) {
    const ruw = body?.[veld];
    if (typeof ruw !== "string" || ruw.trim() === "") {
      fouten[veld] = `${veld} is verplicht`;
      continue;
    }
    const schoon = ruw.trim();
    if (schoon.length > MAX_LENGTE[veld]) {
      fouten[veld] = `${veld} mag maximaal ${MAX_LENGTE[veld]} tekens zijn`;
      continue;
    }
    waarde[veld] = schoon;
  }

  return Object.keys(fouten).length > 0 ? { ok: false, fouten } : { ok: true, waarde };
};

// POST .../api/v1/gebruikers/profiel
//
// Idempotent by uid: registering, then completing a half-finished registration,
// then correcting a typo all write the same document. `aangemaaktOp` is only set
// the first time, so a later edit cannot backdate or reset it.
export const handleGebruikers = async (firestore, request, response, gebruiker) => {
  const segments = (request.path || "/").split("/").filter(Boolean);
  if (segments[segments.length - 1] !== "profiel") {
    return sendError(response, 404, "Not found");
  }

  const resultaat = valideerProfiel(request.body);
  if (!resultaat.ok) {
    return sendError(response, 400, { error: "Ongeldig profiel", fouten: resultaat.fouten });
  }

  const ref = firestore.collection("users").doc(gebruiker.uid);
  const bestaand = await ref.get();

  await ref.set(
    {
      ...resultaat.waarde,
      // From the token, so this is who Firebase Auth says they are rather than
      // who the request claims to be.
      email: gebruiker.email ?? null,
      emailGeverifieerd: gebruiker.email_verified === true,
      bijgewerktOp: new Date().toISOString(),
      ...(bestaand.exists ? {} : { aangemaaktOp: new Date().toISOString() }),
    },
    { merge: true }
  );

  return response.status(200).json({
    uid: gebruiker.uid,
    ...resultaat.waarde,
    emailGeverifieerd: gebruiker.email_verified === true,
  });
};
