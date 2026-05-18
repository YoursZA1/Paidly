/**
 * Build Paidly database structure PDF from supabase/schema.postgres.sql + migrations.
 * Usage: node scripts/generate-database-schema-pdf.mjs
 * Output: docs/Paidly-Database-Structure.pdf
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "supabase/schema.postgres.sql");
const migrationsDir = path.join(root, "supabase/migrations");
const outPdf = path.join(root, "docs/Paidly-Database-Structure.pdf");
const outHtml = path.join(root, "docs/Paidly-Database-Structure.html");

const DOMAIN = {
  organizations: "Core & tenancy",
  profiles: "Core & tenancy",
  memberships: "Core & tenancy",
  companies: "Core & tenancy",
  clients: "CRM & catalog",
  services: "CRM & catalog",
  products: "Inventory",
  stock_transactions: "Inventory",
  deliveries: "Inventory",
  inventory_movements: "Inventory",
  quotes: "Documents (legacy)",
  quote_items: "Documents (legacy)",
  invoices: "Documents (legacy)",
  invoice_items: "Documents (legacy)",
  documents: "Documents (unified engine)",
  document_items: "Documents (unified engine)",
  document_events: "Documents (unified engine)",
  document_sends: "Documents (unified engine)",
  payments: "Billing & payments",
  banking_details: "Billing & payments",
  recurring_invoices: "Billing & payments",
  packages: "Billing & payments",
  subscriptions: "Billing & payments",
  subscription_dunning_events: "Billing & payments",
  payslips: "Payroll",
  expenses: "Finance",
  tasks: "Operations",
  notifications: "Operations",
  invoice_views: "Analytics & tracking",
  message_logs: "Messaging",
  message_deliveries: "Messaging",
  client_portal_messages: "Messaging",
  waitlist_signups: "Growth",
  affiliate_applications: "Affiliates",
  affiliates: "Affiliates",
  referrals: "Affiliates",
  commissions: "Affiliates",
  affiliate_clicks: "Affiliates",
  drafts: "Drafts",
  draft_versions: "Drafts",
  audit_logs: "Admin & audit",
  admin_platform_messages: "Admin & audit",
  admin_broadcast_jobs: "Admin & audit",
  admin_settings: "Admin & audit",
  admin_system_state: "Admin & audit",
  api_rate_limit_buckets: "Platform",
};

function readSqlFiles() {
  const files = [schemaPath];
  if (fs.existsSync(migrationsDir)) {
    const migrations = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of migrations) files.push(path.join(migrationsDir, f));
  }
  return files.map((f) => fs.readFileSync(f, "utf8")).join("\n\n");
}

function parseTables(sql) {
  const tables = new Map();
  const createRe =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*;/gi;

  let m;
  while ((m = createRe.exec(sql)) !== null) {
    const name = m[1].toLowerCase();
    const body = m[2];
    const columns = parseColumns(body);
    tables.set(name, { name, columns, source: "create" });
  }

  const alterRe =
    /alter\s+table\s+(?:only\s+)?(?:public\.)?(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)\s+([^;]+);/gi;
  while ((m = alterRe.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    const def = m[3].trim().replace(/\s+/g, " ");
    if (!tables.has(table)) tables.set(table, { name: table, columns: [], source: "alter" });
    const t = tables.get(table);
    if (!t.columns.some((c) => c.name === col)) {
      t.columns.push({ name: col, type: def, constraints: "" });
    }
  }

  return tables;
}

function parseColumns(body) {
  const lines = body.split("\n");
  const cols = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("--") || line.startsWith("constraint ") || line.startsWith("unique ") || line.startsWith("primary key") || line.startsWith("check ") || line.startsWith("foreign key")) continue;
    line = line.replace(/,$/, "");
    const match = line.match(/^(\w+)\s+(.+)$/i);
    if (!match) continue;
    const name = match[1].toLowerCase();
    if (["constraint", "unique", "primary", "foreign", "check"].includes(name)) continue;
    let rest = match[2];
    const refIdx = rest.toLowerCase().indexOf(" references ");
    const constraints = refIdx >= 0 ? rest.slice(refIdx).trim() : "";
    if (refIdx >= 0) rest = rest.slice(0, refIdx).trim();
    cols.push({ name, type: rest, constraints });
  }
  return cols;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(tables) {
  const grouped = new Map();
  for (const t of [...tables.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const domain = DOMAIN[t.name] || "Other";
    if (!grouped.has(domain)) grouped.set(domain, []);
    grouped.get(domain).push(t);
  }

  const domainOrder = [
    "Core & tenancy",
    "CRM & catalog",
    "Inventory",
    "Documents (legacy)",
    "Documents (unified engine)",
    "Billing & payments",
    "Payroll",
    "Finance",
    "Operations",
    "Analytics & tracking",
    "Messaging",
    "Growth",
    "Affiliates",
    "Drafts",
    "Admin & audit",
    "Platform",
    "Other",
  ];

  let body = "";
  for (const domain of domainOrder) {
    const list = grouped.get(domain);
    if (!list?.length) continue;
    body += `<h2>${escapeHtml(domain)}</h2>\n`;
    for (const table of list) {
      body += `<h3>public.${escapeHtml(table.name)}</h3>\n<table><thead><tr><th>Column</th><th>Type</th><th>Constraints / FK</th></tr></thead><tbody>\n`;
      for (const col of table.columns) {
        body += `<tr><td><code>${escapeHtml(col.name)}</code></td><td>${escapeHtml(col.type)}</td><td>${escapeHtml(col.constraints || "—")}</td></tr>\n`;
      }
      body += `</tbody></table>\n`;
    }
  }

  const generated = new Date().toISOString().slice(0, 10);
  const tableCount = tables.size;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Paidly Database Structure</title>
  <style>
    @page { margin: 18mm 14mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 10px; color: #1a1a1a; line-height: 1.4; }
    h1 { font-size: 22px; margin: 0 0 6px; color: #0f172a; }
    .meta { color: #64748b; margin-bottom: 20px; font-size: 11px; }
    h2 { font-size: 14px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #3b82f6; color: #1e40af; page-break-after: avoid; }
    h3 { font-size: 11px; margin: 14px 0 6px; color: #334155; font-family: ui-monospace, monospace; page-break-after: avoid; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; page-break-inside: avoid; }
    th { background: #f1f5f9; text-align: left; padding: 5px 6px; border: 1px solid #e2e8f0; font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; }
    td { padding: 4px 6px; border: 1px solid #e2e8f0; vertical-align: top; word-break: break-word; }
    tr:nth-child(even) td { background: #f8fafc; }
    code { font-size: 9px; background: #e2e8f0; padding: 1px 4px; border-radius: 3px; }
    .legend { background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px 12px; border-radius: 6px; margin-bottom: 16px; font-size: 10px; }
  </style>
</head>
<body>
  <h1>Paidly — Database Structure</h1>
  <p class="meta">Generated ${generated} · PostgreSQL (Supabase) · ${tableCount} public tables · Source: <code>supabase/schema.postgres.sql</code> + migrations</p>
  <div class="legend">
    <strong>Scope:</strong> Application tables in <code>public</code> schema. Auth users live in <code>auth.users</code> (Supabase managed).
    Row Level Security (RLS) is enabled on user/org data; admin bypass uses <code>public.is_admin()</code> from JWT <code>app_metadata.role</code>.
  </div>
  ${body}
</body>
</html>`;
}

async function main() {
  const sql = readSqlFiles();
  const tables = parseTables(sql);
  const html = buildHtml(tables);
  fs.mkdirSync(path.dirname(outPdf), { recursive: true });
  fs.writeFileSync(outHtml, html);

  const browser = await chromium.launch({ headless: true });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: outPdf,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" },
  });
  await browser.close();

  console.log(`Wrote ${outPdf} (${tables.size} tables)`);
  console.log(`HTML preview: ${outHtml}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
