import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANGELOG, GEDEKTE_STANDAARDEN, handleChangelog } from "./changelog.js";
import { STANDAARDEN } from "./meetstandaard.js";
import { PARAMETERS_2026_1 } from "./arbeidsparticipatie.js";
import { fakeResponse } from "./versionedResource.test.js";

const SOORTEN = ["publicatie", "correctie-in-plaats"];
const alleEntries = Object.entries(CHANGELOG).flatMap(([s, e]) => e.map((x) => [s, x]));

// A changelog that silently omits a standaard reads as "nothing ever changed
// there", which is indistinguishable from the truth to anyone reading it.
test("elke gepubliceerde standaard heeft een changelog", () => {
  assert.deepEqual(Object.keys(CHANGELOG).sort(), [...GEDEKTE_STANDAARDEN].sort());
});

test("elke entry heeft de velden die hem naspeurbaar maken", () => {
  for (const [standaard, entry] of alleEntries) {
    const waar = `${standaard} ${entry.versie}`;
    assert.ok(SOORTEN.includes(entry.soort), `${waar}: onbekende soort ${entry.soort}`);
    assert.match(entry.datum, /^\d{4}-\d{2}-\d{2}$/, `${waar}: datum`);
    assert.ok(entry.samenvatting?.length > 10, `${waar}: samenvatting`);
    assert.ok(Array.isArray(entry.wijzigingen) && entry.wijzigingen.length > 0, `${waar}: wijzigingen`);
    assert.ok(Array.isArray(entry.besluiten), `${waar}: besluiten`);
    assert.ok(Array.isArray(entry.feedback), `${waar}: feedback`);
    // Without a commit an entry is a claim rather than a record.
    assert.match(entry.commit, /^[0-9a-f]{7,40}$/, `${waar}: commit`);
  }
});

// The integrity check that matters most: an entry about a version that was never
// published is worse than no entry, because it looks like provenance.
test("elke genoemde versie bestaat ook echt", () => {
  const bestaand = {
    ...Object.fromEntries(
      Object.entries(STANDAARDEN).map(([sector, { documenten }]) => [
        sector,
        documenten.map((d) => d.meta.version),
      ])
    ),
    participatieladder: [PARAMETERS_2026_1.meta.version],
  };

  for (const [standaard, entry] of alleEntries) {
    assert.ok(
      bestaand[standaard].includes(entry.versie),
      `${standaard}: changelog noemt versie ${entry.versie}, maar gepubliceerd is ${bestaand[standaard].join(", ")}`
    );
  }
});

test("entries staan nieuwste eerst", () => {
  for (const [standaard, entries] of Object.entries(CHANGELOG)) {
    const datums = entries.map((e) => e.datum);
    assert.deepEqual(datums, [...datums].sort().reverse(), `${standaard} staat niet op volgorde`);
  }
});

// Every ADR an entry points at has to exist, or the reasoning is a dead link.
test("verwezen besluiten hebben een geldig ADR-nummer", () => {
  for (const [standaard, entry] of alleEntries) {
    for (const besluit of entry.besluiten) {
      assert.match(besluit, /^ADR-\d{3}$/, `${standaard} ${entry.versie}: ${besluit}`);
    }
  }
});

// --- Routing ---

const get = async (path) => {
  const response = fakeResponse();
  await handleChangelog({ path, headers: {} }, response);
  return response;
};

test("de index noemt elke standaard met zijn aantal", async () => {
  const res = await get("/api/v1/changelog");
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.standaarden.length, GEDEKTE_STANDAARDEN.length);
  for (const s of body.standaarden) assert.ok(s.aantal > 0);
});

test("een standaard geeft zijn entries", async () => {
  const res = await get("/api/v1/changelog/milieu-circulariteit");
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.aantal, CHANGELOG["milieu-circulariteit"].length);
});

test("een onbekende standaard geeft 404 met de standaarden die wel bestaan", async () => {
  const res = await get("/api/v1/changelog/warmtetransitie");
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body.standaarden, Object.keys(CHANGELOG));
});

// The in-place corrections to 0.9 are recorded rather than smoothed over. If
// this ever fails because they were relabelled as publicaties, that is a
// rewrite of history, not a cleanup.
test("de correcties in plaats op 0.9 staan er nog als zodanig", () => {
  const inPlaats = alleEntries.filter(([, e]) => e.soort === "correctie-in-plaats");
  assert.ok(inPlaats.length >= 4, "verwacht de bekende in-plaats correcties op 0.9");
  for (const [, entry] of inPlaats) assert.equal(entry.versie, "0.9");
});
