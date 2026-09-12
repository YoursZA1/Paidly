/**
 * Render docs/Paidly-Workforce-Payroll-Leave-Structure.md to PDF.
 * Usage: node scripts/generate-workforce-structure-pdf.mjs
 * Output: docs/Paidly-Workforce-Payroll-Leave-Structure.pdf
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const mdPath = path.join(root, "docs/Paidly-Workforce-Payroll-Leave-Structure.md");
const outPdf = path.join(root, "docs/Paidly-Workforce-Payroll-Leave-Structure.pdf");
const outHtml = path.join(root, "docs/Paidly-Workforce-Payroll-Leave-Structure.html");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function markdownToHtml(md) {
  const source = md.replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const html = [];
  let i = 0;
  let inCode = false;
  let codeLang = "";
  let codeLines = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  const isTableSep = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  const splitRow = (line) =>
    line
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    if (inCode) {
      if (line.startsWith("```")) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        inCode = false;
        codeLang = "";
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      closeLists();
      inCode = true;
      codeLang = line.slice(3).trim();
      codeLines = [];
      i += 1;
      continue;
    }

    if (line.trim() === "") {
      closeLists();
      i += 1;
      continue;
    }

    if (line.startsWith("# ")) {
      closeLists();
      html.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      closeLists();
      html.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
      i += 1;
      continue;
    }
    if (line.startsWith("### ")) {
      closeLists();
      html.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      closeLists();
      html.push("<hr />");
      i += 1;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      closeLists();
      const headers = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && !isTableSep(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      html.push("<table><thead><tr>");
      for (const h of headers) html.push(`<th>${inlineFormat(h)}</th>`);
      html.push("</tr></thead><tbody>");
      for (const row of rows) {
        html.push("<tr>");
        for (let c = 0; c < headers.length; c += 1) {
          html.push(`<td>${inlineFormat(row[c] || "")}</td>`);
        }
        html.push("</tr>");
      }
      html.push("</tbody></table>");
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inlineFormat(ul[1])}</li>`);
      i += 1;
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${inlineFormat(ol[1])}</li>`);
      i += 1;
      continue;
    }

    closeLists();
    html.push(`<p>${inlineFormat(line)}</p>`);
    i += 1;
  }

  closeLists();
  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  return html.join("\n");
}

function wrapDocument(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Paidly — Payroll, Payslip &amp; Leave Structure</title>
  <style>
    @page { margin: 16mm 14mm 18mm; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size: 9.6pt; line-height: 1.45; color: #0f172a; margin: 0; padding: 0; }
    h1 { font-size: 17pt; margin: 0 0 8px; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px; }
    h2 { font-size: 11.5pt; margin: 16px 0 6px; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.03em; page-break-after: avoid; }
    h3 { font-size: 10.5pt; margin: 12px 0 4px; color: #334155; page-break-after: avoid; }
    p { margin: 0 0 7px; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 8.5pt; page-break-inside: auto; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; }
    ul, ol { margin: 4px 0 8px 18px; padding: 0; }
    li { margin-bottom: 3px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 8pt; background: #f1f5f9; padding: 0 3px; border-radius: 2px; }
    pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 7.8pt; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; margin: 8px 0; white-space: pre-wrap; overflow-wrap: anywhere; page-break-inside: avoid; }
    pre code { background: none; padding: 0; }
    a { color: #1d4ed8; text-decoration: none; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 12px 0; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

async function main() {
  const md = fs.readFileSync(mdPath, "utf8");
  const html = wrapDocument(markdownToHtml(md));
  fs.writeFileSync(outHtml, html, "utf8");

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
        <span>Paidly — Payroll, Payslip &amp; Leave Structure · 12 Sep 2026</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `,
  });
  await browser.close();
  console.log(`Wrote ${outPdf}`);
  console.log(`Wrote ${outHtml}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
