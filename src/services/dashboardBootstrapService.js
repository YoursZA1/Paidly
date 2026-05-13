import { backendApi } from "@/api/backendClient";
import { runDedupedAsync } from "@/lib/inflightRequestDedupe";
import { recordFetchDurationMs } from "@/lib/paidlyPerformanceMetrics";

/**
 * Single GET that returns dashboard lists + profile slice (see server `buildDashboardBootstrapPayload`).
 * Concurrent identical calls (same token + year) share one HTTP request to avoid duplicate fetches.
 * @param {{ accessToken: string, calendarYear?: number }} args
 * @returns {Promise<{
 *   user: object,
 *   organization: object | null,
 *   dashboard: object,
 *   recentInvoices: object[],
 *   stats: object
 * }>}
 */
export async function fetchDashboardBootstrap({ accessToken, calendarYear }) {
  if (!accessToken) {
    throw new Error("missing_access_token");
  }
  const year = Number(calendarYear) || new Date().getFullYear();
  const dedupeKey = `GET:/api/dashboard/bootstrap:${accessToken}:${year}`;
  return runDedupedAsync(dedupeKey, async () => {
    const t0 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    try {
      const { data } = await backendApi.get("/api/dashboard/bootstrap", {
        params: { year },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 45000,
        __paidlySilent: true,
      });
      const t1 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      recordFetchDurationMs(t1 - t0);
      return data;
    } catch (e) {
      const t1 = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      recordFetchDurationMs(t1 - t0);
      throw e;
    }
  });
}
