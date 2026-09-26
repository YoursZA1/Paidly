import { formatCurrency } from "@/utils/currencyCalculations";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Print the pre-payment bill for a table (not a receipt — receipts come from each paid sale).
 * Opens a small print window; returns false when the browser blocks it.
 */
export function printTabBill(bundle, { brandName = "", currency = "ZAR" } = {}) {
  const tab = bundle?.tab;
  if (!tab) return false;
  const money = (v) => esc(formatCurrency(v, currency));
  const rows = (bundle.items || [])
    .filter((i) => i.status !== "void")
    .map((i) => `<tr><td>${esc(i.quantity)} × ${esc(i.name)}</td><td class="r">${money(i.line_total)}</td></tr>`)
    .join("");
  const t = tab.totals;
  const b = tab.balance;
  const line = (label, value, cls = "") => `<tr class="${cls}"><td>${esc(label)}</td><td class="r">${money(value)}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bill ${esc(tab.label)}</title>
<style>body{font:13px/1.4 ui-monospace,Menlo,monospace;width:72mm;margin:0 auto;padding:8px}h1{font-size:15px;margin:0 0 4px;text-align:center}
p{margin:2px 0;text-align:center}table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:2px 0;vertical-align:top}.r{text-align:right;white-space:nowrap}
.t td{border-top:1px dashed #000;padding-top:4px;font-weight:bold;font-size:15px}.m{color:#444}</style></head><body>
<h1>${esc(brandName || "Bill")}</h1>
<p>${esc(tab.label)} · Order #${esc(tab.order_number)}</p>
<p class="m">${esc([tab.guests ? `${tab.guests} guests` : "", tab.server_name, new Date().toLocaleString()].filter(Boolean).join(" · "))}</p>
<table>${rows}
${line("Subtotal", t.subtotal)}
${t.discount_amount > 0 ? line("Discount", -t.discount_amount) : ""}
${t.service_charge > 0 ? line(`Service charge (${tab.service_charge_rate}%)`, t.service_charge) : ""}
${line("Total", t.total, "t")}
${b.paid > 0 ? line("Paid", -b.paid) + line("Due", b.due, "t") : ""}
</table>
<p class="m" style="margin-top:10px">This is a bill, not a tax invoice or receipt.</p>
<script>window.onload=function(){window.print();}</script></body></html>`;
  const w = window.open("", "paidly_bill", "width=420,height=640");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
