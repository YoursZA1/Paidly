/**
 * Replays the trial conversion + existing-user migration SQL on PGlite and checks the access rule
 * the write guards use: grace and exclusion grant access, suspended still wins, expiry skips excluded
 * rows, and the new notification types and migration states are accepted.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = [
  "20261008193000_trial_conversion_notifications.sql",
  "20261008210000_trial_notifications_system_once.sql",
  "20261008220000_existing_user_trial_migration.sql",
].map((name) => path.resolve(__dirname, "../../supabase/migrations", name));

const STUB = `
create role service_role; create role authenticated; create role anon;
create table public.profiles (id uuid primary key, subscription_status text, is_pro boolean,
  trial_ends_at timestamptz, updated_at timestamptz);
create table public.subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid, email text,
  company_id uuid, status text, plan text, trial_ends_at timestamptz, grace_ends_at timestamptz,
  current_period_end timestamptz, expires_at timestamptz, next_billing_date timestamptz,
  subscription_source text, admin_override boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now());
`;

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const day = 86_400_000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * day).toISOString();

async function row(email, cols) {
  await q(
    `insert into public.subscriptions (email, status, trial_ends_at, migration_grace_ends_at, migration_excluded)
     values ($1, $2, $3, $4, $5)`,
    [email, cols.status, cols.trialEndsAt ?? null, cols.graceEndsAt ?? null, cols.excluded ?? false]
  );
}
const access = async (email) =>
  (await q(`select public.subscription_row_has_access(s) as a from public.subscriptions s where email = $1`, [email]))[0].a;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
});

describe("existing-user migration SQL", () => {
  it("grants access during the grace period and not after it", async () => {
    await row("grace-running", { status: "expired", trialEndsAt: iso(-60), graceEndsAt: iso(5) });
    await row("grace-over", { status: "expired", trialEndsAt: iso(-60), graceEndsAt: iso(-1) });
    await row("plain-expired", { status: "expired", trialEndsAt: iso(-60) });
    expect(await access("grace-running")).toBe(true);
    expect(await access("grace-over")).toBe(false);
    expect(await access("plain-expired")).toBe(false);
  });

  it("keeps an excluded account open, but suspended always denies", async () => {
    await row("excluded", { status: "expired", trialEndsAt: iso(-60), excluded: true });
    await row("suspended-grace", { status: "suspended", graceEndsAt: iso(5) });
    await row("suspended-excluded", { status: "suspended", excluded: true });
    expect(await access("excluded")).toBe(true);
    expect(await access("suspended-grace")).toBe(false);
    expect(await access("suspended-excluded")).toBe(false);
  });

  it("never expires an excluded trial automatically", async () => {
    await row("overdue", { status: "trialing", trialEndsAt: iso(-1) });
    await row("overdue-excluded", { status: "trialing", trialEndsAt: iso(-1), excluded: true });
    await q(`select public.expire_all_overdue_trials()`);
    const status = async (email) => (await q(`select status from public.subscriptions where email = $1`, [email]))[0].status;
    expect(await status("overdue")).toBe("expired");
    expect(await status("overdue-excluded")).toBe("trialing");
  });

  it("accepts the migration states and notification types, and rejects others", async () => {
    await q(`update public.subscriptions set trial_migration_status = 'MIGRATED_EXPIRED' where email = 'grace-running'`);
    await expect(
      q(`update public.subscriptions set trial_migration_status = 'LOCKED' where email = 'grace-running'`)
    ).rejects.toThrow();
    const sub = (await q(`select id from public.subscriptions where email = 'grace-running'`))[0].id;
    const insert = (type, source = "system") =>
      q(
        `insert into public.subscription_notifications (subscription_id, notification_type, status, source, trial_ends_at)
         values ($1, $2, 'sent', $3, $4)`,
        [sub, type, source, "2026-10-08T00:00:00Z"]
      );
    await insert("EXISTING_USER_TRIAL_EXPIRED");
    await insert("EXISTING_USER_TRIAL_FOLLOWUP");
    // Once per migration cycle for automatic sends; an admin send does not use the slot.
    await expect(insert("EXISTING_USER_TRIAL_EXPIRED")).rejects.toThrow();
    await insert("EXISTING_USER_TRIAL_EXPIRED", "admin");
    await expect(insert("SOMETHING_ELSE")).rejects.toThrow();
  });
});
