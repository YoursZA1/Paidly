/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();

vi.mock("@/api/backendClient", () => ({
  backendApi: {
    get: (...args) => mockGet(...args),
  },
}));

describe("exchangeRatesClientPolicy", () => {
  beforeEach(async () => {
    vi.resetModules();
    mockGet.mockReset();
    const g = globalThis;
    g.sessionStorage?.clear?.();
    g.localStorage?.clear?.();
    const mod = await import("@/lib/exchangeRatesClientPolicy");
    mod.__resetExchangeRatesClientPolicyForTests();
  });

  it("normalizeRatesMapFromApiPayload extracts rates object", async () => {
    const { normalizeRatesMapFromApiPayload } = await import("@/lib/exchangeRatesClientPolicy");
    const map = normalizeRatesMapFromApiPayload({
      base: "ZAR",
      date: "2026-01-01",
      rates: { USD: 0.055, EUR: 0.05 },
    });
    expect(map.USD).toBeCloseTo(0.055);
    expect(map.EUR).toBeCloseTo(0.05);
  });

  it("markExchangeRatesTerminalFailure opens circuit (sessionStorage expiry)", async () => {
    const { markExchangeRatesTerminalFailure, readExchangeRatesCircuitOpen } = await import(
      "@/lib/exchangeRatesClientPolicy"
    );
    expect(readExchangeRatesCircuitOpen()).toBe(false);
    markExchangeRatesTerminalFailure(404);
    expect(readExchangeRatesCircuitOpen()).toBe(true);
  });

  it("writeCachedExchangePayload then read returns payload for base", async () => {
    const { writeCachedExchangePayload, readCachedExchangePayload } = await import(
      "@/lib/exchangeRatesClientPolicy"
    );
    writeCachedExchangePayload("ZAR", { base: "ZAR", rates: { USD: 0.05 } });
    const got = readCachedExchangePayload("ZAR");
    expect(got?.rates?.USD).toBeCloseTo(0.05);
    expect(globalThis.localStorage.getItem("exchange_rates_ZAR")).toBeTruthy();
  });

  it("with fresh cache (< 12h) fetchLatestExchangeRatesPayload does not call the API", async () => {
    const { writeCachedExchangePayload, fetchLatestExchangeRatesPayload } = await import(
      "@/lib/exchangeRatesClientPolicy"
    );
    writeCachedExchangePayload("ZAR", { base: "ZAR", rates: { USD: 0.05 } });
    const out = await fetchLatestExchangeRatesPayload("ZAR");
    expect(out?.rates?.USD).toBeCloseTo(0.05);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("with stale cache returns cached data immediately and refreshes in background", async () => {
    const staleMs = 13 * 60 * 60 * 1000;
    globalThis.localStorage.setItem(
      "exchange_rates_ZAR",
      JSON.stringify({
        v: 1,
        savedAt: Date.now() - staleMs,
        data: { base: "ZAR", rates: { USD: 0.04 } },
      })
    );
    mockGet.mockResolvedValue({ data: { base: "ZAR", rates: { USD: 0.09 } } });
    const mod = await import("@/lib/exchangeRatesClientPolicy");
    const out = await mod.fetchLatestExchangeRatesPayload("ZAR");
    expect(out?.rates?.USD).toBeCloseTo(0.04);
    expect(mockGet).toHaveBeenCalledTimes(1);
    await vi.waitFor(
      () => {
        expect(mod.readCachedExchangePayload("ZAR")?.rates?.USD).toBeCloseTo(0.09);
      },
      { timeout: 3000 }
    );
  });

  it("dedupes concurrent network refresh for the same base", async () => {
    const { EXCHANGE_RATES_CACHE_TTL_MS } = await import("@/lib/exchangeRatesClientPolicy");
    globalThis.localStorage.setItem(
      "exchange_rates_ZAR",
      JSON.stringify({
        v: 1,
        savedAt: Date.now() - EXCHANGE_RATES_CACHE_TTL_MS - 60_000,
        data: { base: "ZAR", rates: { USD: 0.02 } },
      })
    );
    let resolveReq;
    mockGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReq = resolve;
        })
    );
    const mod = await import("@/lib/exchangeRatesClientPolicy");
    const p1 = mod.fetchLatestExchangeRatesPayload("ZAR");
    const p2 = mod.fetchLatestExchangeRatesPayload("ZAR");
    expect(mockGet).toHaveBeenCalledTimes(1);
    resolveReq({ data: { base: "ZAR", rates: { USD: 0.11 } } });
    await Promise.all([p1, p2]);
    expect(mod.readCachedExchangePayload("ZAR")?.rates?.USD).toBeCloseTo(0.11);
  });

  it("without cache awaits the network once", async () => {
    mockGet.mockResolvedValue({ data: { base: "ZAR", rates: { USD: 0.03 } } });
    const mod = await import("@/lib/exchangeRatesClientPolicy");
    const out = await mod.fetchLatestExchangeRatesPayload("ZAR");
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(out?.rates?.USD).toBeCloseTo(0.03);
  });
});
