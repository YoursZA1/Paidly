import { afterEach, describe, expect, it } from "vitest";
import { SESSION_STATUS, applySessionHealthFromAuthority, useSessionHealthStore } from "@/stores/sessionHealthStore";

describe("sessionHealthStore terminal semantics", () => {
  afterEach(() => {
    useSessionHealthStore.setState({
      status: SESSION_STATUS.CONNECTED,
      reason: null,
      lastTransitionAt: Date.now(),
    });
  });

  it("blocks silent reconnect after EXPIRED", () => {
    applySessionHealthFromAuthority(SESSION_STATUS.EXPIRED, "inactivity_timeout");
    applySessionHealthFromAuthority(SESSION_STATUS.RECONNECTING, "refresh_failed");
    const state = useSessionHealthStore.getState();
    expect(state.status).toBe(SESSION_STATUS.EXPIRED);
    expect(state.reason).toBe("inactivity_timeout");
  });

  it("blocks silent connected transition after EXPIRED", () => {
    applySessionHealthFromAuthority(SESSION_STATUS.EXPIRED, "session_revoked");
    applySessionHealthFromAuthority(SESSION_STATUS.CONNECTED, "refresh_ok");
    const state = useSessionHealthStore.getState();
    expect(state.status).toBe(SESSION_STATUS.EXPIRED);
    expect(state.reason).toBe("session_revoked");
  });

  it("allows explicit re-authentication to recover from EXPIRED", () => {
    applySessionHealthFromAuthority(SESSION_STATUS.EXPIRED, "inactivity_timeout");
    applySessionHealthFromAuthority(SESSION_STATUS.CONNECTED, "signed_in");
    const state = useSessionHealthStore.getState();
    expect(state.status).toBe(SESSION_STATUS.CONNECTED);
    expect(state.reason).toBe("signed_in");
  });
});
