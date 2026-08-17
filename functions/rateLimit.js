// Abuse protection for the public, unauthenticated endpoints.
//
// The meetstandaard document is ~195 KB and needs no credentials, so a loop
// against it is an egress-cost amplifier. Two independent brakes:
//
// 1. This per-IP limiter, which stops a naive loop.
// 2. `maxInstances` on the functions themselves (see index.js), which is the
//    real cost ceiling — it bounds how much the project can ever serve at once,
//    whatever the source or shape of the traffic.
//
// Deliberately in-memory and dependency-free. Cloud Functions runs many
// instances, and each keeps its own counters, so the effective limit is per
// instance rather than global — a distributed flood is not stopped here, which
// is what brake 2 is for. Doing this accurately would mean a Firestore
// read+write per request, i.e. paying more per request to save money on
// requests. Clients that behave (the documented `Cache-Control: max-age=86400`
// and `ETag` revalidation) never come close to the limit.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

// Bounds memory on an instance that sees many distinct IPs. Expired entries are
// swept before anything is evicted, so a normal instance never reaches this.
const MAX_TRACKED_CLIENTS = 10_000;

const hits = new Map();

// Cloud Functions sits behind a proxy, so the peer address is the load
// balancer's. X-Forwarded-For's first entry is the original client; it is
// client-controllable, but a forged value only lets an attacker get their own
// bucket, and the maxInstances ceiling still applies.
const clientKey = (request) => {
  const forwarded = request.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.ip || "unknown";
};

const sweep = (now) => {
  for (const [key, entry] of hits) {
    if (now >= entry.resetAt) hits.delete(key);
  }
  // Still full of live entries: drop the oldest insertions (Map preserves order)
  // rather than let the map grow without bound.
  if (hits.size >= MAX_TRACKED_CLIENTS) {
    const excess = hits.size - MAX_TRACKED_CLIENTS + 1;
    for (const key of [...hits.keys()].slice(0, excess)) hits.delete(key);
  }
};

// Exported for tests; also lets a fresh instance start clean.
export const resetRateLimit = () => hits.clear();

export const checkRateLimit = (request, now = Date.now()) => {
  const key = clientKey(request);
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    if (hits.size >= MAX_TRACKED_CLIENTS) sweep(now);
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, retryAfter: 0 };
  }

  entry.count += 1;
  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

  return {
    allowed: entry.count <= MAX_REQUESTS_PER_WINDOW,
    remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - entry.count),
    retryAfter,
  };
};

// Applies the limit and, when exceeded, writes the 429 itself. Returns whether
// the caller should continue handling the request.
export const enforceRateLimit = (request, response, now = Date.now()) => {
  const { allowed, remaining, retryAfter } = checkRateLimit(request, now);

  response.set("X-RateLimit-Limit", String(MAX_REQUESTS_PER_WINDOW));
  response.set("X-RateLimit-Remaining", String(remaining));

  if (!allowed) {
    response.set("Retry-After", String(retryAfter));
    // Never cache a throttle response as if it were the resource.
    response.set("Cache-Control", "no-store");
    response.status(429).json({
      error: "Too many requests",
      detail: `Limit is ${MAX_REQUESTS_PER_WINDOW} requests per minute. Responses are cacheable for 24 hours (Cache-Control, ETag) — cache them instead of refetching.`,
      retryAfter,
    });
    return false;
  }

  return true;
};

export const RATE_LIMIT = { WINDOW_MS, MAX_REQUESTS_PER_WINDOW, MAX_TRACKED_CLIENTS };
