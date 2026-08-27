// Abuse protection for the public endpoints.
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

// Two budgets, because the two kinds of traffic fail differently. A read that
// is refused costs a consumer a retry; a submission that is refused costs a
// visitor the reaction they just typed. So the write budget is small in count
// but generous in what a real person needs: nobody writes six reactions in ten
// minutes, and a script that wants to fill the moderation queue has to wait
// two minutes per attempt.
//
// Each budget has its own counters. Reading a standaard must never eat into
// what a visitor has left to submit with.
const LIMIETEN = {
  lezen: {
    max: MAX_REQUESTS_PER_WINDOW,
    windowMs: WINDOW_MS,
    error: "Too many requests",
    detail: (max) =>
      `Limit is ${max} requests per minute. Responses are cacheable for 24 hours (Cache-Control, ETag) — cache them instead of refetching.`,
  },
  schrijven: {
    max: 5,
    windowMs: 600_000,
    error: "Te veel inzendingen",
    detail: (max, windowMs) =>
      `Je kunt maximaal ${max} reacties per ${windowMs / 60_000} minuten plaatsen.`,
  },
};

// Bounds memory on an instance that sees many distinct IPs. Expired entries are
// swept before anything is evicted, so a normal instance never reaches this.
const MAX_TRACKED_CLIENTS = 10_000;

const hits = new Map();

// Cloud Functions sits behind a proxy, so the peer address is the load
// balancer's. X-Forwarded-For's first entry is the original client; it is
// client-controllable, but a forged value only lets an attacker get their own
// bucket, and the maxInstances ceiling still applies.
const clientKey = (request, soort) => {
  const forwarded = request.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return `${soort}:${forwarded.split(",")[0].trim()}`;
  }
  return `${soort}:${request.ip || "unknown"}`;
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

export const checkRateLimit = (request, now = Date.now(), soort = "lezen") => {
  const limiet = LIMIETEN[soort];
  const key = clientKey(request, soort);
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    if (hits.size >= MAX_TRACKED_CLIENTS) sweep(now);
    hits.set(key, { count: 1, resetAt: now + limiet.windowMs });
    return { allowed: true, remaining: limiet.max - 1, retryAfter: 0 };
  }

  entry.count += 1;
  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

  return {
    allowed: entry.count <= limiet.max,
    remaining: Math.max(0, limiet.max - entry.count),
    retryAfter,
  };
};

// Applies the limit and, when exceeded, writes the 429 itself. Returns whether
// the caller should continue handling the request.
export const enforceRateLimit = (request, response, now = Date.now(), soort = "lezen") => {
  const limiet = LIMIETEN[soort];
  const { allowed, remaining, retryAfter } = checkRateLimit(request, now, soort);

  response.set("X-RateLimit-Limit", String(limiet.max));
  response.set("X-RateLimit-Remaining", String(remaining));

  if (!allowed) {
    response.set("Retry-After", String(retryAfter));
    // Never cache a throttle response as if it were the resource.
    response.set("Cache-Control", "no-store");
    response.status(429).json({
      error: limiet.error,
      detail: limiet.detail(limiet.max, limiet.windowMs),
      retryAfter,
    });
    return false;
  }

  return true;
};

export const RATE_LIMIT = { WINDOW_MS, MAX_REQUESTS_PER_WINDOW, MAX_TRACKED_CLIENTS, LIMIETEN };
