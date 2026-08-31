// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  isStandaloneDisplay,
  isIosInstallCandidate,
  getInstallPromptSnapshot,
  promptPaidlyInstall,
  initInstallPromptListeners,
  __resetInstallPromptForTests,
  __setDeferredPromptForTests,
} from "@/lib/pwa/installPrompt";

describe("isStandaloneDisplay", () => {
  it("returns false without a window-like env", () => {
    expect(isStandaloneDisplay(undefined)).toBe(false);
  });

  it("detects matchMedia standalone", () => {
    expect(
      isStandaloneDisplay({
        matchMedia: (q) => ({ matches: q.includes("standalone") }),
        navigator: {},
        document: { referrer: "" },
      })
    ).toBe(true);
  });

  it("detects iOS navigator.standalone", () => {
    expect(
      isStandaloneDisplay({
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: true },
        document: { referrer: "" },
      })
    ).toBe(true);
  });
});

describe("isIosInstallCandidate", () => {
  it("detects iPhone Safari UA", () => {
    expect(
      isIosInstallCandidate({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605",
      })
    ).toBe(true);
  });

  it("detects iPadOS desktop-UA with touch", () => {
    expect(
      isIosInstallCandidate({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      })
    ).toBe(true);
  });

  it("returns false for desktop Chrome", () => {
    expect(
      isIosInstallCandidate({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0",
        platform: "MacIntel",
        maxTouchPoints: 0,
      })
    ).toBe(false);
  });
});

describe("install prompt", () => {
  beforeEach(() => {
    __resetInstallPromptForTests();
  });
  afterEach(() => {
    __resetInstallPromptForTests();
  });

  it("promptPaidlyInstall is unavailable without a deferred event", async () => {
    const result = await promptPaidlyInstall();
    expect(result.outcome).toBe("unavailable");
  });

  it("does not throw when attaching listeners", () => {
    expect(() => initInstallPromptListeners()).not.toThrow();
  });

  it("exposes canInstall when a deferred prompt is stored and not standalone", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {} }));
    __setDeferredPromptForTests({ prompt: vi.fn(), userChoice: Promise.resolve({ outcome: "accepted" }) });
    const snap = getInstallPromptSnapshot();
    expect(snap.canInstall).toBe(true);
    expect(snap.isInstalled).toBe(false);
    vi.unstubAllGlobals();
  });

  it("calls native prompt() and returns accepted", async () => {
    const prompt = vi.fn();
    __setDeferredPromptForTests({
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    const result = await promptPaidlyInstall();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe("accepted");
    expect(getInstallPromptSnapshot().canInstall).toBe(false);
  });
});
