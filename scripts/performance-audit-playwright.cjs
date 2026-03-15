/**
 * Senior QA & Performance Audit — Playwright
 * Diagnoses: slow loads, failed API calls, DB/network delays, UI lag, navigation performance.
 * Run: TARGET_URL=http://localhost:5173 node scripts/performance-audit-playwright.cjs
 * Requires: dev server running (npm run dev) and optionally logged-in session.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5173';
const SLOW_MS = 1000;
const NAV_SLOW_MS = 2000;
const REPORT_PATH = path.join(__dirname, '..', 'docs', 'PERFORMANCE_DIAGNOSTIC_REPORT.md');

const report = {
  initialLoadTimeMs: null,
  navTimes: [],
  slowRequests: [],
  failedRequests: [],
  duplicateRequests: [],
  consoleErrors: [],
  dataLoadingIssues: [],
  uiPerformanceIssues: [],
  stressTest: { runs: 0, freezes: [], failedReloads: [] },
  screenshots: [],
};

const requestTimings = new Map();
const requestUrls = new Map();

function formatMs(ms) {
  return ms == null ? '—' : `${Math.round(ms)} ms`;
}

function collectReport() {
  const lines = [
    '# Application Performance Diagnostic Report',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Target URL:** ${TARGET_URL}`,
    '',
    '---',
    '',
    '## APPLICATION PERFORMANCE SUMMARY',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Initial page load time | ${formatMs(report.initialLoadTimeMs)} |`,
    `| Average page navigation time | ${formatMs(avg(report.navTimes))} |`,
    `| Slow requests (>${SLOW_MS} ms) | ${report.slowRequests.length} |`,
    `| Failed requests (4xx/5xx) | ${report.failedRequests.length} |`,
    `| Duplicate API calls detected | ${report.duplicateRequests.length} |`,
    `| Console errors | ${report.consoleErrors.length} |`,
    '',
    '---',
    '',
    '## FAILED OR SLOW REQUESTS',
    '',
  ];

  if (report.slowRequests.length || report.failedRequests.length) {
    lines.push('| Endpoint / URL | Response time | Status / Error |');
    lines.push('|----------------|---------------|----------------|');
    for (const r of report.failedRequests) {
      lines.push(`| \`${r.url}\` | ${formatMs(r.duration)} | ${r.status || r.error} |`);
    }
    for (const r of report.slowRequests) {
      if (!report.failedRequests.some((f) => f.url === r.url && f.ts === r.ts)) {
        lines.push(`| \`${r.url}\` | ${formatMs(r.duration)} (slow) | ${r.status || '—'} |`);
      }
    }
    lines.push('');
  } else {
    lines.push('No failed or slow requests recorded.');
    lines.push('');
  }

  lines.push('---', '', '## DATA LOADING ISSUES', '', '');
  if (report.dataLoadingIssues.length) {
    report.dataLoadingIssues.forEach((issue) => {
      lines.push(`- **${issue.page}:** ${issue.message}`);
      if (issue.cause) lines.push(`  - Possible cause: ${issue.cause}`);
    });
    lines.push('');
  } else {
    lines.push('No data loading issues recorded (or pages not reached due to auth).');
    lines.push('');
  }

  lines.push('---', '', '## UI PERFORMANCE ISSUES', '', '');
  if (report.uiPerformanceIssues.length) {
    report.uiPerformanceIssues.forEach((issue) => {
      lines.push(`- ${issue}`);
    });
    lines.push('');
  } else {
    lines.push('No UI performance issues recorded.');
    lines.push('');
  }

  lines.push('---', '', '## STRESS TEST (Rapid Navigation)', '', '');
  lines.push(`- Runs: ${report.stressTest.runs}`);
  if (report.stressTest.freezes.length) {
    lines.push('- Possible freezes:');
    report.stressTest.freezes.forEach((f) => lines.push(`  - ${f}`));
  }
  if (report.stressTest.failedReloads.length) {
    lines.push('- Failed reloads:');
    report.stressTest.failedReloads.forEach((r) => lines.push(`  - ${r}`));
  }
  lines.push('');

  lines.push('---', '', '## DUPLICATE API CALLS', '', '');
  if (report.duplicateRequests.length) {
    lines.push('| Key | Request count |');
    lines.push('|-----|----------------|');
    report.duplicateRequests.forEach((d) => {
      lines.push(`| \`${d.key}\` | ${d.count} |`);
    });
    lines.push('');
  } else {
    lines.push('None detected.');
    lines.push('');
  }

  lines.push('---', '', '## CONSOLE ERRORS (sample)', '', '');
  const sample = report.consoleErrors.slice(0, 20);
  if (sample.length) {
    sample.forEach((e) => lines.push(`- \`${e}\``));
  } else {
    lines.push('No console errors captured.');
  }
  lines.push('');

  lines.push('---', '', '## RECOMMENDED FIXES', '', '');
  lines.push('### API / Backend');
  lines.push('- Add or review indexes for Supabase queries used on Dashboard, Clients, Quotes, Invoices.');
  lines.push('- Ensure list endpoints return paginated or bounded result sets.');
  lines.push('- Consider caching for rarely changing data (e.g. services, org settings).');
  lines.push('');
  lines.push('### Frontend');
  lines.push('- Lazy-load heavy routes and defer non-critical JS.');
  lines.push('- Avoid duplicate fetches (e.g. same list fetched in Layout and page).');
  lines.push('- Use React Query or similar to deduplicate and cache API calls.');
  lines.push('');
  lines.push('### Network');
  lines.push('- Minimize payload size for list endpoints (select only needed columns).');
  lines.push('- Use stable cache headers for static assets.');
  lines.push('');

  return lines.join('\n');
}

function avg(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function run() {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // --- Network monitoring ---
  page.on('request', (req) => {
    const url = req.url();
    const key = req.method() + ' ' + url;
    requestTimings.set(key, { start: Date.now(), url, method: req.method() });
    const count = (requestUrls.get(key) || 0) + 1;
    requestUrls.set(key, count);
  });

  page.on('response', async (res) => {
    const req = res.request();
    const url = req.url();
    const key = req.method() + ' ' + url;
    const timing = requestTimings.get(key);
    const duration = timing ? Date.now() - timing.start : null;
    const status = res.status();

    if (status >= 400) {
      report.failedRequests.push({
        url: url.length > 80 ? url.slice(0, 80) + '…' : url,
        status,
        duration,
        ts: timing?.start,
      });
    } else if (duration != null && duration > SLOW_MS) {
      report.slowRequests.push({
        url: url.length > 80 ? url.slice(0, 80) + '…' : url,
        duration,
        status,
        ts: timing?.start,
      });
    }

  });

  page.on('requestfailed', (req) => {
    report.failedRequests.push({
      url: req.url().slice(0, 100),
      error: req.failure()?.errorText || 'Request failed',
      ts: Date.now(),
    });
  });

  // --- Console errors ---
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      report.consoleErrors.push(text);
    }
  });

  const routes = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Clients', path: '/clients' },
    { name: 'Quotes', path: '/quotes' },
    { name: 'Invoices', path: '/invoices' },
    { name: 'Settings', path: '/settings' },
  ];

  try {
    // --- STEP 1: Initial load ---
    console.log('STEP 1 — Launch and monitor:', TARGET_URL);
    const loadStart = Date.now();
    await page.goto(TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForTimeout(800);
    report.initialLoadTimeMs = Date.now() - loadStart;
    console.log('Initial load time:', report.initialLoadTimeMs, 'ms');

    const afterLoadUrl = page.url();
    const isLogin = afterLoadUrl.includes('/Login') || afterLoadUrl.includes('/login');
    if (isLogin) {
      console.log('App redirected to Login (not authenticated). Continuing with login page for metrics.');
      report.dataLoadingIssues.push({
        page: 'All authenticated routes',
        message: 'User not logged in; redirected to Login. Data loading could not be validated for Dashboard, Clients, Quotes, Invoices, Settings.',
        cause: 'Missing or expired session.',
      });
    }

    // --- STEP 2 & 3: Navigate each route and validate data loading ---
    console.log('STEP 2–4 — Network analysis and navigation performance');
    for (const route of routes) {
      requestTimings.clear();
      const navStart = Date.now();
      await page.goto(TARGET_URL + route.path, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1200);
      const navTime = Date.now() - navStart;
      report.navTimes.push(navTime);

      if (navTime > NAV_SLOW_MS) {
        report.uiPerformanceIssues.push(`Navigation to ${route.name} took ${Math.round(navTime)} ms (>${NAV_SLOW_MS} ms threshold).`);
      }

      const currentUrl = page.url();
      const landedOnLogin = currentUrl.includes('/Login') || currentUrl.includes('/login');
      if (landedOnLogin) {
        report.dataLoadingIssues.push({
          page: route.name,
          message: 'Redirected to Login; page data not loaded.',
          cause: 'RequireAuth redirect.',
        });
        continue;
      }

      // Data loading validation: look for tables, empty state, or loading indicators
      const loadingSkeleton = await page.locator('[class*="Skeleton"], [class*="skeleton"], [class*="loading"]').count();
      const tableOrList = await page.locator('table, [role="grid"], [data-state="list"]').count();
      if (loadingSkeleton > 2 && tableOrList === 0) {
        report.dataLoadingIssues.push({
          page: route.name,
          message: 'Multiple loading indicators and no table/list visible after 1.2s.',
          cause: 'Slow API or blocking render.',
        });
      }
    }

    // --- STEP 5: Interaction testing ---
    console.log('STEP 5 — Interaction testing');
    await page.goto(TARGET_URL + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(600);

    const navLinks = await page.locator('a[href*="/dashboard"], a[href*="/clients"], a[href*="/invoices"], a[href*="/quotes"], a[href*="/settings"]').all();
    for (let i = 0; i < Math.min(3, navLinks.length); i++) {
      const clickStart = Date.now();
      await navLinks[i].click().catch(() => {});
      await page.waitForTimeout(400);
      const clickDuration = Date.now() - clickStart;
      if (clickDuration > 1500) {
        report.uiPerformanceIssues.push(`Nav link click took ${Math.round(clickDuration)} ms to respond.`);
      }
    }

    // --- STEP 6: Stress test navigation ---
    console.log('STEP 6 — Stress test navigation');
    const cycle = ['/dashboard', '/clients', '/quotes', '/invoices', '/dashboard'];
    report.stressTest.runs = 2;
    for (let round = 0; round < 2; round++) {
      for (const p of cycle) {
        const start = Date.now();
        await page.goto(TARGET_URL + p, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {
          report.stressTest.failedReloads.push(`${p} (round ${round + 1})`);
        });
        const elapsed = Date.now() - start;
        if (elapsed > 5000) report.stressTest.freezes.push(`${p} took ${Math.round(elapsed)} ms in round ${round + 1}`);
        await page.waitForTimeout(300);
      }
    }

    // Screenshots (optional)
    try {
      const screenshotDir = path.join(__dirname, '..', 'docs', 'screenshots');
      if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
      const name = `audit-${Date.now()}.png`;
      await page.screenshot({ path: path.join(screenshotDir, name), fullPage: false });
      report.screenshots.push(`docs/screenshots/${name}`);
    } catch (_) {}

  } catch (err) {
    report.uiPerformanceIssues.push(`Audit script error: ${err.message}`);
    console.error(err);
  } finally {
    await browser.close();
  }

  // Duplicate API calls: same method+url seen more than once across the run
  for (const [key, count] of requestUrls) {
    if (count > 1 && (key.includes('/rest/') || key.includes('/api/') || key.includes('supabase'))) {
      const short = key.length > 100 ? key.slice(0, 100) + '…' : key;
      if (!report.duplicateRequests.some((d) => d.key === short)) {
        report.duplicateRequests.push({ key: short, count });
      }
    }
  }

  // --- STEP 8: Write report ---
  const reportMarkdown = collectReport();
  const reportDir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(REPORT_PATH, reportMarkdown, 'utf8');
  console.log('\nSTEP 8 — Report written to', REPORT_PATH);
  console.log('\n' + reportMarkdown.slice(0, 2500) + '\n... (see file for full report)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
