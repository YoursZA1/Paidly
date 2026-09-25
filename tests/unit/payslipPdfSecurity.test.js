/**
 * Payslip PDF security (delivery layer). Every payslip PDF — download, portal, public link, email,
 * historical — is AES-256 encrypted with the employee's SA ID number as the opening password.
 *
 * PDFs are opened with an independent reader (Mozilla PDF.js), not the library that wrote them.
 * The in-memory database, console and email transport are scanned for the ID number afterwards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const { memory, tables, mail } = vi.hoisted(() => {
  const tables = {};
  const mail = { sent: [] };
  const memory = {
    rpc: async () => ({ data: null, error: { message: "function does not exist" } }),
    storage: {
      from() {
        throw new Error("Storage must not be used for payslip PDFs");
      },
    },
    from(table) {
      tables[table] ||= [];
      const st = { action: "select", payload: null, filters: [] };
      const run = () => {
        if (st.action === "insert") {
          const rows = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p) => ({ id: randomUUID(), ...p }));
          tables[table].push(...rows);
          return rows;
        }
        const rows = tables[table].filter((r) => st.filters.every((f) => f(r)));
        if (st.action === "update") rows.forEach((r) => Object.assign(r, st.payload));
        return rows;
      };
      const api = {
        select: () => api,
        insert: (p) => ((st.action = "insert"), (st.payload = p), api),
        update: (p) => ((st.action = "update"), (st.payload = p), api),
        eq: (c, v) => (st.filters.push((r) => String(r[c] ?? "") === String(v ?? "")), api),
        in: (c, v) => (st.filters.push((r) => (v || []).map(String).includes(String(r[c]))), api),
        is: (c, v) => (st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)), api),
        order: () => api,
        limit: () => api,
        or: () => api,
        maybeSingle: async () => ({ data: run()[0] || null, error: null }),
        single: async () => ({ data: run()[0] || null, error: null }),
        then: (res, rej) => Promise.resolve({ data: run(), error: null }).then(res, rej),
      };
      return api;
    },
  };
  return { memory, tables, mail };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: () => memory }));
vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: memory }));
vi.mock("../../server/src/sendInvoice.js", () => ({
  sendHtmlEmail: async (to, subject, html, from, opts) => {
    mail.sent.push({ to, subject, html, opts });
    return { success: true };
  },
}));
vi.mock("../../server/src/supabaseAuth.js", () => ({
  getUserFromRequest: async (req) => {
    const id = String(req.headers?.["x-test-user"] || "");
    return id ? { user: { id } } : { user: null, error: "Unauthorized" };
  },
}));
vi.mock("../../server/src/featureGate.js", () => ({
  assertUserHasFeature: async () => true,
  UpgradeRequiredError: class extends Error {},
}));
vi.mock("../../server/src/companyRouteAccess.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    loadCompanyMembership: async (_sb, userId) => tables.__memberships?.[userId] || null,
  };
});
vi.mock("../../server/src/payroll/payrollEmployeeLimit.js", () => ({
  assertPayrollEmployeeCapacity: async () => {},
  payrollEmployeeCapacity: async () => ({ allowed: true }),
}));
vi.mock("../../server/src/workforce/adjustmentSignals.js", () => ({ loadOutstandingAdjustmentSignals: async () => ({ signals: [] }) }));

import {
  buildSecurePayslipPdf,
  payslipPdfPassword,
  PAYSLIP_ID_REQUIRED,
  PAYSLIP_ID_REQUIRED_MESSAGE,
  renderEncryptedPayslipPdf,
} from "../../server/src/payroll/payslipPdf.js";
import { isValidSaIdNumber, normalizeSaIdNumber } from "@shared/payroll/saIdNumber.js";
import { calculatePayroll, selectStatutoryRules } from "@shared/payroll/calculatePayroll.js";
import { generateSecurePayslipPdf, sendEmployeePayslip, sendPayRunPayslips } from "../../server/src/payroll/payrollService.js";
import { handlePayrollRoute } from "../../server/src/payroll/payrollRoutes.js";
import { handlePublicPayslipPdf, signPublicPayslipViewerToken } from "../../api/_publicPayslipShared.js";
import { isEncryptedPdf, sendPayslipEmail } from "../../server/src/documents/documentSendAdapter.js";
import { shippedRules } from "./fixtures/shippedPayrollRules.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const ID_A = "8501015800088"; // Test Employee (brief §32)
const ID_B = "9001015009086";
const SHARE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

async function openPdf(buf, password) {
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), password, verbosity: 0, isEvalSupported: false }).promise;
    const page = await doc.getPage(1);
    const text = (await page.getTextContent()).items.map((i) => i.str).join(" ");
    const permissions = await doc.getPermissions();
    return { ok: true, text, permissions };
  } catch (err) {
    return { ok: false, error: err?.name || String(err) };
  }
}

function payslipRow(overrides = {}) {
  const r = calculatePayroll({
    profile: { base_salary: 12000 },
    statutoryRules: selectStatutoryRules(shippedRules(), "2026-09-25"),
    context: { payDate: "2026-09-25" },
  });
  return {
    id: randomUUID(),
    org_id: ORG,
    payroll_profile_id: "p-a",
    membership_id: "m-a",
    employee_user_id: "user-a",
    payslip_number: "PS-2026-09-EMP-001",
    employee_name: "Test Employee",
    employee_id: "EMP-001",
    employee_email: "test.employee@example.com",
    position: "Developer",
    pay_period_start: "2026-09-01",
    pay_period_end: "2026-09-30",
    pay_date: "2026-09-25",
    basic_salary: r.basic,
    allowances: [],
    gross_pay: r.gross_pay,
    tax_deduction: r.tax_deduction,
    uif_deduction: r.uif_deduction,
    other_deductions: [],
    total_deductions: r.total_deductions,
    net_pay: r.net_pay,
    calculation_breakdown: r.breakdown,
    tax_year: r.tax_year,
    ytd: { gross: 84000, taxable: 84000, paye: 4725, uif: 840, other_deductions: 0, net: 78435 },
    employer_contributions: r.employer_contributions,
    employer_snapshot: { company_name: "Paidly Test (Pty) Ltd", paye_reference: "7000000000" },
    employee_snapshot: { id_number_masked: "••••••0088" },
    public_share_token: SHARE,
    sent_to_email: "test.employee@example.com",
    locked: true,
    status: "published",
    ...overrides,
  };
}

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v);
  res.json = (b) => ((res.body = b), res);
  res.send = (b) => ((res.body = b), res);
  res.end = () => res;
  return res;
}

let logSpies = [];
beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  mail.sent.length = 0;
  tables.payroll_profiles = [
    { id: "p-a", org_id: ORG, membership_id: "m-a", employee_number: "EMP-001", tax_identifiers: { id_number: "850101 5800 088" } },
    { id: "p-b", org_id: ORG, membership_id: "m-b", employee_number: "EMP-002", tax_identifiers: { id_number: ID_B } },
    { id: "p-none", org_id: ORG, membership_id: "m-none", employee_number: "EMP-003", tax_identifiers: {} },
  ];
  tables.payslips = [payslipRow()];
  tables.__memberships = {
    "user-admin": { id: "m-admin", companyId: ORG, orgId: ORG, companyRole: "admin", membershipRole: "admin" },
    "user-a": { id: "m-a", companyId: ORG, orgId: ORG, companyRole: "employee", membershipRole: "employee" },
    "user-b": { id: "m-b", companyId: ORG, orgId: ORG, companyRole: "employee", membershipRole: "employee" },
  };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.CLIENT_PORTAL_JWT_SECRET = "portal-secret";
  process.env.RESEND_API_KEY = "re_test";
  logSpies = ["log", "info", "warn", "error", "debug"].map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => vi.restoreAllMocks());

/** Everything the app wrote or logged, as one string — must never contain the ID number. */
function persistedAndLogged() {
  const { payroll_profiles: _source, __memberships: _m, ...written } = tables; // the profile is the source of truth
  return [
    JSON.stringify(written),
    JSON.stringify(logSpies.flatMap((s) => s.mock.calls)),
    JSON.stringify(mail.sent.map((m) => ({ ...m, opts: { ...m.opts, attachments: undefined } }))),
  ].join("\n");
}

describe("§32 regression — Test Employee, ID 8501015800088", () => {
  it("without password FAIL · correct password OPEN · wrong password FAIL; nothing persisted or logged", async () => {
    const { content } = await buildSecurePayslipPdf(tables.payslips[0], tables.payroll_profiles[0]);
    expect(await openPdf(content)).toMatchObject({ ok: false, error: "PasswordException" });
    const opened = await openPdf(content, ID_A);
    expect(opened.ok).toBe(true);
    expect(opened.text).toMatch(/Test Employee/);
    expect(opened.text).toMatch(/R 11 205,00/); // the finalized net pay, unchanged by delivery
    expect(await openPdf(content, "8501015800089")).toMatchObject({ ok: false, error: "PasswordException" });
    expect(persistedAndLogged()).not.toContain(ID_A);
    expect(opened.text).not.toContain(ID_A); // not printed on the payslip either
  });
});

describe("§31 encryption", () => {
  it("1 / 2 — real PDF encryption (AES-256), no readable payroll text in the file", async () => {
    const { content } = await buildSecurePayslipPdf(tables.payslips[0], tables.payroll_profiles[0]);
    const raw = content.toString("latin1");
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).toContain("/Encrypt");
    expect(raw).toContain("/AESV3");
    expect(raw).not.toContain("11 205");
    expect(raw).not.toContain("Test Employee");
    expect(isEncryptedPdf(content)).toBe(true);
    expect((await openPdf(content)).ok).toBe(false);
  });

  it("printing allowed; copying and editing not", async () => {
    const { content } = await buildSecurePayslipPdf(tables.payslips[0], tables.payroll_profiles[0]);
    const { permissions } = await openPdf(content, ID_A);
    const P = pdfjs.PermissionFlag;
    expect(permissions).toContain(P.PRINT_HIGH_QUALITY);
    expect(permissions).not.toContain(P.COPY);
    expect(permissions).not.toContain(P.MODIFY_CONTENTS);
    expect(permissions).not.toContain(P.MODIFY_ANNOTATIONS);
    expect(permissions).not.toContain(P.ASSEMBLE);
  });

  it("3 / 4 / 5 / 6 — only this employee's ID opens it; B's ID, the employee number and look-alikes do not", async () => {
    const { content } = await buildSecurePayslipPdf(tables.payslips[0], tables.payroll_profiles[0]);
    expect((await openPdf(content, ID_A)).ok).toBe(true);
    for (const wrong of [ID_B, "EMP-001", "PS-2026-09-EMP-001", ORG, "850101 5800 088", ""]) {
      expect((await openPdf(content, wrong)).ok).toBe(false);
    }
    const slipB = payslipRow({ payroll_profile_id: "p-b", membership_id: "m-b", employee_name: "Employee B" });
    const b = await buildSecurePayslipPdf(slipB, tables.payroll_profiles[1]);
    expect((await openPdf(b.content, ID_A)).ok).toBe(false);
    expect((await openPdf(b.content, ID_B)).ok).toBe(true);
  });

  it("7 — missing or invalid ID number: no PDF at all, administrator message", async () => {
    for (const profile of [tables.payroll_profiles[2], { tax_identifiers: { id_number: "8501015800089" } }, { tax_identifiers: { id_number: "12345" } }, {}]) {
      await expect(buildSecurePayslipPdf(tables.payslips[0], profile)).rejects.toMatchObject({
        code: PAYSLIP_ID_REQUIRED,
        status: 422,
        message: PAYSLIP_ID_REQUIRED_MESSAGE,
      });
    }
    expect(PAYSLIP_ID_REQUIRED_MESSAGE).toBe("Employee ID number is required before a secure payslip can be generated.");
    await expect(renderEncryptedPayslipPdf(tables.payslips[0], {})).rejects.toMatchObject({ code: PAYSLIP_ID_REQUIRED });
  });

  it("8 — formatted IDs are normalised (spaces, dashes)", () => {
    expect(normalizeSaIdNumber("850101 5800 088")).toBe(ID_A);
    expect(normalizeSaIdNumber("850101-5800-088")).toBe(ID_A);
    expect(payslipPdfPassword({ tax_identifiers: { id_number: " 850101 5800 088 " } })).toBe(ID_A);
    expect(isValidSaIdNumber(ID_A)).toBe(true);
    expect(isValidSaIdNumber("8513015800088")).toBe(false); // month 13
  });
});

describe("§31 delivery paths", () => {
  const route = async (userId, id, route = "payslip-pdf") => {
    const res = mockRes();
    await handlePayrollRoute({ method: "GET", headers: { "x-test-user": userId }, query: {} }, res, { route, id });
    return res;
  };

  it("13 / 12 — admin download and the employee's own (portal) download are encrypted; another employee gets 404", async () => {
    const slipId = tables.payslips[0].id;
    const admin = await route("user-admin", slipId);
    expect(admin.statusCode).toBe(200);
    expect(admin.headers["content-type"]).toBe("application/pdf");
    expect(admin.headers["cache-control"]).toMatch(/no-store/);
    expect((await openPdf(admin.body)).ok).toBe(false);
    expect((await openPdf(admin.body, ID_A)).ok).toBe(true);

    const own = await route("user-a", slipId);
    expect(own.statusCode).toBe(200);
    expect((await openPdf(own.body)).ok).toBe(false);
    expect((await openPdf(own.body, ID_A)).ok).toBe(true);

    const other = await route("user-b", slipId);
    expect(other.statusCode).toBe(404);
    expect(persistedAndLogged()).not.toContain(ID_A);
  });

  it("missing ID on download → 422 with the administrator message, nothing served", async () => {
    tables.payslips.push(payslipRow({ id: "e2d0c6a0-1111-4111-8111-000000000003", payroll_profile_id: "p-none", membership_id: "m-none" }));
    const res = await route("user-admin", "e2d0c6a0-1111-4111-8111-000000000003");
    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({ code: PAYSLIP_ID_REQUIRED, error: PAYSLIP_ID_REQUIRED_MESSAGE });
    expect(tables.payroll_audit_logs.at(-1)).toMatchObject({
      action: "PAYSLIP_PDF_BLOCKED",
      metadata: { status: "failure", reason: PAYSLIP_ID_REQUIRED, delivery_method: "download" },
    });
  });

  it("11 — email attachment is encrypted; the body explains the password without revealing it", async () => {
    await sendEmployeePayslip(ORG, "user-admin", tables.payslips[0].id, "https://www.paidly.co.za");
    expect(mail.sent).toHaveLength(1);
    const [m] = mail.sent;
    const [att] = m.opts.attachments;
    expect(att.filename).toBe("PS-2026-09-EMP-001.pdf");
    expect((await openPdf(att.content)).ok).toBe(false);
    expect((await openPdf(att.content, ID_A)).ok).toBe(true);
    expect(m.html).toMatch(/password protected/);
    expect(m.html).toMatch(/South African ID number/);
    expect(m.html).not.toContain(ID_A);
    expect(m.html).not.toContain("5800");
    expect(persistedAndLogged()).not.toContain(ID_A);
  });

  it("bulk send: each PDF separately encrypted with its own employee's ID; a missing ID blocks that email only", async () => {
    tables.pay_runs = [{ id: "run-1", org_id: ORG, finalized_at: "2026-09-25T10:00:00Z", status: "approved", period_label: "September 2026" }];
    tables.pay_run_items = [];
    tables.payslips = [
      payslipRow({ pay_run_id: "run-1" }),
      payslipRow({ pay_run_id: "run-1", payroll_profile_id: "p-b", membership_id: "m-b", employee_email: "b@example.com", employee_name: "Employee B" }),
      payslipRow({ pay_run_id: "run-1", payroll_profile_id: "p-none", membership_id: "m-none", employee_email: "none@example.com" }),
    ];
    const result = await sendPayRunPayslips(ORG, "user-admin", "run-1", "https://www.paidly.co.za", { resend: true });
    expect(result).toMatchObject({ sent: 2, failed: 1 });
    expect(result.blocked_message).toBe(PAYSLIP_ID_REQUIRED_MESSAGE);
    const byTo = Object.fromEntries(mail.sent.map((m) => [m.to, m.opts.attachments[0].content]));
    expect((await openPdf(byTo["test.employee@example.com"], ID_A)).ok).toBe(true);
    expect((await openPdf(byTo["test.employee@example.com"], ID_B)).ok).toBe(false);
    expect((await openPdf(byTo["b@example.com"], ID_B)).ok).toBe(true);
    expect(byTo["none@example.com"]).toBeUndefined(); // never sent unprotected
    expect(persistedAndLogged()).not.toContain(ID_A);
    expect(persistedAndLogged()).not.toContain(ID_B);
  });

  it("the email adapter refuses an unencrypted PDF attachment", async () => {
    const plain = Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF");
    await expect(
      sendPayslipEmail({ to: "x@example.com", shareToken: SHARE, origin: "https://x", attachment: { filename: "p.pdf", content: plain } })
    ).rejects.toThrow(/unencrypted/);
    expect(mail.sent).toHaveLength(0);
  });

  it("16 — the share-link download still requires verification and returns an encrypted file", async () => {
    const req = (auth) => ({ method: "GET", query: { token: SHARE }, headers: auth ? { authorization: `Bearer ${auth}` } : {} });
    const anon = mockRes();
    await handlePublicPayslipPdf(req(null), anon);
    expect(anon.statusCode).toBe(401); // link alone is not enough
    const verified = mockRes();
    await handlePublicPayslipPdf(req(signPublicPayslipViewerToken(SHARE, "test.employee@example.com")), verified);
    expect(verified.statusCode).toBe(200);
    expect((await openPdf(verified.body)).ok).toBe(false); // the URL does not unlock the document
    expect((await openPdf(verified.body, ID_A)).ok).toBe(true);
    expect(persistedAndLogged()).not.toContain(ID_A);
  });

  it("14 — a historical payslip (issued before YTD / tax year / breakdown existed) is still encrypted", async () => {
    const legacy = payslipRow({
      calculation_breakdown: null,
      ytd: null,
      tax_year: null,
      employer_contributions: null,
      allowances: [{ name: "Travel allowance", amount: 500 }],
      gross_pay: 12500,
      net_pay: 11705,
      pay_date: "2025-06-25",
    });
    const { content } = await buildSecurePayslipPdf(legacy, tables.payroll_profiles[0]);
    expect((await openPdf(content)).ok).toBe(false);
    const opened = await openPdf(content, ID_A);
    expect(opened.ok).toBe(true);
    expect(opened.text).toMatch(/Travel allowance/);
    expect(opened.text).toMatch(/R 11 705,00/);
  });

  it("audit entries are safe metadata only", async () => {
    await generateSecurePayslipPdf(ORG, tables.payslips[0].id, { deliveryMethod: "download", actorId: "user-admin" });
    const entry = tables.payroll_audit_logs.at(-1);
    expect(entry).toMatchObject({
      org_id: ORG,
      actor_id: "user-admin",
      action: "PAYSLIP_PDF_GENERATED",
      record_id: tables.payslips[0].id,
      metadata: { payslip_id: tables.payslips[0].id, employee_id: "m-a", delivery_method: "download", status: "success" },
    });
    expect(Object.keys(entry.metadata).sort()).toEqual(["delivery_method", "employee_id", "payslip_id", "status"]);
    expect(JSON.stringify(tables.payroll_audit_logs)).not.toContain(ID_A);
  });

  it("9 / 10 — generation, download and email never write the ID/password to the database or logs", async () => {
    await route("user-admin", tables.payslips[0].id);
    await sendEmployeePayslip(ORG, "user-admin", tables.payslips[0].id, "https://www.paidly.co.za");
    const everything = persistedAndLogged();
    expect(everything).not.toContain(ID_A);
    expect(everything).not.toContain("8501015800");
    // The issued payslip keeps only the masked form.
    expect(JSON.stringify(tables.payslips)).toContain("0088");
    expect(JSON.stringify(tables.payslips)).not.toContain("850101");
  });
});

describe("15 — storage and the browser", () => {
  const SRC = (f) => readFileSync(path.resolve(__dirname, "../..", f), "utf8");

  it("no payslip PDF is uploaded or given a public URL (storage is never touched in delivery)", async () => {
    // memory.storage.from throws — every delivery test above would have failed if storage were used.
    const { UPLOAD_BUCKET_ALLOWLIST } = await import("../../src/utils/inputSanitization.js");
    expect(UPLOAD_BUCKET_ALLOWLIST.has("payroll")).toBe(false);
    for (const f of ["server/src/payroll/payslipPdf.js", "server/src/payroll/payrollService.js", "api/_publicPayslipShared.js"]) {
      expect(SRC(f)).not.toMatch(/\.storage\b|getPublicUrl|createSignedUrl/);
    }
  });

  it("the browser cannot build a payslip PDF (it would be unencrypted)", async () => {
    const { generatePayslipPDF } = await import("../../src/document-engine/pdf/payslip.jsx");
    await expect(generatePayslipPDF({ payslip: tables.payslips[0] })).rejects.toThrow(/generated securely on the server/);
    const page = SRC("src/pages/PayslipPDF.jsx");
    expect(page).not.toMatch(/generatePdfFromElement|window\.print\(\)/);
    expect(page).toMatch(/downloadPayslipPdf|fetchPublicPayslipPdf/);
  });

  it("the PDF module never logs", () => {
    expect(SRC("server/src/payroll/payslipPdf.js")).not.toMatch(/console\.|logSecurity|writePayrollAudit/);
  });
});
