import { test, type TestInfo } from '@playwright/test';

/**
 * Guest projects use empty storageState; app routes redirect to /Login.
 * Call from `test.beforeEach(({}, testInfo) => { skipGuestProject(testInfo); })`.
 */
export function skipGuestProject(
  testInfo: TestInfo,
  reason = 'Requires authenticated session (chromium / chromium-mobile, not *-guest)'
) {
  test.skip(/guest/i.test(testInfo.project.name), reason);
}
