/** In-process single-flight dedupe for POST /api/auth/refresh (per refresh token hash). */
export const authRefreshInFlight = new Map();
