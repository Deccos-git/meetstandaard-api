import crypto from "crypto";

// Shared plumbing for the public, read-only, versioned reference-data endpoints
// (meetstandaard per sector, monetarisering onderbouwing, arbeidsparticipatie
// parameters). Documents live in a Firestore collection keyed by version string.
//
// The contract is deliberately small:
// - A published version is immutable and keeps being served. Corrections ship as
//   a new version; nothing is ever removed, so an old version never stops working.
// - Consumers pin a version and upgrade by hand. Nothing migrates on its own,
//   so there is no deprecation machinery here.
// - Every response states its own version, in `meta.version` and in the
//   X-Meetstandaard-Version header, so it is always visible which one you are on.

// Version ids are dot-separated numbers ("0.9", "1.0", "2026.1"). Validating
// against this before touching Firestore keeps a hand-typed or hostile segment
// from reaching doc(): "%2F.." decodes to a path Firestore rejects by throwing,
// which would surface as a 500 instead of an honest 404. It also matches what
// compareVersions can actually order.
const VERSION_FORMAT = /^\d+(\.\d+)*$/;

// Numeric-aware compare so "2026.10" sorts after "2026.2", and "0.9" before "1.0".
export const compareVersions = (a, b) => {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  // "1" and "1.0" are the same version; break the tie so the published list
  // cannot reorder between calls.
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};

// Only the document ids are needed, and a meetstandaard document is ~200 KB, so
// project the query down to nothing rather than reading every version in full.
// (An argument-less select() is Firestore's ids-only query.)
const listVersions = async (firestore, collection) => {
  const ref = firestore.collection(collection);
  const snapshot = await (ref.select ? ref.select() : ref).get();
  return snapshot.docs.map((doc) => doc.id).sort(compareVersions);
};

// A pinned version is immutable (ADR-001), so it can be cached for a year.
// Everything else is an index that changes the moment a version is published:
// the sector list, the version list, and the unpinned "latest" body. Caching
// those for a day would mean a new version stays invisible for a day — which is
// most of what publishing without a deploy is for.
//
// The unpinned body is the trap here. It resolves to a concrete version and so
// carries one, but the *answer to the question asked* changes on publication.
// Cache duration follows the question, not the payload.
const MAX_AGE_IMMUTABLE = 31536000;
const MAX_AGE_INDEX = 300;

// Send JSON with caching headers + ETag / If-None-Match handling. `version` is
// echoed in a header so a client that did not pin can still see, and log, which
// version it actually received. `immutable` says the caller asked for one
// specific version and can therefore never get a different answer.
export const sendCached = (request, response, payload, version, immutable = false) => {
  const body = JSON.stringify(payload);
  const etag = `"${crypto.createHash("sha1").update(body).digest("hex")}"`;

  response.set("Cache-Control", `public, max-age=${immutable ? MAX_AGE_IMMUTABLE : MAX_AGE_INDEX}`);
  response.set("ETag", etag);
  if (version) response.set("X-Meetstandaard-Version", version);

  if (request.headers["if-none-match"] === etag) {
    return response.status(304).end();
  }

  response.set("Content-Type", "application/json; charset=utf-8");
  return response.status(200).send(body);
};

export const sendError = (response, status, body) =>
  response.status(status).json(typeof body === "string" ? { error: body } : body);

const sendVersion = async (firestore, collection, request, response, version, versions, immutable) => {
  if (!VERSION_FORMAT.test(version)) {
    return sendError(response, 404, { error: `Unknown version: ${version}`, versions });
  }

  const doc = await firestore.collection(collection).doc(version).get();
  if (!doc.exists) {
    // List what does exist, so picking the right version takes one request.
    return sendError(response, 404, { error: `Unknown version: ${version}`, versions });
  }
  return sendCached(request, response, doc.data(), version, immutable);
};

// Routing matches the trailing path segments, so it works regardless of how the
// request arrives (bare function URL, emulator, or hosting rewrite):
//   GET .../versions                    -> { versions: [...], latest }
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

  const isIndex = last === "versions";
  const isResource = last === resourceSegment;
  const isPinned = prev === resourceSegment;

  if (!isIndex && !isResource && !isPinned) {
    return sendError(response, 404, "Not found");
  }

  const versions = await listVersions(firestore, collection);
  const latest = versions[versions.length - 1] ?? null;

  if (isIndex) {
    return sendCached(request, response, { versions, latest });
  }

  if (!latest) {
    return sendError(response, 404, "No versions available");
  }

  const version = isResource ? latest : decodeURIComponent(last);
  return sendVersion(firestore, collection, request, response, version, versions, isPinned);
};
