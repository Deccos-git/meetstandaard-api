import { randomUUID } from "node:crypto";
import { sendError } from "./versionedResource.js";
import { STANDAARDEN } from "./meetstandaard.js";

// Feedback on a published standaard: who says what about which version, and what
// was decided about it.
//
// Reading is public and unauthenticated — the point of collecting it is that
// everyone can see what has been said and what happened to it. Writing goes
// through an authenticated endpoint, because no client may write to Firestore.
//
// The author's email is stored but never leaves the backend. Firestore rules
// cannot filter fields, which is exactly why the public list is served by a
// function: `projecteer` decides what is public, in one place, and a field that
// is not listed there cannot leak by being added to the document later.

// The participatieladder is served by the arbeidsparticipatie function rather
// than from the meetstandaard registry, so it has to be named separately. Every
// other standaard is derived, so a new sector needs no change here.
export const FEEDBACK_STANDAARDEN = [...Object.keys(STANDAARDEN), "participatieladder"];

export const STATUSSEN = ["nieuw", "in-behandeling", "verwerkt", "afgewezen"];
export const DOELTYPEN = ["standaard", "effect", "interventie", "parameter"];

export const MAX_TEKST = 4000;
export const MAX_BESLUIT = 4000;

const VERSIE_FORMAAT = /^\d+(\.\d+)*$/;

export const valideerFeedback = (body) => {
  const fouten = {};

  if (!FEEDBACK_STANDAARDEN.includes(body?.standaard)) {
    fouten.standaard = "Onbekende standaard";
  }

  // The version is pinned on the feedback itself: a remark about a statement is
  // about the wording it had when it was read. Without this, a reaction to 0.9
  // silently reads as a reaction to 1.0 the day 1.0 ships.
  if (typeof body?.versie !== "string" || !VERSIE_FORMAAT.test(body.versie)) {
    fouten.versie = "Versie ontbreekt of heeft een ongeldige vorm";
  }

  const type = body?.doel?.type;
  if (!DOELTYPEN.includes(type)) {
    fouten.doel = `doel.type moet een van ${DOELTYPEN.join(", ")} zijn`;
  } else if (type !== "standaard") {
    const id = body?.doel?.id;
    if (typeof id !== "string" || id.trim() === "" || id.length > 120) {
      fouten.doel = "Feedback op een onderdeel heeft een doel.id nodig";
    }
  }

  const tekst = typeof body?.tekst === "string" ? body.tekst.trim() : "";
  if (tekst === "") {
    fouten.tekst = "Schrijf iets voordat je verstuurt";
  } else if (tekst.length > MAX_TEKST) {
    fouten.tekst = `Feedback mag maximaal ${MAX_TEKST} tekens zijn`;
  }

  if (Object.keys(fouten).length > 0) return { ok: false, fouten };

  return {
    ok: true,
    waarde: {
      standaard: body.standaard,
      versie: body.versie,
      // Only the type and the id. The label a reader sees is resolved from the
      // pinned document by whoever renders it, so a submitter cannot put words
      // in the standaard's mouth by naming the target themselves.
      doel: { type, id: type === "standaard" ? null : body.doel.id.trim() },
      tekst,
    },
  };
};

// What the public sees. Everything not named here stays server-side — the
// author's email above all, which is why this list is explicit rather than a
// delete of the fields we happen to remember are sensitive.
export const projecteer = (id, doc) => ({
  id,
  standaard: doc.standaard,
  versie: doc.versie,
  doel: doc.doel,
  tekst: doc.tekst,
  auteur: { naam: doc.auteur?.naam ?? null, bedrijf: doc.auteur?.bedrijf ?? null },
  status: doc.status,
  besluit: doc.besluit ?? null,
  aangemaaktOp: doc.aangemaaktOp,
  bijgewerktOp: doc.bijgewerktOp,
});

const nu = () => new Date().toISOString();

// POST .../api/v1/feedback
export const handleIndienen = async (firestore, request, response, gebruiker) => {
  // A verified address is the cheapest brake on a public write path, and the
  // reason registration sends a verification mail at all.
  //
  // The admin claim is exempt, and not as a convenience: it is granted by
  // running setAdminClaims.js against a hardcoded list of addresses, which is
  // stronger provenance than clicking a link in a mail. It also unblocks the
  // accounts that predate this gate — info@deccos.nl was created in 2024 and
  // never had a verification mail to click.
  if (gebruiker.email_verified !== true && gebruiker.admin !== true) {
    return sendError(response, 403, {
      error: "Bevestig eerst je e-mailadres. Daarna kun je feedback geven.",
    });
  }

  const resultaat = valideerFeedback(request.body);
  if (!resultaat.ok) {
    return sendError(response, 400, { error: "Ongeldige feedback", fouten: resultaat.fouten });
  }

  // Name and company come from the stored profile, never from the request: the
  // name shown next to a reaction has to be the one the account registered with.
  const profiel = (await firestore.collection("users").doc(gebruiker.uid).get()).data();
  if (!profiel?.naam) {
    return sendError(response, 400, {
      error: "Je profiel is nog niet compleet. Vul je naam en organisatie aan.",
    });
  }

  const id = randomUUID();
  const document = {
    ...resultaat.waarde,
    auteur: { uid: gebruiker.uid, naam: profiel.naam, bedrijf: profiel.bedrijf ?? null },
    auteurEmail: gebruiker.email ?? null,
    status: "nieuw",
    besluit: null,
    aangemaaktOp: nu(),
    bijgewerktOp: nu(),
  };

  await firestore.collection("feedback").doc(id).set(document);
  return response.status(201).json(projecteer(id, document));
};

// POST .../api/v1/feedback/{id}/besluit
//
// Status and reasoning are set together on purpose. A status change without a
// reason is exactly what makes a feedback process feel like a void to the person
// who wrote in — and the decision is public, so it has to say something.
export const handleBesluit = async (firestore, request, response, gebruiker) => {
  if (gebruiker.admin !== true) {
    return sendError(response, 403, { error: "Alleen een beheerder kan feedback beoordelen." });
  }

  const segments = (request.path || "/").split("/").filter(Boolean);
  const id = segments[segments.length - 2];
  if (!id || segments[segments.length - 1] !== "besluit") {
    return sendError(response, 404, "Not found");
  }

  const { status, toelichting } = request.body || {};
  const fouten = {};

  if (!STATUSSEN.includes(status)) {
    fouten.status = `status moet een van ${STATUSSEN.join(", ")} zijn`;
  }

  const tekst = typeof toelichting === "string" ? toelichting.trim() : "";
  // "nieuw" is the state feedback arrives in, so it needs no justification;
  // every other status is a decision someone made and owes a sentence.
  if (status !== "nieuw" && tekst === "") {
    fouten.toelichting = "Leg kort uit waarom, dit is publiek zichtbaar";
  } else if (tekst.length > MAX_BESLUIT) {
    fouten.toelichting = `Toelichting mag maximaal ${MAX_BESLUIT} tekens zijn`;
  }

  if (Object.keys(fouten).length > 0) {
    return sendError(response, 400, { error: "Ongeldig besluit", fouten });
  }

  const ref = firestore.collection("feedback").doc(id);
  const bestaand = await ref.get();
  if (!bestaand.exists) {
    return sendError(response, 404, { error: "Deze feedback bestaat niet." });
  }

  const besluit =
    status === "nieuw" ? null : { toelichting: tekst, door: gebruiker.email ?? null, op: nu() };

  await ref.set({ status, besluit, bijgewerktOp: nu() }, { merge: true });
  return response.status(200).json(projecteer(id, { ...bestaand.data(), status, besluit }));
};

// GET .../api/v1/feedback/{standaard}
//
// Deliberately unsorted in the query and sorted here instead: ordering in
// Firestore alongside the standaard filter needs a composite index, and
// deploying indexes replaces the whole set. Not worth an index for a list this
// size.
export const handleLijst = async (firestore, request, response) => {
  const segments = (request.path || "/").split("/").filter(Boolean);
  const standaard = segments[segments.length - 1];

  if (!FEEDBACK_STANDAARDEN.includes(standaard)) {
    return sendError(response, 404, {
      error: `Onbekende standaard: ${standaard}`,
      standaarden: FEEDBACK_STANDAARDEN,
    });
  }

  const snapshot = await firestore.collection("feedback").where("standaard", "==", standaard).get();

  const items = snapshot.docs
    .map((doc) => projecteer(doc.id, doc.data()))
    .sort((a, b) => String(b.aangemaaktOp).localeCompare(String(a.aangemaaktOp)));

  return response.status(200).json({ standaard, aantal: items.length, feedback: items });
};

// One POST function serves both writes, so the two routes stay next to the
// validation they share. Which one is decided by the path, not by the body: a
// caller must not be able to turn a submission into a decision by adding a
// field.
export const handleFeedbackSchrijven = (firestore, request, response, gebruiker) => {
  const segments = (request.path || "/").split("/").filter(Boolean);

  return segments[segments.length - 1] === "besluit"
    ? handleBesluit(firestore, request, response, gebruiker)
    : handleIndienen(firestore, request, response, gebruiker);
};
