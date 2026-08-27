import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOELTYPEN,
  FEEDBACK_STANDAARDEN,
  MAX_TEKST,
  PUBLIEKE_STATUSSEN,
  STATUSSEN,
  handleBeheerLijst,
  handleBesluit,
  handleIndienen,
  handleLijst,
  projecteer,
  projecteerVoorBeheer,
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
  naam: "Gijs",
  bedrijf: "Deccos",
  email: "gijs@voorbeeld.nl",
};

test("een geldige inzending komt er doorheen", () => {
  const resultaat = valideerFeedback(geldig);
  assert.equal(resultaat.ok, true);
  assert.equal(resultaat.waarde.doel.id, "EFF-01");
  assert.equal(resultaat.waarde.auteur.naam, "Gijs");
  assert.equal(resultaat.waarde.auteurEmail, "gijs@voorbeeld.nl");
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

// Sinds het formulier open staat komt de naam uit de inzending zelf. Daarmee
// wordt hij ook een veld dat leeg kan zijn, en dat mag niet: een reactie zonder
// afzender is niet te wegen door wie hem leest.
test("naam is verplicht", () => {
  for (const naam of [undefined, "", "   ", 42, "x".repeat(121)]) {
    const resultaat = valideerFeedback({ ...geldig, naam });
    assert.equal(resultaat.ok, false, `${naam} had geweigerd moeten worden`);
    assert.ok(resultaat.fouten.naam);
  }
});

test("een e-mailadres is verplicht en moet er als een adres uitzien", () => {
  for (const email of [undefined, "", "geenadres", "twee@apen@x.nl", "a@b"]) {
    const resultaat = valideerFeedback({ ...geldig, email });
    assert.equal(resultaat.ok, false, `${email} had geweigerd moeten worden`);
    assert.ok(resultaat.fouten.email);
  }
  assert.equal(valideerFeedback({ ...geldig, email: "a.b+c@voorbeeld.co.uk" }).ok, true);
});

// Niet iedereen reageert namens een organisatie.
test("organisatie mag leeg blijven en wordt dan null", () => {
  for (const bedrijf of [undefined, "", "   "]) {
    const resultaat = valideerFeedback({ ...geldig, bedrijf });
    assert.equal(resultaat.ok, true, `${bedrijf} had door moeten mogen`);
    assert.equal(resultaat.waarde.auteur.bedrijf, null);
  }
  assert.equal(valideerFeedback({ ...geldig, bedrijf: "x".repeat(161) }).ok, false);
});

test("naam, organisatie en e-mailadres worden getrimd", () => {
  const resultaat = valideerFeedback({
    ...geldig,
    naam: "  Gijs  ",
    bedrijf: "  Deccos  ",
    email: "  gijs@voorbeeld.nl  ",
  });
  assert.equal(resultaat.waarde.auteur.naam, "Gijs");
  assert.equal(resultaat.waarde.auteur.bedrijf, "Deccos");
  assert.equal(resultaat.waarde.auteurEmail, "gijs@voorbeeld.nl");
});

// --- Projectie ---

// The single reason the public list is served by a function instead of by
// Firestore rules: rules cannot hide a field.
test("het e-mailadres van de indiener wordt nooit geprojecteerd", () => {
  const publiek = projecteer("f1", {
    ...geldig,
    auteur: { naam: "Gijs", bedrijf: "Deccos" },
    auteurEmail: "geheim@voorbeeld.nl",
    status: "nieuw",
    aangemaaktOp: "2026-08-24T10:00:00.000Z",
  });

  assert.equal(JSON.stringify(publiek).includes("geheim@voorbeeld.nl"), false);
  assert.equal(publiek.auteur.naam, "Gijs");
  assert.equal(publiek.auteur.bedrijf, "Deccos");
});

// En dat is precies waarom de beheerprojectie apart bestaat: die mag het wel.
test("de beheerprojectie voegt het e-mailadres toe en niets anders", () => {
  const doc = {
    ...geldig,
    auteur: { naam: "Gijs", bedrijf: "Deccos" },
    auteurEmail: "gijs@voorbeeld.nl",
    status: "nieuw",
    aangemaaktOp: "2026-08-24T10:00:00.000Z",
  };

  const beheer = projecteerVoorBeheer("f1", doc);
  assert.equal(beheer.auteurEmail, "gijs@voorbeeld.nl");
  assert.deepEqual(
    Object.keys(beheer).filter((k) => k !== "auteurEmail"),
    Object.keys(projecteer("f1", doc))
  );
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

const indien = async (body, opslag = {}) => {
  const firestore = fakeFirestore(opslag);
  const response = fakeResponse();
  await handleIndienen(firestore, { path: "/api/v1/feedback", body, headers: {} }, response);
  return { response, opslag: firestore._opslag };
};

const opgeslagenFeedback = (opslag) =>
  Object.entries(opslag).find(([k]) => k.startsWith("feedback/"))[1];

// Het hele punt van de wijziging: geen account, geen token, geen bevestigd
// adres — wel een reactie.
test("iedereen kan feedback plaatsen, zonder account", async () => {
  const { response, opslag } = await indien(geldig);
  assert.equal(response.statusCode, 201);

  const opgeslagen = opgeslagenFeedback(opslag);
  assert.equal(opgeslagen.auteur.naam, "Gijs");
  assert.equal(opgeslagen.auteur.bedrijf, "Deccos");
  assert.equal(opgeslagen.auteurEmail, "gijs@voorbeeld.nl");
});

test("een ongeldige inzending schrijft niets weg", async () => {
  const { response, opslag } = await indien({ ...geldig, email: "geenadres" });
  assert.equal(response.statusCode, 400);
  assert.ok(response.body.fouten.email);
  assert.equal(Object.keys(opslag).length, 0);
});

test("nieuwe feedback staat op nieuw en heeft nog geen besluit", async () => {
  const { response } = await indien(geldig);
  assert.equal(response.body.status, "nieuw");
  assert.equal(response.body.besluit, null);
  assert.equal(response.body.versie, "0.9");
});

// Status is not something a submitter gets to choose — en nu de indiener niemand
// meer hoeft te zijn, is dat het verschil tussen modereren en toekijken.
test("een meegestuurde status of besluit wordt genegeerd", async () => {
  const { opslag } = await indien({ ...geldig, status: "verwerkt", besluit: { toelichting: "van mezelf" } });
  const opgeslagen = opgeslagenFeedback(opslag);
  assert.equal(opgeslagen.status, "nieuw");
  assert.equal(opgeslagen.besluit, null);
});

// De body wordt veld voor veld gelezen, niet gespreid. Anders schrijft een
// bezoeker zelf een veld bij in een document dat niemand meer bewaakt.
test("een onbekend veld komt het document niet in", async () => {
  const { opslag } = await indien({ ...geldig, auteur: { naam: "Iemand Anders" }, admin: true });
  const opgeslagen = opgeslagenFeedback(opslag);
  assert.equal(opgeslagen.auteur.naam, "Gijs");
  assert.equal(opgeslagen.admin, undefined);
});

// --- Beoordelen ---

const beheerder = { uid: "a1", email: "info@deccos.nl", admin: true, email_verified: true };
const bezoeker = { uid: "u1", email: "gijs@voorbeeld.nl", email_verified: true };

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
    auteur: { naam: "Gijs", bedrijf: "Deccos" },
    auteurEmail: "gijs@voorbeeld.nl",
    status: "nieuw",
    besluit: null,
    aangemaaktOp: "2026-08-24T10:00:00.000Z",
  },
});

test("een gewone gebruiker kan geen status zetten", async () => {
  const opslag = bestaandeFeedback();
  const { response } = await beslis({ status: "verwerkt", toelichting: "ok" }, bezoeker, opslag);
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
test("een publieke status vereist een toelichting", async () => {
  for (const status of PUBLIEKE_STATUSSEN) {
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

// Spam en verwijderd zijn de antwoorden die geen antwoord horen te zijn: niet
// publiek, en dus ook geen toelichting die niemand ooit leest.
test("spam en verwijderd mogen zonder toelichting en krijgen geen besluit", async () => {
  for (const status of ["spam", "verwijderd"]) {
    const opslag = bestaandeFeedback();
    const { response } = await beslis({ status }, beheerder, opslag);
    assert.equal(response.statusCode, 200, status);
    assert.equal(opslag["feedback/f1"].status, status);
    assert.equal(opslag["feedback/f1"].besluit, null);
  }
});

// Een softdelete is pas een softdelete als hij terug kan.
test("verwijderd kan worden teruggezet", async () => {
  const opslag = bestaandeFeedback();
  opslag["feedback/f1"].status = "verwijderd";

  const { response } = await beslis({ status: "nieuw" }, beheerder, opslag);
  assert.equal(response.statusCode, 200);
  assert.equal(opslag["feedback/f1"].status, "nieuw");
});

test("een onbekende status wordt geweigerd", async () => {
  const opslag = bestaandeFeedback();
  const { response } = await beslis({ status: "misschien", toelichting: "x" }, beheerder, opslag);
  assert.equal(response.statusCode, 400);
  assert.ok(STATUSSEN.includes(opslag["feedback/f1"].status));
});

test("beoordelen van niet-bestaande feedback is een 404", async () => {
  const { response } = await beslis({ status: "verwerkt", toelichting: "x" }, beheerder, {});
  assert.equal(response.statusCode, 404);
});

// --- Lijsten ---

const gemengd = () => ({
  "feedback/f1": { ...geldig, status: "nieuw", auteur: { naam: "A" }, auteurEmail: "a@x.nl", aangemaaktOp: "2026-08-01T10:00:00.000Z" },
  "feedback/f2": { ...geldig, status: "verwerkt", auteur: { naam: "B" }, auteurEmail: "b@x.nl", aangemaaktOp: "2026-08-02T10:00:00.000Z" },
  "feedback/f3": { ...geldig, status: "spam", auteur: { naam: "C" }, auteurEmail: "c@x.nl", aangemaaktOp: "2026-08-03T10:00:00.000Z" },
  "feedback/f5": { ...geldig, status: "verwijderd", auteur: { naam: "E" }, auteurEmail: "e@x.nl", aangemaaktOp: "2026-08-05T10:00:00.000Z" },
  "feedback/f4": { ...geldig, standaard: "gelijke-kansen", status: "verwerkt", auteur: { naam: "D" }, aangemaaktOp: "2026-08-04T10:00:00.000Z" },
});

const lijst = async (handler, gebruiker) => {
  const firestore = fakeFirestore(gemengd());
  const response = fakeResponse();
  await handler(firestore, { path: "/api/v1/feedback/energiearmoede", headers: {} }, response, gebruiker);
  return response;
};

// De kern van een open formulier: wat er binnenkomt is nog niet gepubliceerd.
test("de publieke lijst toont alleen beoordeelde feedback", async () => {
  const response = await lijst(handleLijst);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.feedback.map((f) => f.id), ["f2"]);
  assert.equal(response.body.aantal, 1);
});

test("de beheerlijst toont alles, inclusief het e-mailadres", async () => {
  const response = await lijst(handleBeheerLijst, beheerder);
  assert.equal(response.statusCode, 200);
  // Nieuwste eerst.
  assert.deepEqual(response.body.feedback.map((f) => f.id), ["f5", "f3", "f2", "f1"]);
  assert.equal(response.body.feedback.find((f) => f.id === "f1").auteurEmail, "a@x.nl");
});

test("de beheerlijst is niet voor gewone gebruikers", async () => {
  const response = await lijst(handleBeheerLijst, bezoeker);
  assert.equal(response.statusCode, 403);
});

test("een onbekende standaard is een 404 op beide lijsten", async () => {
  for (const handler of [handleLijst, handleBeheerLijst]) {
    const response = fakeResponse();
    await handler(
      fakeFirestore({}),
      { path: "/api/v1/feedback/warmtetransitie", headers: {} },
      response,
      beheerder
    );
    assert.equal(response.statusCode, 404);
  }
});
