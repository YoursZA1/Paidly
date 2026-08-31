/**
 * Render docs/Paidly-Application-Wiring-Overview.html to PDF.
 * Usage: node scripts/generate-wiring-overview-pdf.mjs
 * Output: docs/Paidly-Application-Wiring-Overview.pdf
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "docs/Paidly-Application-Wiring-Overview.html");
const outPdf = path.join(root, "docs/Paidly-Application-Wiring-Overview.pdf");

async function main() {
  const html = fs.readFileSync(htmlPath, "utf8");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: outPdf,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", right: "12mm", bottom: "16mm", left: "12mm" },
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `
      <div style="font-size:8px; color:#64748b; width:100%; padding:0 12mm; display:flex; justify-content:space-between;">
        <span>Paidly — Application Wiring Overview · 26 Aug 2026</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `,
  });
  await browser.close();
  console.log(`Wrote ${outPdf}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
