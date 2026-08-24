import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LENGTE, valideerProfiel, handleGebruikers } from "./gebruikers.js";
import { fakeResponse } from "./versionedResource.test.js";

// --- Validatie ---

test("naam en bedrijf zijn verplicht", () => {
  for (const body of [undefined, {}, { naam: "Gijs" }, { bedrijf: "Deccos" }]) {
    assert.equal(valideerProfiel(body).ok, false);
  }
});

test("witruimte is geen naam", () => {
  const resultaat = valideerProfiel({ naam: "   ", bedrijf: "Deccos" });
  assert.equal(resultaat.ok, false);
  assert.match(resultaat.fouten.naam, /verplicht/);
});

test("waarden worden getrimd", () => {
  const resultaat = valideerProfiel({ naam: "  Gijs  ", bedrijf: " Deccos " });
  assert.deepEqual(resultaat.waarde, { naam: "Gijs", bedrijf: "Deccos" });
});

test("te lange waarden worden geweigerd", () => {
  const resultaat = valideerProfiel({ naam: "x".repeat(MAX_LENGTE.naam + 1), bedrijf: "Deccos" });
  assert.equal(resultaat.ok, false);
  assert.match(resultaat.fouten.naam, /maximaal/);
});

test("een niet-string wordt geweigerd in plaats van gecast", () => {
  for (const naam of [42, null, {}, ["Gijs"], true]) {
    assert.equal(valideerProfiel({ naam, bedrijf: "Deccos" }).ok, false);
  }
});

// --- Schrijfpad ---

const fakeFirestore = (opslag = {}) => ({
  collection: (naam) => ({
    doc: (id) => ({
      get: async () => ({ exists: `${naam}/${id}` in opslag, data: () => opslag[`${naam}/${id}`] }),
      set: async (waarde, opties) => {
        opslag[`${naam}/${id}`] = opties?.merge
          ? { ...(opslag[`${naam}/${id}`] || {}), ...waarde }
          : waarde;
      },
    }),
  }),
  _opslag: opslag,
});

const gebruiker = { uid: "u1", email: "iemand@voorbeeld.nl", email_verified: false };
const post = async (body, opslag = {}, pad = "/api/v1/gebruikers/profiel") => {
  const firestore = fakeFirestore(opslag);
  const response = fakeResponse();
  await handleGebruikers(firestore, { path: pad, body, headers: {} }, response, gebruiker);
  return { response, opslag: firestore._opslag };
};

test("een geldig profiel wordt onder de uid uit het token geschreven", async () => {
  const { response, opslag } = await post({ naam: "Gijs", bedrijf: "Deccos" });
  assert.equal(response.statusCode, 200);
  assert.equal(opslag["users/u1"].naam, "Gijs");
  assert.equal(opslag["users/u1"].email, "iemand@voorbeeld.nl");
  assert.ok(opslag["users/u1"].aangemaaktOp);
});

// The whole reason this endpoint exists instead of a client write: a caller
// must not be able to grant themselves anything.
test("velden buiten naam en bedrijf worden niet overgenomen", async () => {
  const { opslag } = await post({
    naam: "Gijs",
    bedrijf: "Deccos",
    admin: true,
    rol: "beheerder",
    uid: "iemand-anders",
    email: "vervalst@voorbeeld.nl",
  });

  const profiel = opslag["users/u1"];
  assert.equal(profiel.admin, undefined);
  assert.equal(profiel.rol, undefined);
  assert.equal(profiel.email, "iemand@voorbeeld.nl", "het e-mailadres komt uit het token");
  assert.equal(opslag["users/iemand-anders"], undefined, "alleen het eigen profiel is geschreven");
});

test("aangemaaktOp wordt niet opnieuw gezet bij een wijziging", async () => {
  const opslag = {};
  await post({ naam: "Gijs", bedrijf: "Deccos" }, opslag);
  const eerste = opslag["users/u1"].aangemaaktOp;

  await post({ naam: "Gijs van B", bedrijf: "Deccos" }, opslag);
  assert.equal(opslag["users/u1"].aangemaaktOp, eerste);
  assert.equal(opslag["users/u1"].naam, "Gijs van B");
});

test("een ongeldig profiel schrijft niets en zegt welk veld", async () => {
  const { response, opslag } = await post({ naam: "", bedrijf: "Deccos" });
  assert.equal(response.statusCode, 400);
  assert.ok(response.body.fouten.naam);
  assert.deepEqual(opslag, {});
});

test("een onbekend pad is een 404", async () => {
  const { response } = await post({ naam: "Gijs", bedrijf: "Deccos" }, {}, "/api/v1/gebruikers");
  assert.equal(response.statusCode, 404);
});
