import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, handleVersionedResource } from "./versionedResource.js";

const sorted = (versions) => [...versions].sort(compareVersions);

test("compareVersions orders numerically, not lexically", () => {
  assert.deepEqual(sorted(["1.0", "0.9", "1.10", "1.2"]), ["0.9", "1.0", "1.2", "1.10"]);
  assert.deepEqual(sorted(["2026.10", "2026.2", "2026.1"]), ["2026.1", "2026.2", "2026.10"]);
});

// "1" and "1.0" denote the same version; ordering them must still be stable so
// the published version index does not shuffle between calls.
test("compareVersions breaks equal-value ties deterministically", () => {
  assert.ok(compareVersions("1", "1.0") < 0);
  assert.ok(compareVersions("1.0", "1") > 0);
  assert.deepEqual(sorted(["1.0", "1"]), sorted(["1", "1.0"]));
});

// --- HTTP handler routing (fake Firestore + req/res) ---

const COLLECTION = "TestCollection";

// Models Firestore's select() projection: listing versions must never pull the
// full documents, so an ids-only query exposes no fields.
export const fakeFirestore = (docsById, expectedCollection = COLLECTION) => ({
  collection: (name) => {
    assert.equal(name, expectedCollection);
    const snapshot = (idsOnly) => ({
      docs: Object.entries(docsById).map(([id, data]) => ({
        id,
        data: () => (idsOnly ? {} : data),
      })),
    });
    return {
      select: (...fields) => {
        assert.equal(fields.length, 0, "version listing should not need any fields");
        return { get: async () => snapshot(true) };
      },
      get: async () => snapshot(false),
      doc: (id) => ({
        get: async () => ({ exists: id in docsById, data: () => docsById[id] }),
      }),
    };
  },
});

export const fakeResponse = () => ({
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
});

const docs = {
  "0.9": { meta: { version: "0.9" } },
  "1.0": { meta: { version: "1.0" } },
  "1.10": { meta: { version: "1.10" } },
};

const get = async (path, headers = {}, docsById = docs) => {
  const response = fakeResponse();
  await handleVersionedResource({
    firestore: fakeFirestore(docsById),
    collection: COLLECTION,
    resourceSegment: "standaard",
    request: { path, headers },
    response,
  });
  return response;
};

test("GET .../versions lists the versions and which one is latest", async () => {
  const res = await get("/api/v1/test/standaard/versions");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { versions: ["0.9", "1.0", "1.10"], latest: "1.10" });
});

test("GET .../{resource} serves the latest version and names it in a header", async () => {
  const res = await get("/api/v1/test/standaard");
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).meta.version, "1.10");
  assert.equal(res.headers["X-Meetstandaard-Version"], "1.10");
  assert.equal(res.headers["Cache-Control"], "public, max-age=86400");
});

// The point of the whole thing: pinning an old version keeps working, and the
// response says which version it is.
test("an older version stays served, and identifies itself", async () => {
  const res = await get("/api/v1/test/standaard/0.9");
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).meta.version, "0.9");
  assert.equal(res.headers["X-Meetstandaard-Version"], "0.9");
});

// A version segment is user input on its way to Firestore's doc(). "%2F.."
// decodes to a path Firestore rejects by throwing, which the caller would
// surface as a 500; reject the shape up front and answer honestly instead.
test("a malformed version segment 404s without reaching Firestore", async () => {
  const hostile = {
    collection: () => ({
      select: () => ({ get: async () => ({ docs: [{ id: "1.0", data: () => ({}) }] }) }),
      doc: () => {
        throw new Error("doc() must not be reached with an invalid version");
      },
    }),
  };

  for (const segment of ["%2F..%2Fetc", "..", "__proto__", "1.0%20OR%201", "latest"]) {
    const response = fakeResponse();
    await handleVersionedResource({
      firestore: hostile,
      collection: COLLECTION,
      resourceSegment: "standaard",
      request: { path: `/api/v1/test/standaard/${segment}`, headers: {} },
      response,
    });
    assert.equal(response.statusCode, 404, `expected 404 for ${segment}`);
    assert.match(response.body.error, /^Unknown version: /);
  }
});

test("unknown version 404s with the versions that do exist", async () => {
  const res = await get("/api/v1/test/standaard/9.9");
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, "Unknown version: 9.9");
  assert.deepEqual(res.body.versions, ["0.9", "1.0", "1.10"]);
});

test("an empty collection 404s rather than throwing", async () => {
  const res = await get("/api/v1/test/standaard", {}, {});
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, "No versions available");
});

test("unrelated paths 404", async () => {
  const res = await get("/api/v1/test/standaard/1.0/extra");
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, "Not found");
});

test("If-None-Match returns 304", async () => {
  const first = await get("/api/v1/test/standaard/1.0");
  const second = await get("/api/v1/test/standaard/1.0", { "if-none-match": first.headers.ETag });
  assert.equal(second.statusCode, 304);
  assert.equal(second.body, undefined);
});

// Versions differ in content, so they must not share a cache entry.
test("different versions get different ETags", async () => {
  const a = await get("/api/v1/test/standaard/1.0");
  const b = await get("/api/v1/test/standaard/0.9");
  assert.notEqual(a.headers.ETag, b.headers.ETag);
});
