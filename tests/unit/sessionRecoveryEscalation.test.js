import { describe, expect, it, beforeEach } from "vitest";
import {
  bumpSessionRecoveryEscalation,
  getSessionRecoveryFailureCount,
  resetSessionRecoveryEscalation,
} from "@/lib/session/sessionRecoveryEscalation";
import { SESSION_STATUS } from "@/stores/sessionHealthStore";

describe("sessionRecoveryEscalation", () => {
  beforeEach(() => {
    resetSessionRecoveryEscalation();
  });

  it("walks the ladder before forcing terminal logout", () => {
    expect(bumpSessionRecoveryEscalation()).toEqual({
      status: SESSION_STATUS.UNSTABLE,
      forceTerminalLogout: false,
    });
    expect(bumpSessionRecoveryEscalation()).toEqual({
      status: SESSION_STATUS.RECONNECTING,
      forceTerminalLogout: false,
    });
    expect(bumpSessionRecoveryEscalation()).toEqual({
      status: SESSION_STATUS.DEGRADED,
      forceTerminalLogout: false,
    });
    expect(bumpSessionRecoveryEscalation()).toEqual({
      status: SESSION_STATUS.REAUTH_REQUIRED,
      forceTerminalLogout: false,
    });
    expect(bumpSessionRecoveryEscalation()).toEqual({
      status: SESSION_STATUS.REAUTH_REQUIRED,
      forceTerminalLogout: true,
    });
  });

  it("reset clears the counter", () => {
    bumpSessionRecoveryEscalation();
    bumpSessionRecoveryEscalation();
    expect(getSessionRecoveryFailureCount()).toBe(2);
    resetSessionRecoveryEscalation();
    expect(getSessionRecoveryFailureCount()).toBe(0);
    expect(bumpSessionRecoveryEscalation().status).toBe(SESSION_STATUS.UNSTABLE);
  });
});
