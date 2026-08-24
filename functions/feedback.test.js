import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOELTYPEN,
  FEEDBACK_STANDAARDEN,
  MAX_TEKST,
  STATUSSEN,
  handleBesluit,
  handleIndienen,
  handleLijst,
  projecteer,
  valideerFeedback,
} from "./feedback.js";
import { fakeResponse } from "./versionedResource.test.js";

// --- Validatie ---

test("elke gepubliceerde standaard kan feedback krijgen", () => {
  for (const standaard of ["energiearmoede", "milieu-circulariteit", "arbeidsparticipatie", "gelijke-kansen", "participatieladder"]) {
    assert.ok(FEEDBACK_STANDAARDEN.includes(standaard), standaard);
  }
});

const geldig = {
  standaard: "energiearmoede",
  versie: "0.9",
  doel: { type: "effect", id: "EFF-01" },
  tekst: "De formulering van stelling 3 is dubbelzinnig.",
};

test("een geldige inzending komt er doorheen", () => {
  const resultaat = valideerFeedback(geldig);
  assert.equal(resultaat.ok, true);
  assert.equal(resultaat.waarde.doel.id, "EFF-01");
});

test("een onbekende standaard wordt geweigerd", () => {
  assert.equal(valideerFeedback({ ...geldig, standaard: "warmtetransitie" }).ok, false);
});

// The version pins what the remark is about. Without it a reaction to 0.9 reads
// as a reaction to whatever ships next.
test("de versie is verplicht en moet dotted numbers zijn", () => {
  for (const versie of [undefined, "", "latest", "v0.9", "0.9-beta", 9]) {
    const resultaat = valideerFeedback({ ...geldig, versie });
    assert.equal(resultaat.ok, false, `${versie} had geweigerd moeten worden`);
    assert.ok(resultaat.fouten.versie);
  }
  assert.equal(valideerFeedback({ ...geldig, versie: "2026.1" }).ok, true);
});

test("feedback op een onderdeel heeft een id nodig, op de standaard niet", () => {
  assert.equal(valideerFeedback({ ...geldig, doel: { type: "effect" } }).ok, false);
  const opStandaard = valideerFeedback({ ...geldig, doel: { type: "standaard" } });
  assert.equal(opStandaard.ok, true);
  assert.equal(opStandaard.waarde.doel.id, null);
});

test("een onbekend doeltype wordt geweigerd", () => {
  assert.equal(valideerFeedback({ ...geldig, doel: { type: "verzonnen", id: "x" } }).ok, false);
  for (const type of DOELTYPEN) {
    assert.equal(valideerFeedback({ ...geldig, doel: { type, id: "x" } }).ok, true, type);
  }
});

test("lege of te lange tekst wordt geweigerd", () => {
  assert.equal(valideerFeedback({ ...geldig, tekst: "   " }).ok, false);
  assert.equal(valideerFeedback({ ...geldig, tekst: "x".repeat(MAX_TEKST + 1) }).ok, false);
});

// --- Projectie ---

// The single reason the public list is served by a function instead of by
// Firestore rules: rules cannot hide a field.
test("het e-mailadres van de indiener wordt nooit geprojecteerd", () => {
  const publiek = projecteer("f1", {
    ...geldig,
    auteur: { uid: "u1", naam: "Gijs", bedrijf: "Deccos" },
    auteurEmail: "geheim@voorbeeld.nl",
    status: "nieuw",
    aangemaaktOp: "2026-08-24T10:00:00.000Z",
  });

  assert.equal(JSON.stringify(publiek).includes("geheim@voorbeeld.nl"), false);
  assert.equal(publiek.auteur.uid, undefined, "ook de uid hoort niet publiek te zijn");
  assert.equal(publiek.auteur.naam, "Gijs");
  assert.equal(publiek.auteur.bedrijf, "Deccos");
});

// --- Schrijfpad ---

const fakeFirestore = (opslag = {}) => {
  const maakDoc = (naam, id) => ({
    get: async () => ({
      exists: `${naam}/${id}` in opslag,
      id,
      data: () => opslag[`${naam}/${id}`],
    }),
    set: async (waarde, opties) => {
      opslag[`${naam}/${id}`] = opties?.merge
        ? { ...(opslag[`${naam}/${id}`] || {}), ...waarde }
        : waarde;
    },
  });
  return {
    collection: (naam) => ({
      doc: (id) => maakDoc(naam, id),
      where: (veld, _op, waarde) => ({
        get: async () => ({
          docs: Object.entries(opslag)
            .filter(([sleutel, d]) => sleutel.startsWith(`${naam}/`) && d[veld] === waarde)
            .map(([sleutel, d]) => ({ id: sleutel.split("/")[1], data: () => d })),
        }),
      }),
    }),
    _opslag: opslag,
  };
};

const profiel = { "users/u1": { naam: "Gijs", bedrijf: "Deccos" } };
const indiener = { uid: "u1", email: "gijs@voorbeeld.nl", email_verified: true };

const indien = async (body, gebruiker = indiener, opslag = { ...profiel }) => {
  const firestore = fakeFirestore(opslag);
  const response = fakeResponse();
  await handleIndienen(firestore, { path: "/api/v1/feedback", body, headers: {} }, response, gebruiker);
  return { response, opslag: firestore._opslag };
};

test("een onbevestigd e-mailadres mag geen feedback plaatsen", async () => {
  const { response, opslag } = await indien(geldig, { ...indiener, email_verified: false });
  assert.equal(response.statusCode, 403);
  assert.equal(Object.keys(opslag).length, 1, "er is niets bijgeschreven");
});

// The claim is granted out of band, by running a script against a fixed list of
// addresses. That is stronger provenance than a clicked link, and it is what
// unblocks the accounts that existed before this gate did.
test("een beheerder mag ook zonder bevestigd adres plaatsen", async () => {
  const opslag = { "users/a1": { naam: "Gijs", bedrijf: "Deccos" } };
  const firestore = fakeFirestore(opslag);
  const response = fakeResponse();
  await handleIndienen(
    firestore,
    { path: "/api/v1/feedback", body: geldig, headers: {} },
    response,
    { uid: "a1", email: "info@deccos.nl", email_verified: false, admin: true }
  );

  assert.equal(response.statusCode, 201);
  assert.ok(Object.keys(opslag).some((k) => k.startsWith("feedback/")));
});

test("zonder profiel kan er geen naam bij de reactie", async () => {
  const { response } = await indien(geldig, indiener, {});
  assert.equal(response.statusCode, 400);
});

test("de naam komt uit het profiel, niet uit de inzending", async () => {
  const { response, opslag } = await indien({ ...geldig, auteur: { naam: "Iemand Anders" } });
  assert.equal(response.statusCode, 201);

  const opgeslagen = Object.entries(opslag).find(([k]) => k.startsWith("feedback/"))[1];
  assert.equal(opgeslagen.auteur.naam, "Gijs");
  assert.equal(opgeslagen.auteur.uid, "u1");
  assert.equal(opgeslagen.auteurEmail, "gijs@voorbeeld.nl");
});

test("nieuwe feedback staat op nieuw en heeft nog geen besluit", async () => {
  const { response } = await indien(geldig);
  assert.equal(response.body.status, "nieuw");
  assert.equal(response.body.besluit, null);
  assert.equal(response.body.versie, "0.9");
});

// Status is not something a submitter gets to choose.
test("een meegestuurde status of besluit wordt genegeerd", async () => {
  const { opslag } = await indien({ ...geldig, status: "verwerkt", besluit: { toelichting: "van mezelf" } });
  const opgeslagen = Object.entries(opslag).find(([k]) => k.startsWith("feedback/"))[1];
  assert.equal(opgeslagen.status, "nieuw");
  assert.equal(opgeslagen.besluit, null);
});

// --- Beoordelen ---

const beheerder = { uid: "a1", email: "info@deccos.nl", admin: true, email_verified: true };

const beslis = async (body, gebruiker, opslag) => {
  const firestore = fakeFirestore(opslag);
  const response = fakeResponse();
  await handleBesluit(
    firestore,
    { path: "/api/v1/feedback/f1/besluit", body, headers: {} },
    response,
    gebruiker
  );
  return { response, opslag: firestore._opslag };
};

const bestaandeFeedback = () => ({
  "feedback/f1": {
    ...geldig,
    doel: { type: "effect", id: "EFF-01" },
    auteur: { uid: "u1", naam: "Gijs", bedrijf: "Deccos" },
    auteurEmail: "gijs@voorbeeld.nl",
    status: "nieuw",
    besluit: null,
    aangemaaktOp: "2026-08-24T10:00:00.000Z",
  },
});

test("een gewone gebruiker kan geen status zetten", async () => {
  const opslag = bestaandeFeedback();
  const { response } = await beslis({ status: "verwerkt", toelichting: "ok" }, indiener, opslag);
  assert.equal(response.statusCode, 403);
  assert.equal(opslag["feedback/f1"].status, "nieuw");
});

test("een beheerder zet status en toelichting samen", async () => {
  const opslag = bestaandeFeedback();
  const { response } = await beslis(
    { status: "verwerkt", toelichting: "Meegenomen in 1.0." },
    beheerder,
    opslag
  );
  assert.equal(response.statusCode, 200);
  assert.equal(opslag["feedback/f1"].status, "verwerkt");
  assert.equal(opslag["feedback/f1"].besluit.toelichting, "Meegenomen in 1.0.");
  assert.equal(opslag["feedback/f1"].besluit.door, "info@deccos.nl");
});

// A status change with no reason is what makes a feedback process feel like a
// void to the person who wrote in.
test("een status anders dan nieuw vereist een toelichting", async () => {
  for (const status of STATUSSEN.filter((s) => s !== "nieuw")) {
    const opslag = bestaandeFeedback();
    const { response } = await beslis({ status, toelichting: "  " }, beheerder, opslag);
    assert.equal(response.statusCode, 400, status);
    assert.ok(response.body.fouten.toelichting);
    assert.equal(opslag["feedback/f1"].status, "nieuw");
  }
});

test("terugzetten naar nieuw mag zonder toelichting en wist het besluit", async () => {
  const opslag = bestaandeFeedback();
  opslag["feedback/f1"].status = "verwerkt";
  opslag["feedback/f1"].besluit = { toelichting: "eerder", door: "x", op: "y" };

  const { response } = await beslis({ status: "nieuw" }, beheerder, opslag);
  assert.equal(response.statusCode, 200);
  assert.equal(opslag["feedback/f1"].besluit, null);
});

test("een onbekende status wordt geweigerd", async () => {
  const opslag = bestaandeFeedback();
  const { response } = await beslis({ status: "misschien", toelichting: "x" }, beheerder, opslag);
  assert.equal(response.statusCode, 400);
});

test("beoordelen van niet-bestaande feedback is een 404", async () => {
  const { response } = await beslis({ status: "verwerkt", toelichting: "x" }, beheerder, {});
  assert.equal(response.statusCode, 404);
});

// --- Publieke lijst ---

const lijst = async (standaard, opslag) => {
  const firestore = fakeFirestore(opslag);
  const response = fakeResponse();
  await handleLijst(firestore, { path: `/api/v1/feedback/${standaard}`, headers: {} }, response);
  return response;
};

test("de publieke lijst geeft alleen de gevraagde standaard, nieuwste eerst", async () => {
  const opslag = {
    "feedback/a": { ...bestaandeFeedback()["feedback/f1"], aangemaaktOp: "2026-08-01T00:00:00.000Z" },
    "feedback/b": { ...bestaandeFeedback()["feedback/f1"], aangemaaktOp: "2026-08-20T00:00:00.000Z" },
    "feedback/c": { ...bestaandeFeedback()["feedback/f1"], standaard: "gelijke-kansen" },
  };
  const response = await lijst("energiearmoede", opslag);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.aantal, 2);
  assert.deepEqual(response.body.feedback.map((f) => f.id), ["b", "a"]);
  assert.equal(JSON.stringify(response.body).includes("gijs@voorbeeld.nl"), false);
});

test("een onbekende standaard geeft 404 met de standaarden die wel bestaan", async () => {
  const response = await lijst("warmtetransitie", {});
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body.standaarden, FEEDBACK_STANDAARDEN);
});
