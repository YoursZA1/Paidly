import { describe, expect, it } from "vitest";
import { decideSessionAction, SESSION_DECISION } from "@/lib/sessionDecisionEngine";

describe("sessionDecisionEngine boundaries", () => {
  it("keeps network/transport failures in reconnecting", () => {
    const decision = decideSessionAction({
      reason: "network timeout while refreshing",
      believedSignedIn: true,
      online: true,
      refreshFatal: false,
    });
    expect(decision.action).toBe(SESSION_DECISION.RECONNECTING);
  });

  it("only uses reauth for explicit terminal auth reasons", () => {
    const decision = decideSessionAction({
      reason: "refresh_token_invalid",
      believedSignedIn: true,
      online: true,
      refreshFatal: true,
    });
    expect(decision.action).toBe(SESSION_DECISION.REAUTH_REQUIRED);
  });
});

