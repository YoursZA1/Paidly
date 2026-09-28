/**
 * enforce_commercial_document_issuer() is the BEFORE INSERT/UPDATE trigger on BOTH invoices and quotes.
 * It used to read NEW.source_quote_id behind `TG_TABLE_NAME = 'invoices' AND …`; PL/pgSQL plans the whole
 * expression (no short-circuit), and quotes has no such column, so every quote INSERT failed with
 * `record "new" has no field "source_quote_id"` (fixed in 20260928130000_fix_commercial_issuer_quote_insert.sql).
 *
 * Runs on the real schema (every migration replayed on PGlite) as the signed-in owner through RLS.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";

const OWNER = "d0000000-0000-4000-8000-000000000001";
const OTHER_OWNER = "d0000000-0000-4000-8000-000000000002";

let db;
let org;
let otherOrg;
let brand;
let otherBrand;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = (sql, params) => runAs(db, OWNER, sql, params);

async function signUpWithPlan(id, email) {
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{"org_name":"Co"}')`, [id, email]);
  const [{ id: orgId }] = await q(`select id from public.organizations where owner_id = $1`, [id]);
  await q(
    `insert into public.subscriptions (user_id, email, company_id, created_by, status, plan, current_plan, plan_slug,
       plan_family, amount, currency, billing_cycle, current_period_end)
     values ($1, $2, $3, $1, 'active', 'growth', 'growth', 'growth_monthly', 'growth', 0, 'ZAR', 'monthly',
       now() + interval '30 days')`,
    [id, email, orgId]
  );
  return orgId;
}

beforeAll(async () => {
  db = await replaySupabaseSchema();
  org = await signUpWithPlan(OWNER, "owner@issuer.test");
  otherOrg = await signUpWithPlan(OTHER_OWNER, "owner@other.test");
  [{ id: brand }] = await q(`insert into public.companies (org_id, name) values ($1, 'Brand One') returning id`, [org]);
  [{ id: otherBrand }] = await q(`insert into public.companies (org_id, name) values ($1, 'Not Yours') returning id`, [
    otherOrg,
  ]);
}, 120_000);

describe("commercial document issuer trigger", () => {
  let quoteId;

  it("quote INSERT succeeds and keeps its own-org brand", async () => {
    const r = await as(
      `insert into public.quotes (org_id, quote_number, status, total_amount, user_id, created_by, company_id,
         owner_company_name, owner_email, owner_currency, document_brand_primary)
       values ($1, 'Q-1', 'draft', 500, auth.uid(), auth.uid(), $2, 'Issuer Ltd', 'billing@issuer.test', 'ZAR', '#123456')
       returning id, company_id`,
      [org, brand]
    );
    expect(r.ok, r.message).toBe(true);
    expect(r.rows[0].company_id).toBe(brand);
    quoteId = r.rows[0].id;
  });

  it("quote with another org's brand id has it cleared (spoofed company_id)", async () => {
    const r = await as(
      `insert into public.quotes (org_id, quote_number, status, total_amount, user_id, created_by, company_id)
       values ($1, 'Q-2', 'draft', 1, auth.uid(), auth.uid(), $2) returning company_id`,
      [org, otherBrand]
    );
    expect(r.ok, r.message).toBe(true);
    expect(r.rows[0].company_id).toBeNull();
  });

  it("quote UPDATE of company_id / org_id fires the trigger without error", async () => {
    const r = await as(`update public.quotes set company_id = $2 where id = $1 returning company_id`, [quoteId, null]);
    expect(r.ok, r.message).toBe(true);
    const back = await as(`update public.quotes set company_id = $2 where id = $1 returning company_id`, [quoteId, brand]);
    expect(back.rows[0].company_id).toBe(brand);
  });

  it("plain invoice INSERT succeeds", async () => {
    const r = await as(
      `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by, company_id)
       values ($1, 'I-1', 'draft', 10, auth.uid(), auth.uid(), $2) returning company_id`,
      [org, brand]
    );
    expect(r.ok, r.message).toBe(true);
    expect(r.rows[0].company_id).toBe(brand);
  });

  it("invoice with source_quote_id inherits the quote's issuer fields when its own are blank", async () => {
    const r = await as(
      `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by,
         source_quote_id, owner_company_name)
       values ($1, 'I-2', 'draft', 500, auth.uid(), auth.uid(), $2, '  ')
       returning company_id, owner_company_name, owner_email, owner_currency, document_brand_primary`,
      [org, quoteId]
    );
    expect(r.ok, r.message).toBe(true);
    expect(r.rows[0]).toEqual({
      company_id: brand,
      owner_company_name: "Issuer Ltd",
      owner_email: "billing@issuer.test",
      owner_currency: "ZAR",
      document_brand_primary: "#123456",
    });
  });

  /** Fresh quote (one invoice per quote: idx_invoices_source_quote_id). */
  const newQuote = async (number) => {
    const r = await as(
      `insert into public.quotes (org_id, quote_number, status, total_amount, user_id, created_by, company_id,
         owner_company_name, owner_email)
       values ($1, $2, 'sent', 500, auth.uid(), auth.uid(), $3, 'Issuer Ltd', 'billing@issuer.test') returning id`,
      [org, number, brand]
    );
    expect(r.ok, r.message).toBe(true);
    return r.rows[0].id;
  };

  it("the invoice's own issuer fields win over the quote's", async () => {
    const sourceQuote = await newQuote("Q-3");
    const r = await as(
      `insert into public.invoices (org_id, invoice_number, status, total_amount, user_id, created_by,
         source_quote_id, owner_company_name)
       values ($1, 'I-3', 'draft', 500, auth.uid(), auth.uid(), $2, 'Override Pty')
       returning owner_company_name, owner_email`,
      [org, sourceQuote]
    );
    expect(r.ok, r.message).toBe(true);
    expect(r.rows[0]).toEqual({ owner_company_name: "Override Pty", owner_email: "billing@issuer.test" });
  });

  it("convert_quote_to_invoice works end to end on a quote created by INSERT", async () => {
    const fresh = await newQuote("Q-4");
    const r = await as(`select public.convert_quote_to_invoice($1, '{}'::jsonb) as res`, [fresh]);
    expect(r.ok, r.message).toBe(true);
    const [{ status }] = await q(`select status from public.quotes where id = $1`, [fresh]);
    expect(status).toBe("converted");
    const [inv] = await q(`select company_id, owner_company_name from public.invoices where source_quote_id = $1`, [fresh]);
    expect(inv).toEqual({ company_id: brand, owner_company_name: "Issuer Ltd" });
  });
});
