/**
 * Paidly-branded auth emails, email-verification gate and the once-only welcome email.
 *   - Supabase Auth templates (supabase/templates) are Paidly-branded, in sync with their generator,
 *     wired in config.toml, and link to /auth/verified with Supabase's token hash
 *   - POST /api/auth/welcome sends one email per verified business owner, ever (DB claim), to the
 *     caller's own address only
 *   - the API refuses unverified sessions (getUserFromRequest + business-data resolvers)
 *   - migration: backfills already-verified users; end users cannot reset the welcome marker
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const { tables, authUsers } = vi.hoisted(() => {
  const tables = {};
  const authUsers = {};
  return { tables, authUsers };
});

vi.mock("../../server/src/supabaseAdmin.js", () => {
  const from = (table) => {
    tables[table] ||= [];
    const st = { action: "select", payload: null, filters: [], limit: null };
    const run = () => {
      const rows = tables[table].filter((r) => st.filters.every((f) => f(r)));
      if (st.action === "update") {
        rows.forEach((r) => Object.assign(r, st.payload));
      }
      return st.limit != null ? rows.slice(0, st.limit) : rows;
    };
    const api = {
      select: () => api,
      update: (p) => ((st.action = "update"), (st.payload = p), api),
      eq: (c, v) => (st.filters.push((r) => String(r[c] ?? "") === String(v ?? "")), api),
      is: (c, v) => (st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)), api),
      limit: (n) => ((st.limit = n), api),
      // Postgres executes the conditional UPDATE atomically: model that with a synchronous run.
      maybeSingle: async () => ({ data: run()[0] || null, error: null }),
      then: (res, rej) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return api;
  };
  return {
    supabaseAdmin: {
      from,
      auth: {
        getUser: async (token) =>
          authUsers[token] ? { data: { user: authUsers[token] }, error: null } : { data: null, error: { message: "invalid JWT" } },
      },
    },
  };
});

import {
  buildWelcomeEmail,
  CONFIRM_SIGNUP_SUBJECT,
  confirmSignupDocFile,
  confirmSignupTemplate,
  PAIDLY_EMAIL_LOGO_PATH,
  SUPABASE_AUTH_TEMPLATE_FILES,
  WELCOME_SUBJECT,
} from "../../server/src/auth/paidlyAuthEmails.js";
import authWelcomeEmailHandler, { sendWelcomeEmailOnce } from "../../server/src/auth/authWelcomeEmailApi.js";
import { getUserFromRequest } from "../../server/src/supabaseAuth.js";
import { requireBearerUser } from "../../server/src/billing/httpAuth.js";
import { isEmailVerifiedUser } from "@shared/auth/emailVerification.js";

const ROOT = path.resolve(__dirname, "../..");
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");

const OWNER = { id: "u-owner", email: "owner@shop.co.za", email_confirmed_at: "2026-09-26T08:00:00Z", user_metadata: { full_name: "Thandi Mokoena" } };
const EMPLOYEE = { id: "u-emp", email: "emp@shop.co.za", email_confirmed_at: "2026-09-26T08:00:00Z" };
const UNVERIFIED = { id: "u-new", email: "new@shop.co.za", email_confirmed_at: null };

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const k of Object.keys(authUsers)) delete authUsers[k];
  tables.organizations = [{ id: "org-1", owner_id: OWNER.id }, { id: "org-2", owner_id: UNVERIFIED.id }];
  tables.profiles = [
    { id: OWNER.id, full_name: "Thandi Mokoena", welcome_email_sent_at: null },
    { id: EMPLOYEE.id, full_name: "Emp", welcome_email_sent_at: null },
    { id: UNVERIFIED.id, full_name: "New", welcome_email_sent_at: null },
  ];
  Object.assign(authUsers, { "tok-owner": OWNER, "tok-emp": EMPLOYEE, "tok-new": UNVERIFIED });
});

describe("Paidly verification email (Supabase template)", () => {
  const html = confirmSignupTemplate();

  it("has the Paidly copy, subject and CTA", () => {
    expect(CONFIRM_SIGNUP_SUBJECT).toBe("Confirm your Paidly email");
    for (const text of [
      ">Confirm your email<",
      "Welcome to Paidly.",
      "Please confirm your email address to activate your Paidly account.",
      ">Confirm Email<",
      "If you didn&#39;t create a Paidly account, you can safely ignore this email.".replace("&#39;", "'"),
    ]) {
      expect(html).toContain(text);
    }
  });

  it("links to Paidly's /auth/verified with Supabase's token hash (no custom token, no raw Supabase URL)", () => {
    expect(html).toContain('href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email"');
    expect(html).not.toContain("{{ .ConfirmationURL }}");
    expect(html).not.toMatch(/localhost|vercel\.app/);
  });

  it("prints the link as a fallback, shows the support address, makes no marketing claims", () => {
    expect(html).toContain("Button not working?");
    expect(html.match(/\{\{ \.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}&type=email/g)).toHaveLength(3); // href ×2 + text
    expect(html).toContain("support@paidly.co.za");
    expect(html).not.toMatch(/paidly\.com|thousands|premium|free trial|24 hours/i);
  });

  it("uses the Paidly logo (PNG, absolute via the Site URL) and is mobile-friendly", () => {
    expect(html).toContain(`src="{{ .SiteURL }}${PAIDLY_EMAIL_LOGO_PATH}"`);
    expect(html).toContain('name="viewport"');
    expect(html).toContain("max-width:560px");
    const png = readFileSync(path.join(ROOT, "public", PAIDLY_EMAIL_LOGO_PATH));
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
  });

  it("no customer-facing auth email mentions Supabase", () => {
    for (const build of Object.values(SUPABASE_AUTH_TEMPLATE_FILES)) {
      expect(build()).not.toMatch(/supabase/i);
    }
    expect(buildWelcomeEmail({ appOrigin: "https://www.paidly.co.za" }).html).not.toMatch(/supabase/i);
  });

  it("supabase/templates are generated from the builders and wired in config.toml", () => {
    const toml = read("supabase/config.toml");
    for (const [file, build] of Object.entries(SUPABASE_AUTH_TEMPLATE_FILES)) {
      expect(read(`supabase/templates/${file}`)).toBe(build());
      expect(toml).toContain(`content_path = "./supabase/templates/${file}"`);
    }
    expect(toml).toContain('subject = "Confirm your Paidly email"');
    expect(read("docs/EMAIL_CONFIRMATION_TEMPLATE.html")).toBe(confirmSignupDocFile());
    expect(toml).toMatch(/enable_confirmations = true/);
    expect(toml).toContain("/auth/verified/**");
  });
});

describe("welcome email content", () => {
  it("subject, heading, quick start and Get Started CTA", () => {
    const mail = buildWelcomeEmail({ appOrigin: "https://www.paidly.co.za/", name: "Thandi Mokoena" });
    expect(mail.subject).toBe(WELCOME_SUBJECT);
    expect(WELCOME_SUBJECT).toBe("Welcome to Paidly");
    for (const text of [
      "Welcome to Paidly",
      "Your email has been verified and your Paidly account is ready.",
      "Start by setting up your business, adding your clients and creating your first invoice.",
      "Get started with Paidly",
      "Set up your business profile",
      "Add your clients",
      "Create your first invoice",
      "Explore your Paidly workspace",
      ">Get Started<",
      'href="https://www.paidly.co.za/Dashboard"',
      "Hi Thandi,",
    ]) {
      expect(mail.html).toContain(text);
    }
    expect(mail.text).toContain("1. Set up your business profile");
  });

  it("escapes the user's name", () => {
    const mail = buildWelcomeEmail({ appOrigin: "https://www.paidly.co.za", name: "<img src=x onerror=alert(1)>" });
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img");
  });
});

describe("welcome email is sent once, after verification, to the caller only", () => {
  const transport = () => vi.fn(async () => ({ success: true }));

  it("verified business owner → one email; every later call → none", async () => {
    const send = transport();
    expect(await sendWelcomeEmailOnce(OWNER, { transport: send, appOrigin: "https://www.paidly.co.za" })).toEqual({ sent: true });
    expect(await sendWelcomeEmailOnce(OWNER, { transport: send })).toEqual({ sent: false, reason: "already_sent" });
    expect(await sendWelcomeEmailOnce(OWNER, { transport: send })).toEqual({ sent: false, reason: "already_sent" });
    expect(send).toHaveBeenCalledTimes(1);
    const [to, subject] = send.mock.calls[0];
    expect(to).toBe(OWNER.email);
    expect(subject).toBe("Welcome to Paidly");
    expect(tables.profiles.find((p) => p.id === OWNER.id).welcome_email_sent_at).toBeTruthy();
  });

  it("repeated verification callbacks at the same moment still send one email", async () => {
    const send = transport();
    const results = await Promise.all(Array.from({ length: 6 }, () => sendWelcomeEmailOnce(OWNER, { transport: send })));
    expect(results.filter((r) => r.sent)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("unverified account → no email, nothing claimed", async () => {
    const send = transport();
    expect(await sendWelcomeEmailOnce(UNVERIFIED, { transport: send })).toEqual({ sent: false, reason: "email_not_verified" });
    expect(send).not.toHaveBeenCalled();
    expect(tables.profiles.find((p) => p.id === UNVERIFIED.id).welcome_email_sent_at).toBeNull();
  });

  it("invited employee (no business of their own) → no 'set up your business' email", async () => {
    const send = transport();
    expect(await sendWelcomeEmailOnce(EMPLOYEE, { transport: send })).toEqual({ sent: false, reason: "not_business_owner" });
    expect(send).not.toHaveBeenCalled();
  });

  it("a failed send releases the claim so a later call can deliver it", async () => {
    const failing = vi.fn(async () => ({ success: false, error: "provider down" }));
    expect(await sendWelcomeEmailOnce(OWNER, { transport: failing })).toEqual({ sent: false, reason: "send_failed" });
    expect(tables.profiles.find((p) => p.id === OWNER.id).welcome_email_sent_at).toBeNull();
    const ok = transport();
    expect(await sendWelcomeEmailOnce(OWNER, { transport: ok })).toEqual({ sent: true });
  });

  it("the endpoint uses only the token's user: a body naming someone else changes nothing", async () => {
    const sendMod = await import("../../server/src/sendInvoice.js");
    const spy = vi.spyOn(sendMod, "sendHtmlEmail").mockResolvedValue({ success: true });
    const call = async (token, body = {}) => {
      const res = { statusCode: 200, headers: {}, body: null };
      res.status = (c) => ((res.statusCode = c), res);
      res.json = (b) => ((res.body = b), res);
      res.setHeader = (k, v) => (res.headers[k] = v);
      res.end = () => res;
      await authWelcomeEmailHandler({ method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
      return res;
    };
    expect((await call(null)).statusCode).toBe(401);
    expect((await call("tok-new")).statusCode).toBe(401); // unverified session refused
    const owner = await call("tok-emp", { user_id: OWNER.id, email: OWNER.email });
    expect(owner.body).toMatchObject({ ok: true, sent: false, reason: "not_business_owner" });
    expect(tables.profiles.find((p) => p.id === OWNER.id).welcome_email_sent_at).toBeNull();
    spy.mockRestore();
  });

  it("GET is not allowed", async () => {
    const res = { statusCode: 200, headers: {} };
    res.status = (c) => ((res.statusCode = c), res);
    res.json = () => res;
    res.setHeader = (k, v) => (res.headers[k] = v);
    await authWelcomeEmailHandler({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe("the API refuses unverified sessions", () => {
  it("shared rule", () => {
    expect(isEmailVerifiedUser(OWNER)).toBe(true);
    expect(isEmailVerifiedUser(UNVERIFIED)).toBe(false);
    expect(isEmailVerifiedUser({ id: "x", email: null })).toBe(true); // no email to verify
    expect(isEmailVerifiedUser(null)).toBe(false);
  });

  it("getUserFromRequest (all company / payroll / POS / payment routes)", async () => {
    expect(await getUserFromRequest({ headers: { authorization: "Bearer tok-owner" } })).toMatchObject({ user: { id: OWNER.id } });
    expect(await getUserFromRequest({ headers: { authorization: "Bearer tok-new" } })).toMatchObject({ user: null, code: "EMAIL_NOT_VERIFIED" });
  });

  it("billing bearer auth → 403 for unverified", async () => {
    const sb = { auth: { getUser: async (t) => ({ data: { user: authUsers[t] }, error: null }) } };
    expect(await requireBearerUser({ headers: { authorization: "Bearer tok-new" } }, sb)).toMatchObject({ status: 403 });
    expect(await requireBearerUser({ headers: { authorization: "Bearer tok-owner" } }, sb)).toMatchObject({ user: { id: OWNER.id } });
  });

  it("every direct token check that serves business data applies the rule", () => {
    for (const f of ["server/src/dashboardBootstrapHandler.js", "server/src/bootstrapUserOrganizationApi.js", "api/system.js", "server/src/billing/httpAuth.js", "server/src/supabaseAuth.js"]) {
      expect(read(f)).toMatch(/isEmailVerifiedUser\(/);
    }
  });

  it("no email API key or service-role key reaches browser code", () => {
    const walk = (dir, out = []) => {
      for (const name of require("node:fs").readdirSync(dir)) {
        if (name.startsWith("._")) continue;
        const full = path.join(dir, name);
        if (require("node:fs").statSync(full).isDirectory()) walk(full, out);
        else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(full);
      }
      return out;
    };
    // Browser code may name a server variable in operator help text, but must never READ a secret,
    // and no VITE_-prefixed (browser-exposed) variable may carry one.
    const reads = /(import\.meta\.env|process\.env)\s*(\.|\[\s*["'])\w*(RESEND|SERVICE_ROLE|SECRET)/i;
    const viteSecret = /VITE_\w*(RESEND|SERVICE_ROLE|SECRET)/i;
    const offenders = walk(path.join(ROOT, "src")).filter((f) => {
      const code = readFileSync(f, "utf8");
      return reads.test(code) || viteSecret.test(code);
    });
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
    for (const envFile of [".env.example", "server/.env.example", ".env.production.example"]) {
      const full = path.join(ROOT, envFile);
      if (existsSync(full)) expect(readFileSync(full, "utf8")).not.toMatch(viteSecret);
    }
  });
});

describe("migration 20260926100000 (Postgres)", () => {
  let db;
  const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, service_role;
      grant execute on function auth.uid() to authenticated, service_role;
      create table public.profiles (id uuid primary key, full_name text);
      grant all on public.profiles to authenticated, service_role;
      insert into auth.users values ('${U(1)}', 'old@x.co', '2026-01-01'), ('${U(2)}', 'pending@x.co', null);
      insert into public.profiles values ('${U(1)}', 'Old'), ('${U(2)}', 'Pending');
    `);
    const sql = read("supabase/migrations/20260926100000_profiles_welcome_email_sent_at.sql");
    await db.exec(sql);
    await db.exec(sql); // idempotent
  }, 60_000);

  const asUser = async (id, sql) => {
    await db.exec("begin");
    try {
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [id]);
      await db.exec("set local role authenticated");
      await db.exec(sql);
      await db.exec("commit");
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  };
  const marker = async (id) => (await db.query(`select welcome_email_sent_at from public.profiles where id = $1`, [id])).rows[0].welcome_email_sent_at;

  it("existing verified users are marked as welcomed; pending sign-ups are not", async () => {
    expect(await marker(U(1))).not.toBeNull();
    expect(await marker(U(2))).toBeNull();
  });

  it("an end user cannot set or clear the marker (so cannot re-trigger the email); the server can", async () => {
    await asUser(U(1), `update public.profiles set welcome_email_sent_at = null, full_name = 'Renamed' where id = '${U(1)}'`);
    expect(await marker(U(1))).not.toBeNull();
    expect((await db.query(`select full_name from public.profiles where id = $1`, [U(1)])).rows[0].full_name).toBe("Renamed");
    await asUser(U(2), `update public.profiles set welcome_email_sent_at = now() where id = '${U(2)}'`);
    expect(await marker(U(2))).toBeNull();
    await db.exec(`set role service_role; update public.profiles set welcome_email_sent_at = now() where id = '${U(2)}'; reset role;`);
    expect(await marker(U(2))).not.toBeNull();
  });
});
