import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppQueryClient } from "@/lib/query-client";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";

describe("query-client retry behavior", () => {
  afterEach(() => {
    useSessionHealthStore.setState({
      status: SESSION_STATUS.CONNECTED,
      reason: null,
      lastTransitionAt: Date.now(),
    });
  });

  it("does not retry when session is EXPIRED and query fails with 403", async () => {
    useSessionHealthStore.setState({
      status: SESSION_STATUS.EXPIRED,
      reason: "refresh_token_invalid",
      lastTransitionAt: Date.now(),
    });

    const queryClient = createAppQueryClient();
    const queryFn = vi.fn(async () => {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    });

    await expect(
      queryClient.fetchQuery({
        queryKey: ["retry-auth-expired-403"],
        queryFn,
      })
    ).rejects.toThrow("Forbidden");

    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});

