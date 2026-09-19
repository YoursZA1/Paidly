import { supabaseAdmin } from "../supabaseAdmin.js";
import { membershipRowHasPermission, PERMISSIONS } from "../companyRouteAccess.js";
import { buildPeopleCalendarEvents, selectDuePeopleReminders } from "../../../shared/workforce/peopleCalendar.js";
import { normalizeEmployerPayrollSettings } from "../../../shared/payroll/employerSnapshot.js";
import { isWorkforceEmployeeActive } from "../../../shared/workforce/employeeLifecycle.js";
import { johannesburgYmd } from "../../../shared/payroll/dates.js";

/**
 * Daily HR reminders for upcoming birthdays and work anniversaries.
 * Runs inside the existing `payment-reminders` cron (vercel.json) — no extra cron or function.
 *
 * - Source: memberships.date_of_birth / employment_start_date (HR source of truth).
 * - Lead time: organizations.payroll_settings.people_reminder_lead_days (default 30).
 * - Recipients: people who can manage employees (owner/admin, HR managers) — never the
 *   person whose birthday it is, and never ordinary employees.
 * - Idempotent: one workforce_events row per (employee, kind, date, stage); a re-run skips.
 */

const EVENT_TYPE = "people.reminder";
const MEMBER_LIMIT = 5000;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reminderMessage(event) {
  const when = event.stage === "today" ? "today" : `on ${event.event_date} (in ${event.days_until} days)`;
  if (event.kind === "birthday") return `Upcoming birthday: ${event.employee_name} ${when}.`;
  const years = event.years === 1 ? "1-year" : `${event.years}-year`;
  return `Work anniversary: ${event.employee_name} reaches ${years} ${when}.`;
}

async function claimReminder(orgId, event) {
  const key = `people-reminder:${event.membership_id}:${event.kind}:${event.event_date}:${event.stage}`;
  const { error } = await supabaseAdmin.from("workforce_events").insert({
    org_id: orgId,
    employee_id: event.membership_id,
    event_type: EVENT_TYPE,
    payload: { kind: event.kind, event_date: event.event_date, stage: event.stage },
    idempotency_key: key,
    status: "processed",
    processed_at: new Date().toISOString(),
    attempts: 1,
  });
  if (!error) return true;
  if (error.code === "23505" || /duplicate|unique/i.test(error.message || "")) return false;
  throw error;
}

const MEMBER_COLUMNS =
  "id, org_id, user_id, role, job_function, employment_status, disabled_at, invited_name, invited_email, department, employee_number, date_of_birth, employment_start_date";

/** Only orgs where someone has a birthday or start date on file. */
async function loadMembers() {
  const { data: dated, error } = await supabaseAdmin
    .from("memberships")
    .select("org_id")
    .or("date_of_birth.not.is.null,employment_start_date.not.is.null")
    .limit(MEMBER_LIMIT);
  if (error) throw error;
  const orgIds = [...new Set((dated || []).map((r) => r.org_id).filter(Boolean))];
  const rows = [];
  for (let i = 0; i < orgIds.length; i += 100) {
    const { data, error: memErr } = await supabaseAdmin
      .from("memberships")
      .select(MEMBER_COLUMNS)
      .in("org_id", orgIds.slice(i, i + 100));
    if (memErr) throw memErr;
    rows.push(...(data || []));
  }
  return rows;
}

/**
 * @param {{ todayIso?: string, sendEmail?: boolean }} [opts]
 */
export async function runPeopleReminders(opts = {}) {
  const todayIso = opts.todayIso || johannesburgYmd().iso;
  const members = await loadMembers();
  const byOrg = new Map();
  for (const row of members) {
    if (!row.org_id) continue;
    if (!byOrg.has(row.org_id)) byOrg.set(row.org_id, []);
    byOrg.get(row.org_id).push(row);
  }

  const result = { orgs: 0, reminders: 0, notifications: 0, emails: 0, skipped: 0 };
  const orgIds = [...byOrg.keys()].filter((orgId) =>
    byOrg.get(orgId).some((m) => m.date_of_birth || m.employment_start_date)
  );
  if (!orgIds.length) return result;

  const { data: orgs } = await supabaseAdmin
    .from("organizations")
    .select("id, name, owner_id, payroll_settings")
    .in("id", orgIds);
  const orgById = new Map((orgs || []).map((o) => [o.id, o]));

  const userIds = [...new Set(members.filter((m) => orgIds.includes(m.org_id) && m.user_id).map((m) => m.user_id))];
  const profileById = new Map();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds.slice(i, i + 200));
    for (const p of data || []) profileById.set(p.id, p);
  }

  for (const orgId of orgIds) {
    const roster = byOrg.get(orgId).filter((m) => !m.disabled_at && isWorkforceEmployeeActive(m));
    const org = orgById.get(orgId);
    const leadDays = normalizeEmployerPayrollSettings(org?.payroll_settings).people_reminder_lead_days;
    const rows = roster.map((m) => ({
      ...m,
      full_name: profileById.get(m.user_id)?.full_name || m.invited_name || m.invited_email || "Employee",
    }));
    const calendar = buildPeopleCalendarEvents(rows, { todayIso, daysAhead: Math.max(leadDays, 0), includeAge: false });
    const due = selectDuePeopleReminders(calendar.events, { todayIso, leadDays });
    if (!due.length) continue;

    const recipients = roster.filter(
      (m) => m.user_id && membershipRowHasPermission(m, PERMISSIONS.MANAGE_EMPLOYEES, { ownerId: org?.owner_id || null })
    );
    if (!recipients.length) {
      result.skipped += due.length;
      continue;
    }
    result.orgs += 1;

    const fresh = [];
    for (const event of due) {
      if (await claimReminder(orgId, event)) fresh.push(event);
      else result.skipped += 1;
    }
    if (!fresh.length) continue;
    result.reminders += fresh.length;

    for (const recipient of recipients) {
      const relevant = fresh.filter((e) => e.membership_id !== recipient.id);
      if (!relevant.length) continue;
      for (const event of relevant) {
        const { error } = await supabaseAdmin
          .from("notifications")
          .insert({ user_id: recipient.user_id, message: reminderMessage(event), read: false });
        if (!error) result.notifications += 1;
      }
      const email = profileById.get(recipient.user_id)?.email;
      if (opts.sendEmail !== false && email) {
        try {
          const { sendHtmlEmail } = await import("../sendInvoice.js");
          const list = relevant.map((e) => `<li>${escapeHtml(reminderMessage(e))}</li>`).join("");
          await sendHtmlEmail(
            email,
            `People reminders — ${org?.name || "your team"}`,
            `<p>Upcoming dates for your team:</p><ul>${list}</ul><p>See Workforce → People calendar in Paidly.</p>`,
            "Paidly"
          );
          result.emails += 1;
        } catch (err) {
          console.warn("[people-reminders] email failed:", err?.message || err);
        }
      }
    }
  }
  return result;
}
