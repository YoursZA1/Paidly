import { afterEach, describe, expect, it } from "vitest";
import { patchAuthSession, useAuthSessionStore } from "@/stores/authSessionStore";

describe("authSessionStore profileReady", () => {
  afterEach(() => {
    useAuthSessionStore.setState({
      user: null,
      session: null,
      loading: true,
      authLoadingTimedOut: false,
      profileReady: false,
    });
  });

  it("does not let a JWT-minimal user inherit a previous profileReady=true", () => {
    patchAuthSession({
      user: { id: "u1", full_name: "Ada", profileReady: true },
      profileReady: true,
    });
    expect(useAuthSessionStore.getState().profileReady).toBe(true);

    patchAuthSession({ user: { id: "u1", full_name: "jwt" } });
    expect(useAuthSessionStore.getState().profileReady).toBe(false);
  });

  it("clears profileReady when the user is wiped", () => {
    patchAuthSession({
      user: { id: "u1", profileReady: true },
      profileReady: true,
    });
    patchAuthSession({ user: null });
    expect(useAuthSessionStore.getState().profileReady).toBe(false);
  });

  it("promotes profileReady from a restored user when the patch omits the flag", () => {
    patchAuthSession({ user: { id: "u1", profileReady: true } });
    expect(useAuthSessionStore.getState().profileReady).toBe(true);
  });
});
