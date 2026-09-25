/**
 * Payslip PDF — document-delivery layer. Draws the FINALIZED payslip row (never recalculates payroll)
 * and encrypts it with the employee's SA ID number as the opening password.
 *
 * Security rules (do not relax):
 *  - The password exists only in memory for the duration of one render. It is never logged, stored,
 *    returned, put in an audit/event, or printed on the payslip.
 *  - No valid ID number → no PDF at all (never an unprotected fallback).
 *  - AES-256 (PDF 1.7 ext 3). Printing allowed; copying, editing, annotating and page assembly are not.
 *    The owner password is random per file and discarded.
 */
import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import { buildPayslipView, PAY_TYPE_LABELS } from "../../../shared/payroll/payslipView.js";
import { resolvePayslipEmployerDisplay } from "../../../shared/payroll/employerSnapshot.js";
import { employeeIdNumberOf, isValidSaIdNumber, normalizeSaIdNumber } from "../../../shared/payroll/saIdNumber.js";

export const PAYSLIP_ID_REQUIRED = "PAYSLIP_ID_REQUIRED";
export const PAYSLIP_ID_REQUIRED_MESSAGE = "Employee ID number is required before a secure payslip can be generated.";

export const PAYSLIP_PDF_PERMISSIONS = Object.freeze({
  printing: "highResolution",
  modifying: false,
  copying: false,
  annotating: false,
  fillingForms: false,
  contentAccessibility: true,
  documentAssembly: false,
});

/**
 * Opening password for an employee's payslips: their normalised, valid SA ID number.
 * Throws (422, PAYSLIP_ID_REQUIRED) when missing or invalid — the message never contains the value.
 * @param {Record<string, any>} profile payroll_profiles row (tax_identifiers)
 */
export function payslipPdfPassword(profile) {
  const raw = employeeIdNumberOf(profile);
  if (!raw || !isValidSaIdNumber(raw)) {
    const err = new Error(PAYSLIP_ID_REQUIRED_MESSAGE);
    err.status = 422;
    err.code = PAYSLIP_ID_REQUIRED;
    throw err;
  }
  return normalizeSaIdNumber(raw);
}

// ── Formatting (WinAnsi-safe for the standard PDF fonts) ─────────────────────────────────
const ORANGE = "#f24e00";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

function pdfText(value) {
  return String(value ?? "")
    .replace(/[\u00a0\u202f\u2009]/g, " ") // Intl uses (narrow) no-break spaces
    .replace(/\u2212/g, "-")
    .replace(/[^\t\n\r\x20-\x7e\u00a1-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]/g, "");
}

export function formatRand(amount) {
  const n = Number(amount);
  return pdfText(
    new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number.isFinite(n) ? n : 0
    )
  );
}

function displayDate(iso) {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m, d] = s.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d, 12))
  );
}

// ── Drawing ──────────────────────────────────────────────────────────────────────────────
function moneyTable(doc, { x, y, w, title, rows, totalLabel, total }) {
  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text(title.toUpperCase(), x, y, { width: w, characterSpacing: 0.4 });
  let cy = y + 14;
  for (const row of rows) {
    doc.font("Helvetica").fontSize(9).fillColor(INK);
    const labelH = doc.heightOfString(pdfText(row.label), { width: w - 95 });
    doc.text(pdfText(row.label), x, cy, { width: w - 95 });
    doc.text(formatRand(row.amount), x + w - 95, cy, { width: 95, align: "right" });
    cy += Math.max(labelH, 11);
    if (row.detail) {
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(pdfText(row.detail), x, cy, { width: w - 95 });
      cy += 10;
    }
    cy += 3;
    doc.moveTo(x, cy).lineTo(x + w, cy).lineWidth(0.5).strokeColor(LINE).stroke();
    cy += 4;
  }
  if (totalLabel) {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK);
    doc.text(pdfText(totalLabel), x, cy + 1, { width: w - 95 });
    doc.text(formatRand(total), x + w - 95, cy + 1, { width: 95, align: "right" });
    cy += 16;
  }
  return cy;
}

function field(doc, x, y, w, label, value) {
  if (value == null || String(value).trim() === "") return false;
  doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(label.toUpperCase(), x, y, { width: w, characterSpacing: 0.3 });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(pdfText(value), x, y + 9, { width: w });
  return true;
}

/**
 * Render a finalized payslip to an ENCRYPTED PDF buffer.
 * @param {Record<string, any>} payslip payslips row (finalized values)
 * @param {{ password: string }} security from payslipPdfPassword()
 * @returns {Promise<Buffer>}
 */
export function renderEncryptedPayslipPdf(payslip, { password } = {}) {
  if (!password || !/^\d{13}$/.test(String(password))) {
    const err = new Error(PAYSLIP_ID_REQUIRED_MESSAGE);
    err.status = 422;
    err.code = PAYSLIP_ID_REQUIRED;
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      pdfVersion: "1.7ext3", // AES-256
      userPassword: String(password),
      ownerPassword: crypto.randomBytes(32).toString("hex"),
      permissions: PAYSLIP_PDF_PERMISSIONS,
      info: {
        Title: `Payslip ${pdfText(payslip?.payslip_number || "")}`.trim(),
        Author: "Paidly",
        Subject: "Payslip",
        Creator: "Paidly payroll",
      },
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      const view = buildPayslipView(payslip || {}, { formatMoney: formatRand });
      const employer = resolvePayslipEmployerDisplay(payslip, null);
      const emp = payslip?.employee_snapshot && typeof payslip.employee_snapshot === "object" ? payslip.employee_snapshot : {};
      const left = 40;
      const width = doc.page.width - 80;

      // Header
      doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(pdfText(employer.company_name || "Employer"), left, 40, { width: width - 170 });
      let hy = doc.y + 1;
      if (employer.trading_name && employer.trading_name !== employer.company_name) {
        doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(`Trading as ${pdfText(employer.trading_name)}`, left, hy, { width: width - 170 });
        hy = doc.y;
      }
      if (employer.address) {
        doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(pdfText(employer.address), left, hy, { width: width - 170 });
        hy = doc.y;
      }
      const refs = [
        employer.paye_reference ? `PAYE ref ${employer.paye_reference}` : null,
        employer.uif_reference ? `UIF ref ${employer.uif_reference}` : null,
        employer.registration_number ? `Reg ${employer.registration_number}` : null,
        employer.email || null,
        employer.phone || null,
      ].filter(Boolean);
      if (refs.length) doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(pdfText(refs.join(" · ")), left, hy + 2, { width: width - 170 });
      const headerBottom = doc.y;
      doc.font("Helvetica-Bold").fontSize(20).fillColor(ORANGE).text("Payslip", left + width - 170, 38, { width: 170, align: "right" });
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(pdfText(payslip?.payslip_number || ""), left + width - 170, 64, { width: 170, align: "right" });
      if (view.taxYear) doc.fontSize(8).fillColor(MUTED).text(`Tax year ${view.taxYear}`, left + width - 170, 76, { width: 170, align: "right" });

      let y = Math.max(headerBottom, 92) + 10;
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.8).strokeColor(LINE).stroke();
      y += 12;

      // Employee card
      const period =
        payslip?.pay_period_start || payslip?.pay_period_end
          ? `${displayDate(payslip.pay_period_start)} – ${displayDate(payslip.pay_period_end)}`
          : "";
      const fields = [
        ["Employee", payslip?.employee_name],
        ["Employee no.", payslip?.employee_id],
        ["Occupation", payslip?.position],
        ["Department", payslip?.department],
        ["Pay type", PAY_TYPE_LABELS[view.payType] || null],
        ["Tax number", emp.tax_number],
        ["Pay period", period],
        ["Payment date", displayDate(payslip?.pay_date)],
        ["Start date", emp.employment_start_date ? displayDate(emp.employment_start_date) : null],
        ["UIF number", emp.uif_number],
        ["Paid to", emp.bank_account_masked ? [emp.bank_name, emp.bank_account_masked].filter(Boolean).join(" ") : null],
      ].filter(([, v]) => v != null && String(v).trim() !== "");
      const colW = width / 3;
      const cardTop = y;
      const rowsCount = Math.ceil(fields.length / 3);
      doc.roundedRect(left, cardTop, width, rowsCount * 28 + 14, 6).fillColor("#f8fafc").fill();
      fields.forEach(([label, value], i) => {
        field(doc, left + 12 + (i % 3) * colW, cardTop + 9 + Math.floor(i / 3) * 28, colW - 20, label, value);
      });
      y = cardTop + rowsCount * 28 + 26;

      // Earnings | Deductions
      const half = (width - 20) / 2;
      const eBottom = moneyTable(doc, { x: left, y, w: half, title: "Earnings", rows: view.earnings, totalLabel: "Gross pay", total: view.grossPay });
      const dBottom = moneyTable(doc, {
        x: left + half + 20,
        y,
        w: half,
        title: "Deductions",
        rows: view.deductions,
        totalLabel: "Total deductions",
        total: view.totalDeductions,
      });
      y = Math.max(eBottom, dBottom) + 4;
      if (view.fringeBenefits.length) {
        doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(
          pdfText(`Taxable benefits (not paid in cash): ${view.fringeBenefits.map((l) => `${l.label} ${formatRand(l.amount)}`).join(" · ")}`),
          left,
          y,
          { width }
        );
        y = doc.y + 4;
      }

      // Net pay banner
      y += 4;
      doc.roundedRect(left, y, width, 50, 8).fillColor(ORANGE).fill();
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff").text("NET PAY", left + 16, y + 12, { characterSpacing: 1 });
      if (payslip?.pay_date) doc.font("Helvetica").fontSize(8).text(`Paid ${displayDate(payslip.pay_date)}`, left + 16, y + 27);
      doc.font("Helvetica-Bold").fontSize(22).text(formatRand(view.netPay), left + width / 2, y + 13, { width: width / 2 - 16, align: "right" });
      y += 64;

      // YTD | Employer contributions
      if (view.ytd.length || view.employerContributions.length) {
        const yb = view.ytd.length
          ? moneyTable(doc, { x: left, y, w: half, title: `Year to date${view.taxYear ? ` · ${view.taxYear}` : ""}`, rows: view.ytd })
          : y;
        const cb = view.employerContributions.length
          ? moneyTable(doc, {
              x: left + half + 20,
              y,
              w: half,
              title: "Employer contributions",
              rows: view.employerContributions,
              totalLabel: "Total (not deducted from pay)",
              total: view.employerContributionsTotal,
            })
          : y;
        y = Math.max(yb, cb) + 8;
      }

      // Leave
      const leave = Array.isArray(payslip?.leave_summary) ? payslip.leave_summary : [];
      if (leave.length) {
        doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text("LEAVE (DAYS)", left, y, { characterSpacing: 0.4 });
        y += 14;
        const cols = [
          ["Type", 0, width * 0.46, "left"],
          ["Accrued", width * 0.46, width * 0.18, "right"],
          ["Taken", width * 0.64, width * 0.18, "right"],
          ["Balance", width * 0.82, width * 0.18, "right"],
        ];
        doc.font("Helvetica").fontSize(7).fillColor(MUTED);
        for (const [h, cx, cw, align] of cols) doc.text(h.toUpperCase(), left + cx, y, { width: cw, align });
        y += 11;
        for (const row of leave) {
          const vals = [row.name, row.accrued, row.used, row.available];
          doc.font("Helvetica").fontSize(9).fillColor(INK);
          cols.forEach(([, cx, cw, align], i) => doc.text(pdfText(vals[i] ?? "—"), left + cx, y, { width: cw, align }));
          y += 13;
        }
        y += 6;
      }

      // Footer (never mentions the password value)
      const footY = Math.max(y + 6, doc.page.height - 70);
      doc.moveTo(left, footY).lineTo(left + width, footY).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(
        pdfText(`Generated by Paidly from finalized payroll · ${payslip?.payslip_number || ""}. Confidential — this file is password protected.`),
        left,
        footY + 6,
        { width }
      );
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * The one entry point for delivery code: finalized payslip + its employee profile → encrypted PDF.
 * @returns {Promise<{ filename: string, content: Buffer }>}
 */
export async function buildSecurePayslipPdf(payslip, profile) {
  const password = payslipPdfPassword(profile);
  const content = await renderEncryptedPayslipPdf(payslip, { password });
  const safeNumber = String(payslip?.payslip_number || "payslip").replace(/[^A-Za-z0-9._-]/g, "_");
  return { filename: `${safeNumber}.pdf`, content };
}
