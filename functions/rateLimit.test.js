import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { enforceRateLimit, resetRateLimit, RATE_LIMIT } from "./rateLimit.js";
import { fakeResponse } from "./versionedResource.test.js";

const { MAX_REQUESTS_PER_WINDOW, WINDOW_MS } = RATE_LIMIT;

const requestFrom = (ip) => ({ headers: { "x-forwarded-for": ip }, ip: "10.0.0.1" });

beforeEach(() => resetRateLimit());

test("requests under the limit pass and report what is left", () => {
  const res = fakeResponse();
  assert.equal(enforceRateLimit(requestFrom("1.1.1.1"), res, 0), true);
  assert.equal(res.headers["X-RateLimit-Limit"], String(MAX_REQUESTS_PER_WINDOW));
  assert.equal(res.headers["X-RateLimit-Remaining"], String(MAX_REQUESTS_PER_WINDOW - 1));
  assert.equal(res.statusCode, null, "an allowed request must not be answered by the limiter");
});

test("the request that exceeds the limit gets a 429 with Retry-After", () => {
  const request = requestFrom("2.2.2.2");
  for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
    assert.equal(enforceRateLimit(request, fakeResponse(), 0), true, `request ${i + 1} should pass`);
  }

  const res = fakeResponse();
  assert.equal(enforceRateLimit(request, res, 0), false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, "Too many requests");
  assert.equal(res.headers["Retry-After"], String(WINDOW_MS / 1000));
  assert.equal(res.headers["X-RateLimit-Remaining"], "0");
  // A throttle must never be cached in place of the resource it replaced.
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("the window resets", () => {
  const request = requestFrom("3.3.3.3");
  for (let i = 0; i <= MAX_REQUESTS_PER_WINDOW; i++) enforceRateLimit(request, fakeResponse(), 0);
  assert.equal(enforceRateLimit(request, fakeResponse(), 0), false);

  assert.equal(enforceRateLimit(request, fakeResponse(), WINDOW_MS), true);
});

// One noisy client must not throttle everyone else.
test("clients are limited independently", () => {
  const noisy = requestFrom("4.4.4.4");
  for (let i = 0; i <= MAX_REQUESTS_PER_WINDOW; i++) enforceRateLimit(noisy, fakeResponse(), 0);
  assert.equal(enforceRateLimit(noisy, fakeResponse(), 0), false);

  assert.equal(enforceRateLimit(requestFrom("5.5.5.5"), fakeResponse(), 0), true);
});

// Cloud Functions sits behind a proxy, so req.ip is the load balancer for
// everyone; keying on that would make one client's burst throttle the world.
test("the client is identified from X-Forwarded-For, not the proxy peer", () => {
  const shared = { headers: {}, ip: "10.0.0.1" };
  for (let i = 0; i <= MAX_REQUESTS_PER_WINDOW; i++) enforceRateLimit(shared, fakeResponse(), 0);
  assert.equal(enforceRateLimit(shared, fakeResponse(), 0), false, "no XFF: falls back to req.ip");

  // Same peer address, different forwarded client -> its own budget.
  const forwarded = { headers: { "x-forwarded-for": "6.6.6.6, 10.0.0.1" }, ip: "10.0.0.1" };
  assert.equal(enforceRateLimit(forwarded, fakeResponse(), 0), true);
});
