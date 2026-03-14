/**
 * Playwright MCP-style inspection: open app, optionally login, then capture layout, test nav/forms, screenshot pages, report.
 * Run: npm run playwright:inspect (or node scripts/playwright-inspect-app.cjs)
 * Requires: dev server on http://localhost:5173.
 * One-time: npm run playwright:install (or PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx playwright install chromium)
 * To exercise dashboard/sidebar/authenticated routes, set:
 *   PLAYWRIGHT_INSPECT_EMAIL=your@email.com
 *   PLAYWRIGHT_INSPECT_PASSWORD=yourpassword
 */
const path = require('path');
const fs = require('fs');
// Use project-local browsers so install and inspect share the same path (e.g. when run from Cursor)
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.cwd(), '.playwright-browsers');
}
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(process.cwd(), 'playwright-screenshots');
const INSPECT_EMAIL = process.env.PLAYWRIGHT_INSPECT_EMAIL || '';
const INSPECT_PASSWORD = process.env.PLAYWRIGHT_INSPECT_PASSWORD || '';

const report = {
  pagesTested: [],
  functionalIssues: [],
  uiInconsistencies: [],
  performanceObservations: [],
  consoleErrors: [],
  consoleWarnings: [],
  screenshots: [],
};

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  return line;
}

function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function takeScreenshot(page, name) {
  ensureScreenshotDir();
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch((e) => {
    report.functionalIssues.push(`Screenshot ${name}: ${e.message}`);
  });
  report.screenshots.push(file);
  log(`Screenshot: ${file}`);
}

async function run() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    if (e.message && e.message.includes("Executable doesn't exist")) {
      try {
        browser = await chromium.launch({ headless: true, channel: 'chrome' });
      } catch (e2) {
        console.error('Run from your project root in a terminal (not Cursor): npx playwright install chromium');
        throw e;
      }
    } else {
      throw e;
    }
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') report.consoleErrors.push(text);
    else if (type === 'warning') report.consoleWarnings.push(text);
  });

  try {
    log('1. Navigating to ' + TARGET_URL);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 20000 });
    let title = await page.title();
    log('Page title: ' + title);

    let url = page.url();
    const onLoginPage = url.includes('/Login') || url.includes('/login');

    if (onLoginPage) {
      log('Landed on Login (not authenticated). Taking login screenshot.');
      await takeScreenshot(page, '01-login');
      report.pagesTested.push({ path: '/Login', title });
      const emailInput = (await page.locator('input[type="email"], input[name="email"], #email').count()) > 0;
      const passwordInput = (await page.locator('input[type="password"], #password').count()) > 0;
      const submitBtn = (await page.locator('button[type="submit"]').count()) > 0;
      if (!emailInput || !passwordInput || !submitBtn) {
        report.uiInconsistencies.push('Login: missing email/password inputs or submit button');
      }

      if (INSPECT_EMAIL && INSPECT_PASSWORD) {
        log('Logging in with PLAYWRIGHT_INSPECT_EMAIL to exercise authenticated routes.');
        try {
          await page.fill('#email', INSPECT_EMAIL);
          await page.fill('#password', INSPECT_PASSWORD);
          await page.locator('button[type="submit"]').click();
          await page.waitForURL((u) => {
            const p = typeof u === 'string' ? u : (u.pathname || u.toString());
            return !p.includes('Login') && !p.includes('login');
          }, { timeout: 20000 });
          await page.waitForLoadState('networkidle').catch(() => {});
          await page.waitForTimeout(1000);
          url = page.url();
          title = await page.title();
          log('Login succeeded. Current URL: ' + url);
        } catch (e) {
          log('Login failed: ' + e.message);
          report.functionalIssues.push('Login failed: ' + e.message);
          await takeScreenshot(page, '01-login-failed');
          await context.close();
          await browser.close();
          printReport();
          return;
        }
      } else {
        log('Skipping authenticated routes. Set PLAYWRIGHT_INSPECT_EMAIL and PLAYWRIGHT_INSPECT_PASSWORD to login and exercise dashboard/sidebar.');
        await context.close();
        await browser.close();
        printReport();
        return;
      }
    }

    await takeScreenshot(page, '02-dashboard');
    report.pagesTested.push({ path: url.replace(TARGET_URL, '') || '/', title });

    log('2. Inspecting layout structure');
    const layout = {
      sidebar: (await page.locator('nav, aside, [role="navigation"], .sidebar').count()) > 0,
      header: (await page.locator('header, [role="banner"], .header').count()) > 0,
      main: (await page.locator('main, [role="main"], .main, article').count()) > 0,
      buttons: await page.locator('button, [role="button"]').count(),
      inputs: await page.locator('input, textarea, select').count(),
    };
    log('Layout: sidebar=' + layout.sidebar + ', header=' + layout.header + ', main=' + layout.main + ', buttons=' + layout.buttons + ', inputs=' + layout.inputs);
    if (!layout.sidebar) report.uiInconsistencies.push('No obvious navigation sidebar found');
    if (!layout.main) report.uiInconsistencies.push('No obvious main content area found');

    log('3. Testing navigation links (first 5)');
    const navLinks = await page.locator('nav a[href], aside a[href]').all();
    const maxNav = Math.min(5, navLinks.length);
    for (let i = 0; i < maxNav; i++) {
      const href = await navLinks[i].getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) continue;
      try {
        await navLinks[i].click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);
        const u = page.url();
        const t = await page.title();
        report.pagesTested.push({ path: u.replace(TARGET_URL, ''), title: t });
        await takeScreenshot(page, `03-nav-${i + 1}-${(href || '').replace(/\//g, '-').slice(0, 20)}`);
        await page.goBack().catch(() => {});
        await page.waitForTimeout(300);
      } catch (e) {
        report.functionalIssues.push(`Nav link ${href}: ${e.message}`);
      }
    }

    log('4. Testing dropdowns (first 2 trigger clicks)');
    const triggers = await page.locator('[data-state="closed"] button, [aria-haspopup="true"], .dropdown-trigger').all();
    for (let i = 0; i < Math.min(2, triggers.length); i++) {
      try {
        await triggers[i].click();
        await page.waitForTimeout(400);
        const open = (await page.locator('[data-state="open"], [role="menu"]').count()) > 0;
        if (open) await takeScreenshot(page, `04-dropdown-${i + 1}`);
        await page.keyboard.press('Escape');
      } catch (e) {
        report.functionalIssues.push(`Dropdown ${i + 1}: ${e.message}`);
      }
    }

    log('5. Testing first visible button (non-nav)');
    const primaryBtn = await page.locator('main button, [role="main"] button, article button').first();
    if ((await primaryBtn.count()) > 0) {
      try {
        await primaryBtn.click();
        await page.waitForTimeout(300);
        await page.goBack().catch(() => {});
      } catch (e) {
        report.functionalIssues.push('Primary area button: ' + e.message);
      }
    }

    log('6. Checking for broken elements (images, empty links)');
    const imgs = await page.locator('img').all();
    for (let i = 0; i < imgs.length; i++) {
      const src = await imgs[i].getAttribute('src');
      if (!src || src === '') report.uiInconsistencies.push('Image with empty src');
    }

    await takeScreenshot(page, '07-final');
  } catch (err) {
    log('Error: ' + err.message);
    report.functionalIssues.push(err.message);
    try {
      await takeScreenshot(page, '99-error');
    } catch (_) {}
  } finally {
    await context.close();
    await browser.close();
  }

  printReport();
}

function printReport() {
  log('\n========== INSPECTION REPORT ==========');
  log('Pages tested: ' + report.pagesTested.length);
  report.pagesTested.forEach((p, i) => log(`  ${i + 1}. ${p.path || '/'} - ${p.title}`));
  log('Screenshots: ' + report.screenshots.length);
  report.screenshots.forEach((s) => log('  ' + s));
  log('Console errors: ' + report.consoleErrors.length);
  report.consoleErrors.slice(0, 10).forEach((e) => log('  ' + e));
  log('Console warnings: ' + report.consoleWarnings.length);
  report.consoleWarnings.slice(0, 10).forEach((w) => log('  ' + w));
  log('Functional issues: ' + report.functionalIssues.length);
  report.functionalIssues.forEach((f) => log('  ' + f));
  log('UI inconsistencies: ' + report.uiInconsistencies.length);
  report.uiInconsistencies.forEach((u) => log('  ' + u));
  log('Performance: ' + (report.performanceObservations.length ? report.performanceObservations.join('; ') : 'none logged'));
  log('========================================\n');

  const reportPath = path.join(SCREENSHOT_DIR, 'inspection-report.json');
  ensureScreenshotDir();
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  } catch (e) {
    log('Could not write report JSON: ' + e.message);
  }
  log('Report JSON: ' + reportPath);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
