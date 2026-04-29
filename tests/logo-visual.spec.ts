import { expect, test } from "@playwright/test";

type LogoContext = {
  id: string;
  path: string;
  logoSelectors: string[];
  requiresData?: boolean;
  dataEnvKey?: string;
  warnMaxDiffPixelRatio?: number;
  failMaxDiffPixelRatio?: number;
};

const contexts: LogoContext[] = [
  {
    id: "settings-profile-previews",
    path: "/Settings?tab=profile",
    logoSelectors: [
      '[alt="Profile"]',
      '[alt="Logo"]',
    ],
    // Settings previews are controlled/static, so keep tighter thresholds.
    warnMaxDiffPixelRatio: 0.0025,
    failMaxDiffPixelRatio: 0.01,
  },
  {
    id: "invoice-view",
    path: process.env.PLAYWRIGHT_LOGO_INVOICE_PATH || "",
    logoSelectors: [
      "img[alt='Logo']",
      "img[alt='Profile']",
      ".unified-invoice-template img",
    ],
    requiresData: true,
    dataEnvKey: "PLAYWRIGHT_LOGO_INVOICE_PATH",
    // Invoice pages can include dynamic font anti-aliasing/shadow differences.
    warnMaxDiffPixelRatio: 0.01,
    failMaxDiffPixelRatio: 0.03,
  },
  {
    id: "quote-view",
    path: process.env.PLAYWRIGHT_LOGO_QUOTE_PATH || "",
    logoSelectors: [
      "img[alt='Logo']",
      ".unified-invoice-template img",
    ],
    requiresData: true,
    dataEnvKey: "PLAYWRIGHT_LOGO_QUOTE_PATH",
    // Quote pages share document chrome and dynamic typography behavior.
    warnMaxDiffPixelRatio: 0.01,
    failMaxDiffPixelRatio: 0.03,
  },
];

async function firstVisibleLogo(page, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0 && (await locator.isVisible())) {
      return { locator, selector };
    }
  }
  return null;
}

test.describe("logo visual consistency", () => {
  for (const ctx of contexts) {
    test(`capture and validate ${ctx.id}`, async ({ page }, testInfo) => {
      if (ctx.requiresData && !ctx.path) {
        test.skip(true, `Missing required env ${ctx.dataEnvKey} for ${ctx.id}`);
      }

      await page.goto(ctx.path || "/", { waitUntil: "networkidle" });

      const found = await firstVisibleLogo(page, ctx.logoSelectors);
      expect(found, `No visible logo found in ${ctx.id}`).toBeTruthy();
      if (!found) return;

      const { locator, selector } = found;
      await expect(locator).toBeVisible();

      const logoInfo = await locator.evaluate((img) => {
        const el = img as HTMLImageElement;
        const styles = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          src: el.currentSrc || el.src || "",
          naturalWidth: el.naturalWidth || 0,
          naturalHeight: el.naturalHeight || 0,
          renderedWidth: Math.round(rect.width),
          renderedHeight: Math.round(rect.height),
          objectFit: styles.objectFit || "",
          borderRadius: styles.borderRadius || "",
        };
      });

      expect(logoInfo.src, `${ctx.id} has empty image src`).toBeTruthy();
      expect(logoInfo.naturalWidth, `${ctx.id} naturalWidth is zero`).toBeGreaterThan(0);
      expect(logoInfo.naturalHeight, `${ctx.id} naturalHeight is zero`).toBeGreaterThan(0);
      expect(logoInfo.renderedWidth, `${ctx.id} renderedWidth is zero`).toBeGreaterThan(0);
      expect(logoInfo.renderedHeight, `${ctx.id} renderedHeight is zero`).toBeGreaterThan(0);

      await testInfo.attach(`${ctx.id}-logo-metadata.json`, {
        body: JSON.stringify(
          {
            context: ctx.id,
            selector,
            viewport: page.viewportSize(),
            ...logoInfo,
          },
          null,
          2
        ),
        contentType: "application/json",
      });

      const clip = await locator.boundingBox();
      if (clip) {
        const shot = await page.screenshot({ clip });
        await testInfo.attach(`${ctx.id}-logo-crop.png`, {
          body: shot,
          contentType: "image/png",
        });
      }

      // Visual-regression thresholds per context:
      // - warn at 0.5%
      // - fail at 2.0%
      const warnThreshold = ctx.warnMaxDiffPixelRatio ?? 0.005;
      const failThreshold = ctx.failMaxDiffPixelRatio ?? 0.02;
      const snapshotName = `${ctx.id}.png`;

      let warnExceeded = false;
      try {
        await expect(locator).toHaveScreenshot(snapshotName, {
          maxDiffPixelRatio: warnThreshold,
          animations: "disabled",
          scale: "css",
          timeout: 15_000,
        });
      } catch {
        warnExceeded = true;
      }

      if (warnExceeded) {
        await testInfo.attach(`${ctx.id}-visual-warning.json`, {
          body: JSON.stringify(
            {
              context: ctx.id,
              warning: "Logo visual diff exceeded warning threshold",
              warnMaxDiffPixelRatio: warnThreshold,
              failMaxDiffPixelRatio: failThreshold,
            },
            null,
            2
          ),
          contentType: "application/json",
        });
      }

      await expect(locator).toHaveScreenshot(snapshotName, {
        maxDiffPixelRatio: failThreshold,
        animations: "disabled",
        scale: "css",
        timeout: 15_000,
      });
    });
  }
});
