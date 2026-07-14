import crypto from "crypto";

// Shared plumbing for public, read-only, versioned reference-data endpoints
// (arbeidsparticipatie parameters, monetarisering onderbouwing). Documents live
// in a Firestore collection keyed by version string; the endpoint serves the
// latest or a pinned version with cache headers.

// Numeric-aware compare so "2026.10" sorts after "2026.2".
export const compareVersions = (a, b) => {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
};

const listVersions = async (firestore, collection) => {
  const snap = await firestore.collection(collection).get();
  return snap.docs.map((d) => d.id).sort(compareVersions);
};

// Send JSON with caching headers + ETag / If-None-Match handling.
export const sendCached = (request, response, payload) => {
  const body = JSON.stringify(payload);
  const etag = `"${crypto.createHash("sha1").update(body).digest("hex")}"`;

  response.set("Cache-Control", "public, max-age=86400");
  response.set("ETag", etag);

  if (request.headers["if-none-match"] === etag) {
    return response.status(304).end();
  }

  response.set("Content-Type", "application/json; charset=utf-8");
  return response.status(200).send(body);
};

export const sendError = (response, status, message) =>
  response.status(status).json({ error: message });

const sendLatest = async (firestore, collection, request, response) => {
  const versions = await listVersions(firestore, collection);
  if (versions.length === 0) {
    return sendError(response, 404, "No versions available");
  }
  const doc = await firestore.collection(collection).doc(versions[versions.length - 1]).get();
  return sendCached(request, response, doc.data());
};

const sendVersion = async (firestore, collection, request, response, version) => {
  const doc = await firestore.collection(collection).doc(version).get();
  if (!doc.exists) {
    return sendError(response, 404, `Unknown version: ${version}`);
  }
  return sendCached(request, response, doc.data());
};

// Routing matches the trailing path segments, so it works regardless of how the
// request arrives (bare function URL, emulator, or hosting rewrite):
//   GET .../versions                    -> { versions: [...] }
//   GET .../{resourceSegment}           -> latest version body
//   GET .../{resourceSegment}/{version} -> pinned version body (404 if unknown)
export const handleVersionedResource = async ({
  firestore,
  collection,
  resourceSegment,
  request,
  response,
}) => {
  const segments = (request.path || "/").split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const prev = segments[segments.length - 2];

  if (last === "versions") {
    const versions = await listVersions(firestore, collection);
    return sendCached(request, response, { versions });
  }

  if (last === resourceSegment) {
    return sendLatest(firestore, collection, request, response);
  }

  if (prev === resourceSegment) {
    return sendVersion(firestore, collection, request, response, decodeURIComponent(last));
  }

  return sendError(response, 404, "Not found");
};
