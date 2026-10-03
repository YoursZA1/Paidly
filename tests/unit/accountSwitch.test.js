import { afterEach, describe, expect, it } from "vitest";
import {
  releasePreviousAccountContext,
  shouldExpireSessionAfterSignedOut,
  TENANT_HOME_REDIRECT_FLAG,
} from "@/lib/auth/accountSwitch";
import { getActivePortalSlug, setActivePortalSlug } from "@/lib/workforcePortal/portalState.js";

describe("account switch", () => {
  const memory = new Map();

  afterEach(() => {
    memory.clear();
    delete global.sessionStorage;
  });

  it("does not treat a replacement session as signed out", () => {
    expect(shouldExpireSessionAfterSignedOut("user-b")).toBe(false);
    expect(shouldExpireSessionAfterSignedOut(null)).toBe(true);
    expect(shouldExpireSessionAfterSignedOut("")).toBe(true);
  });

  it("drops the previous portal, tenant home flag, and org context", async () => {
    global.sessionStorage = {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => {
        memory.set(key, String(value));
      },
      removeItem: (key) => {
        memory.delete(key);
      },
    };
    setActivePortalSlug("shoprite-crew");
    memory.set(TENANT_HOME_REDIRECT_FLAG, "1");

    await releasePreviousAccountContext();

    expect(getActivePortalSlug()).toBe("");
    expect(memory.get(TENANT_HOME_REDIRECT_FLAG)).toBeUndefined();
  });
});
