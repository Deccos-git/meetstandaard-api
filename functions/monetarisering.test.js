import { test } from "node:test";
import assert from "node:assert/strict";
import { MONETARISERING_1_0, handleMonetarisering } from "./monetarisering.js";

const EFFECT_STATUSES = new Set(["volledig", "gedeeltelijk", "concept"]);

test("every effect has five niveaus with scores 1-5", () => {
  const ids = new Set();
  for (const effect of MONETARISERING_1_0.effecten) {
    assert.ok(!ids.has(effect.id), `duplicate effect id: ${effect.id}`);
    ids.add(effect.id);
    assert.ok(EFFECT_STATUSES.has(effect.status), `invalid status on ${effect.id}: ${effect.status}`);
    assert.deepEqual(
      effect.niveaus.map((n) => n.score),
      [1, 2, 3, 4, 5],
      `${effect.id} must have niveaus scored 1-5 in order`
    );
  }
});

// The waarderingen are the contract with the Meetstandaard sheet — pin the
// column "Monetaire waarde" per effect exactly.
test("waardePerJaar matches the Meetstandaard 1.0 sheet", () => {
  const byId = Object.fromEntries(
    MONETARISERING_1_0.effecten.map((e) => [e.id, e.niveaus.map((n) => n.waardePerJaar)])
  );
  assert.deepEqual(byId["mentale-gezondheid"], [-15000, -6000, -3350, 0, 2000]);
  assert.deepEqual(byId["fysieke-gezondheid"], [-17500, -8500, -3000, 0, 2000]);
  assert.deepEqual(byId["gezonde-leefstijl"], [-15000, -6000, -2500, 0, 2000]);
  assert.deepEqual(byId["participatieladder"], [-21150, -19500, -15000, -5000, 11050]);
  assert.deepEqual(byId["financiele-gezondheid"], [-15000, -5500, -800, 0, 1000]);
});

// Every bron reference must resolve to a defined entry in `bronnen`, otherwise a
// frontend would render dangling citations.
test("every bron reference resolves to a bronnen entry", () => {
  const { bronnen, effecten } = MONETARISERING_1_0;
  const known = new Set(Object.keys(bronnen));

  // bronnen entries are self-consistent (key === id) and typed.
  for (const [key, b] of Object.entries(bronnen)) {
    assert.equal(key, b.id, `bronnen key ${key} must match its id`);
    assert.ok(["universeel", "literatuur"].includes(b.type), `bron ${key} has invalid type`);
    if (b.url === null) {
      assert.ok(b.note, `bron ${key} has no url and must explain why in note`);
    }
  }

  const refs = [];
  for (const effect of effecten) {
    for (const p of effect.prijsbasis) refs.push(...p.bronnen);
    for (const niveau of effect.niveaus) {
      refs.push(...niveau.bronnen);
      for (const component of niveau.opbouw || []) refs.push(...component.bronnen);
    }
  }

  for (const id of refs) {
    assert.ok(known.has(id), `unknown bron id referenced: ${id}`);
  }
});

// The financial breakdown is the heart of the transparency claim: when a niveau
// has an opbouw, its components must sum exactly to the stated waardering.
test("opbouw sums to waardePerJaar", () => {
  for (const effect of MONETARISERING_1_0.effecten) {
    for (const niveau of effect.niveaus) {
      if (!niveau.opbouw) continue;
      assert.ok(niveau.opbouw.length > 0, `${effect.id} score ${niveau.score}: empty opbouw should be null`);
      const sum = niveau.opbouw.reduce((acc, c) => acc + c.bedrag, 0);
      assert.equal(
        sum,
        niveau.waardePerJaar,
        `${effect.id} score ${niveau.score}: opbouw must sum to waardePerJaar`
      );
    }
  }
});

test("effects with status volledig have an opbouw on every non-zero niveau", () => {
  for (const effect of MONETARISERING_1_0.effecten) {
    if (effect.status !== "volledig") continue;
    for (const niveau of effect.niveaus) {
      if (niveau.waardePerJaar === 0) continue;
      assert.ok(
        Array.isArray(niveau.opbouw) && niveau.opbouw.length > 0,
        `${effect.id} score ${niveau.score}: status volledig requires an opbouw`
      );
    }
  }
});

// --- HTTP handler routing (fake Firestore + req/res) ---

const fakeFirestore = (docsById) => ({
  collection: (name) => {
    assert.equal(name, "MeetstandaardMonetarisering");
    return {
      get: async () => ({
        docs: Object.entries(docsById).map(([id, data]) => ({ id, data: () => data })),
      }),
      doc: (id) => ({
        get: async () => ({
          exists: id in docsById,
          data: () => docsById[id],
        }),
      }),
    };
  },
});

const fakeResponse = () => {
  const res = {
    headers: {},
    statusCode: null,
    body: undefined,
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
};

const docs = { "1.0": { meta: { version: "1.0" } }, "1.1": { meta: { version: "1.1" } } };

test("GET .../versions lists versions in order", async () => {
  const res = fakeResponse();
  await handleMonetarisering(fakeFirestore(docs), { path: "/api/v1/monetarisering/versions", headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { versions: ["1.0", "1.1"], latest: "1.1" });
});

test("GET .../onderbouwing serves the latest version with cache headers", async () => {
  const res = fakeResponse();
  await handleMonetarisering(fakeFirestore(docs), { path: "/api/v1/monetarisering/onderbouwing", headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).meta.version, "1.1");
  assert.equal(res.headers["Cache-Control"], "public, max-age=86400");
  assert.ok(res.headers.ETag);
});

test("GET .../onderbouwing/{version} serves a pinned version and 404s on unknown", async () => {
  const res = fakeResponse();
  await handleMonetarisering(fakeFirestore(docs), { path: "/api/v1/monetarisering/onderbouwing/1.0", headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).meta.version, "1.0");

  const missing = fakeResponse();
  await handleMonetarisering(fakeFirestore(docs), { path: "/api/v1/monetarisering/onderbouwing/9.9", headers: {} }, missing);
  assert.equal(missing.statusCode, 404);
});

test("If-None-Match returns 304", async () => {
  const first = fakeResponse();
  await handleMonetarisering(fakeFirestore(docs), { path: "/monetarisering/onderbouwing", headers: {} }, first);
  const etag = first.headers.ETag;

  const second = fakeResponse();
  await handleMonetarisering(
    fakeFirestore(docs),
    { path: "/monetarisering/onderbouwing", headers: { "if-none-match": etag } },
    second
  );
  assert.equal(second.statusCode, 304);
  assert.equal(second.body, undefined);
});
