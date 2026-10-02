/**
 * POST /api/send-email has a per-user budget on the Vercel path.
 *
 * Regression for the 2026-10-02 fuzz audit: the only limiter (server/src/apiAbuseLimiter.js) is Express
 * middleware, which the Vercel function api/system.js?op=send-email never runs — any signed-in trial
 * account could send unlimited HTML email to any address from Paidly's sending domain.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: "e2000000-0000-4000-8000-000000000001", budget: new Map() }));
const sendHtmlEmail = vi.hoisted(() => vi.fn(async () => ({ success: true, data: { id: "msg" } })));

vi.mock("../../server/src/supabaseAuth.js", () => ({
  getUserFromRequest: async () => ({ user: state.user ? { id: state.user, user_metadata: {} } : null }),
}));
vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: {} }));
vi.mock("../../server/src/featureGate.js", () => ({ assertUserHasFeature: async () => {} }));
vi.mock("../../server/src/demo/demoMode.js", () => ({ isDemoUserId: async () => false, sendDemoNotSent: vi.fn() }));
vi.mock("../../server/src/sendInvoice.js", () => ({ sendHtmlEmail }));
vi.mock("../../server/src/rateLimit/consumeRateLimit.js", () => ({
  consumePersistedRateLimit: async (key, max) => {
    const used = (state.budget.get(key) || 0) + 1;
    state.budget.set(key, used);
    return used > max ? { ok: false, retryAfterSeconds: 120 } : { ok: true };
  },
}));

const { default: sendEmailHandler, SEND_EMAIL_LIMIT } = await import("../../server/src/sendEmailApi.js");

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v);
  return res;
}
const send = async (body = { to: "someone@example.com", subject: "Hi", body: "<p>x</p>" }) => {
  const res = mockRes();
  await sendEmailHandler({ method: "POST", headers: {}, body }, res);
  return res;
};

beforeEach(() => {
  state.user = "e2000000-0000-4000-8000-000000000001";
  state.budget.clear();
  sendHtmlEmail.mockClear();
});

describe("send-email budget", () => {
  it("allows normal use, then answers 429 with Retry-After and sends nothing more", async () => {
    for (let i = 0; i < SEND_EMAIL_LIMIT.hits; i += 1) expect((await send()).statusCode).toBe(200);
    const blocked = await send();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBe("120");
    expect(sendHtmlEmail).toHaveBeenCalledTimes(SEND_EMAIL_LIMIT.hits);
  });

  it("the budget is per user, so one account cannot exhaust another's", async () => {
    for (let i = 0; i <= SEND_EMAIL_LIMIT.hits; i += 1) await send();
    state.user = "e2000000-0000-4000-8000-000000000002";
    expect((await send()).statusCode).toBe(200);
  });

  it("unauthenticated callers are refused before any budget or send", async () => {
    state.user = null;
    expect((await send()).statusCode).toBe(401);
    expect(state.budget.size).toBe(0);
    expect(sendHtmlEmail).not.toHaveBeenCalled();
  });

  it.each([
    [{ to: "not-an-email", subject: "x" }],
    [{ to: ["a@b.co", "c@d.co"], subject: "x" }],
    [{ to: "a@b.co", subject: "" }],
    [{ to: "a@b.co", subject: "x".repeat(2000) }],
    [{ to: { $ne: null }, subject: "x" }],
  ])("malformed body %j is a 4xx and sends nothing", async (body) => {
    const res = await send(body);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(sendHtmlEmail).not.toHaveBeenCalled();
  });
});
