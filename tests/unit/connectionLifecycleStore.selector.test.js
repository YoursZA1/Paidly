import { describe, expect, it } from "vitest";
import { selectAuthGatedConnectedSignal } from "@/lib/connection/connectionLifecycleStore";
import { SESSION_STATUS } from "@/stores/sessionHealthStore";

function state(overrides = {}) {
  return {
    auth: { phase: "signed_in", lastReason: null },
    network: { online: true, updatedAt: null },
    ...overrides,
  };
}

describe("selectAuthGatedConnectedSignal", () => {
  it("returns false for terminal auth statuses", () => {
    expect(selectAuthGatedConnectedSignal(state(), SESSION_STATUS.REAUTH_REQUIRED)).toBe(false);
    expect(selectAuthGatedConnectedSignal(state(), SESSION_STATUS.EXPIRED)).toBe(false);
  });

  it("returns true only when session is connected, online, and signed-in", () => {
    expect(selectAuthGatedConnectedSignal(state(), SESSION_STATUS.CONNECTED)).toBe(true);
    expect(selectAuthGatedConnectedSignal(state({ auth: { phase: "reconnecting", lastReason: null } }), SESSION_STATUS.CONNECTED)).toBe(false);
    expect(selectAuthGatedConnectedSignal(state({ network: { online: false, updatedAt: null } }), SESSION_STATUS.CONNECTED)).toBe(false);
  });
});
