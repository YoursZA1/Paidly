import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/auth/SessionCoordinator", () => ({
  getStableSession: vi.fn(),
}));

vi.mock("@/stores/authSessionStore", () => ({
  useAuthSessionStore: {
    getState: () => ({
      session: {
        accessToken: "tok_test",
        user: { id: "11111111-2222-4333-a444-555555555555" },
      },
    }),
  },
}));

import { getStableSession } from "@/core/auth/SessionCoordinator";
import {
  CHECKOUT_REQUEST_TIMEOUT_MS,
  checkoutErrorFromHttp,
  createSubscriptionAndRedirect,
  resetSubscriptionCheckoutGuardForTests,
  submitPayfastCheckoutForm,
} from "@/services/subscriptionCheckoutService";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function stubCheckoutDocument() {
  const inputs = [];
  const form = {
    method: "",
    action: "",
    acceptCharset: "",
    target: "",
    style: {},
    appendChild: vi.fn((el) => {
      inputs.push(el);
      return el;
    }),
    submit: vi.fn(),
    querySelector: vi.fn(() => ({})),
    setAttribute: vi.fn(),
  };
  vi.stubGlobal("document", {
    createElement: vi.fn((tag) => {
      if (tag === "form") return form;
      return { type: "", name: "", value: "" };
    }),
    body: { appendChild: vi.fn() },
  });
  vi.stubGlobal("window", {
    location: { origin: "https://www.paidly.co.za" },
  });
  return { form, inputs };
}

describe("checkoutErrorFromHttp", () => {
  it("maps 401 to session-expired copy", () => {
    const err = checkoutErrorFromHttp(401, { error: "Invalid or expired token" });
    expect(err.status).toBe(401);
    expect(err.code).toBe("AUTH_REQUIRED");
    expect(err.message).toMatch(/session has expired/i);
  });

  it("maps 403 to permission copy", () => {
    const err = checkoutErrorFromHttp(403, { error: "Forbidden" });
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toMatch(/permission/i);
  });

  it("maps 400 to validation without leaking secrets", () => {
    const err = checkoutErrorFromHttp(400, { error: "Invalid or inactive plan", code: "INVALID_PLAN" });
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/inactive plan/i);
    expect(err.message).not.toMatch(/passphrase/i);
  });

  it("maps 500 and signature failures to a retry message", () => {
    const err = checkoutErrorFromHttp(500, {
      success: false,
      code: "PAYFAST_SIGNATURE_ERROR",
      error: "Unable to start the subscription. Please try again.",
    });
    expect(err.code).toBe("PAYFAST_SIGNATURE_ERROR");
    expect(err.message).toMatch(/try again/i);
  });
});

describe("submitPayfastCheckoutForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("POSTs in the current window without display:none or encoding the signature", () => {
    const { form, inputs } = stubCheckoutDocument();
    submitPayfastCheckoutForm(
      "https://sandbox.payfast.co.za/eng/process",
      {
        merchant_id: "10000100",
        name_first: "Armando",
        amount: 50,
        nested: { nope: true },
        empty: "",
        signature: "abc+/=def",
      },
      ["merchant_id", "name_first", "amount", "nested", "empty", "signature"],
      { requestId: "req-1" }
    );

    expect(form.method).toBe("POST");
    expect(form.action).toBe("https://sandbox.payfast.co.za/eng/process");
    expect(form.target).toBe("_self");
    expect(form.style.display).not.toBe("none");
    expect(form.setAttribute).toHaveBeenCalledWith("data-paidly-payfast-checkout", "1");

    const sig = inputs.find((el) => el.name === "signature");
    expect(sig.value).toBe("abc+/=def");
    expect(sig.value).not.toMatch(/%/);

    const name = inputs.find((el) => el.name === "name_first");
    expect(name.value).toBe("Armando");

    const amount = inputs.find((el) => el.name === "amount");
    expect(amount.value).toBe("50");

    expect(inputs.some((el) => el.name === "nested")).toBe(false);
    expect(form.submit).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-PayFast URL", () => {
    stubCheckoutDocument();
    expect(() =>
      submitPayfastCheckoutForm("https://example.com/pay", { signature: "abc" }, ["signature"])
    ).toThrow(/PayFast payment page/i);
  });
});

describe("createSubscriptionAndRedirect", () => {
  beforeEach(() => {
    resetSubscriptionCheckoutGuardForTests();
    vi.unstubAllGlobals();
    getStableSession.mockResolvedValue({
      access_token: "tok_test",
      user: { id: "11111111-2222-4333-a444-555555555555" },
    });
    stubCheckoutDocument();
  });

  afterEach(() => {
    resetSubscriptionCheckoutGuardForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("submits PayFast checkout on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          success: true,
          requestId: "srv-1",
          subscriptionId: "sub-1",
          checkout: {
            url: "https://sandbox.payfast.co.za/eng/process",
            method: "POST",
            fields: { merchant_id: "10000100", signature: "abc" },
            fieldOrder: ["merchant_id", "signature"],
          },
        })
      )
    );

    const result = await createSubscriptionAndRedirect({ planSlug: "starter_monthly" });
    expect(result.redirected).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body).planSlug).toBe("starter_monthly");
    expect(JSON.parse(init.body).amount).toBeUndefined();
  });

  it("stops on 401 without hanging", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "Invalid or expired token" })));
    await expect(createSubscriptionAndRedirect({ planSlug: "starter_monthly" })).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });

  it("stops on 400 invalid plan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(400, { error: "Invalid or inactive plan" }))
    );
    await expect(createSubscriptionAndRedirect({ planSlug: "starter_monthly" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("stops on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
    await expect(createSubscriptionAndRedirect({ planSlug: "starter_monthly" })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("aborts after 30s if the API never responds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, init) => {
        return new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      })
    );

    const pending = createSubscriptionAndRedirect({ planSlug: "starter_monthly" });
    const assertion = expect(pending).rejects.toMatchObject({ code: "CHECKOUT_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(CHECKOUT_REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it("rejects a second overlapping click", async () => {
    let resolveFetch;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );

    const first = createSubscriptionAndRedirect({ planSlug: "starter_monthly" });
    await expect(createSubscriptionAndRedirect({ planSlug: "business_monthly" })).rejects.toMatchObject({
      code: "CHECKOUT_IN_PROGRESS",
    });

    resolveFetch(
      jsonResponse(200, {
        success: true,
        subscriptionId: "sub-1",
        checkout: {
          url: "https://sandbox.payfast.co.za/eng/process",
          fields: { signature: "abc" },
        },
      })
    );
    await first;
  });
});
