import { randomUUID } from "node:crypto";
import { sendError } from "./versionedResource.js";
import { STANDAARDEN } from "./meetstandaard.js";

// Feedback on a published standaard: who says what about which version, and what
// was decided about it.
//
// Reading is public and unauthenticated — the point of collecting it is that
// everyone can see what has been said and what happened to it. Submitting is
// public too: an account was a threshold in front of the one thing this project
// asks of an outsider, and most people who spot a mistake in a standaard are not
// going to register to say so.
//
// What replaces the account is moderation, not a lower bar: a submission is
// stored the moment it arrives, and published only once a beheerder has looked
// at it. So the form is open, the public record is not.
//
// The author's email is stored but never leaves the backend. Firestore rules
// cannot filter fields, which is exactly why the public list is served by a
// function: `projecteer` decides what is public, in one place, and a field that
// is not listed there cannot leak by being added to the document later.

// The participatieladder is served by the arbeidsparticipatie function rather
// than from the meetstandaard registry, so it has to be named separately. Every
// other standaard is derived, so a new sector needs no change here.
export const FEEDBACK_STANDAARDEN = [...Object.keys(STANDAARDEN), "participatieladder"];

export const STATUSSEN = ["nieuw", "in-behandeling", "verwerkt", "afgewezen", "spam", "verwijderd"];

// What a visitor gets to see, and the reason both exceptions exist.
//
// `nieuw` is out because the form is open: a submission that published itself
// would turn the standaard's own page into anyone's noticeboard.
//
// `spam` is out because `afgewezen` cannot do that job. A rejection is public on
// purpose — someone wrote in and is owed a visible answer — which is exactly the
// wrong response to a bot. So spam is a status that ends the matter without
// repeating it.
//
// `verwijderd` is the same mechanism for a different reason: not "this was a
// bot" but "this should not stand". It is a soft delete — the document keeps
// existing and a beheerder can set the status back — because a feedback record
// that can be silently erased is not a record.
export const PUBLIEKE_STATUSSEN = ["in-behandeling", "verwerkt", "afgewezen"];

export const DOELTYPEN = ["standaard", "effect", "interventie", "parameter"];

export const MAX_TEKST = 4000;
export const MAX_BESLUIT = 4000;
export const MAX_NAAM = 120;
export const MAX_BEDRIJF = 160;
export const MAX_EMAIL = 254;

const VERSIE_FORMAAT = /^\d+(\.\d+)*$/;

// Deliberately loose. This has to catch a typo and a pasted sentence, not
// adjudicate RFC 5322: the address exists so a beheerder can come back to
// someone about their own remark, and a wrong one costs them that reply — it is
// not a credential and pretending otherwise would only reject valid addresses.
const EMAIL_FORMAAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Trim first, then measure: " " is not a name, and a 200-character organisation
// is a paste accident.
const tekstveld = (ruw, max) => {
  if (typeof ruw !== "string") return null;
  const schoon = ruw.trim();
  if (schoon === "" || schoon.length > max) return null;
  return schoon;
};

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

  // Name and email come from the submitter now that no account vouches for
  // them. Neither is verified, and neither pretends to be: a name is what
  // appears next to the remark, an address is how someone gets an answer.
  const naam = tekstveld(body?.naam, MAX_NAAM);
  if (naam === null) {
    fouten.naam = `Vul je naam in (maximaal ${MAX_NAAM} tekens)`;
  }

  // The organisation is optional. Plenty of people react as themselves, and a
  // required field would only teach them to type a dash.
  const bedrijfRuw = body?.bedrijf;
  let bedrijf = null;
  if (typeof bedrijfRuw === "string" && bedrijfRuw.trim() !== "") {
    bedrijf = tekstveld(bedrijfRuw, MAX_BEDRIJF);
    if (bedrijf === null) {
      fouten.bedrijf = `Organisatie mag maximaal ${MAX_BEDRIJF} tekens zijn`;
    }
  }

  const email = tekstveld(body?.email, MAX_EMAIL);
  if (email === null || !EMAIL_FORMAAT.test(email)) {
    fouten.email = "Vul een geldig e-mailadres in";
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
      auteur: { naam, bedrijf },
      auteurEmail: email,
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

// The beheerder's view: the public projection plus the address the submitter
// left. Moderating a queue you cannot see is not moderation, and since the form
// stopped requiring an account this is the only way to reach whoever wrote in.
// A second projection rather than a wider first one — the public list must not
// be able to grow this field by accident.
export const projecteerVoorBeheer = (id, doc) => ({
  ...projecteer(id, doc),
  auteurEmail: doc.auteurEmail ?? null,
});

const nu = () => new Date().toISOString();

// POST .../api/v1/feedback
//
// No authentication: the form is open. What keeps this from being a write-hole
// is that nothing it stores is public until a beheerder says so, that the body
// is validated field by field rather than spread into the document, and that
// the endpoint carries the `schrijven` rate limit (see index.js).
export const handleIndienen = async (firestore, request, response) => {
  const resultaat = valideerFeedback(request.body);
  if (!resultaat.ok) {
    return sendError(response, 400, { error: "Ongeldige feedback", fouten: resultaat.fouten });
  }

  const id = randomUUID();
  const document = {
    ...resultaat.waarde,
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
  // A reason is owed to whoever will read the decision. The other three
  // statuses have no reader to owe: "nieuw" is the state feedback arrives in,
  // and "spam" and "verwijderd" are the states it leaves in without ever being
  // shown to anyone.
  if (PUBLIEKE_STATUSSEN.includes(status) && tekst === "") {
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

  const besluit = PUBLIEKE_STATUSSEN.includes(status)
    ? { toelichting: tekst, door: gebruiker.email ?? null, op: nu() }
    : null;

  await ref.set({ status, besluit, bijgewerktOp: nu() }, { merge: true });
  return response.status(200).json(projecteer(id, { ...bestaand.data(), status, besluit }));
};

// De standaard uit het pad, of null als het er geen is.
const standaardUitPad = (request) => {
  const segments = (request.path || "/").split("/").filter(Boolean);
  const standaard = segments[segments.length - 1];
  return FEEDBACK_STANDAARDEN.includes(standaard) ? standaard : null;
};

// Alle feedback op een standaard, ongesorteerd opgehaald.
//
// Deliberately unsorted in the query and sorted here instead: ordering in
// Firestore alongside the standaard filter needs a composite index, and
// deploying indexes replaces the whole set. Not worth an index for a list this
// size.
const haalOp = async (firestore, standaard) => {
  const snapshot = await firestore.collection("feedback").where("standaard", "==", standaard).get();

  return snapshot.docs.sort((a, b) =>
    String(b.data().aangemaaktOp).localeCompare(String(a.data().aangemaaktOp))
  );
};

// GET .../api/v1/feedback/{standaard}
export const handleLijst = async (firestore, request, response) => {
  const standaard = standaardUitPad(request);
  if (!standaard) {
    return sendError(response, 404, {
      error: `Onbekende standaard: ${(request.path || "/").split("/").filter(Boolean).pop()}`,
      standaarden: FEEDBACK_STANDAARDEN,
    });
  }

  const docs = await haalOp(firestore, standaard);
  const items = docs
    .filter((doc) => PUBLIEKE_STATUSSEN.includes(doc.data().status))
    .map((doc) => projecteer(doc.id, doc.data()));

  return response.status(200).json({ standaard, aantal: items.length, feedback: items });
};

// GET .../api/v1/feedback/{standaard} op de beheerfunctie.
//
// Hetzelfde pad, andere functie: alles, inclusief wat nog niet is beoordeeld en
// inclusief het e-mailadres. Alleen voor beheerders.
export const handleBeheerLijst = async (firestore, request, response, gebruiker) => {
  if (gebruiker.admin !== true) {
    return sendError(response, 403, { error: "Alleen een beheerder kan dit inzien." });
  }

  const standaard = standaardUitPad(request);
  if (!standaard) {
    return sendError(response, 404, {
      error: `Onbekende standaard: ${(request.path || "/").split("/").filter(Boolean).pop()}`,
      standaarden: FEEDBACK_STANDAARDEN,
    });
  }

  const docs = await haalOp(firestore, standaard);
  const items = docs.map((doc) => projecteerVoorBeheer(doc.id, doc.data()));

  return response.status(200).json({ standaard, aantal: items.length, feedback: items });
};
