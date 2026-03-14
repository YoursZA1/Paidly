const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Navigating to', TARGET_URL);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const title = await page.title();
    console.log('Page title:', title);

    await page.screenshot({ path: 'paidly-home.png', fullPage: true });
    console.log('Screenshot saved to paidly-home.png');

    const url = page.url();
    console.log('Current URL:', url);

    if (url.includes('/Login') || url.includes('/login')) {
      console.log('App redirected to Login (expected if not authenticated).');
      await page.screenshot({ path: 'paidly-login.png', fullPage: true });
      console.log('Login page screenshot: paidly-login.png');
    }

    await browser.close();
    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: 'paidly-error.png' }).catch(() => {});
    await browser.close();
    process.exit(1);
  }
})();
