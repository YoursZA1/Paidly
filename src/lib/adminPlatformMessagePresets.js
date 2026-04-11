/**
 * Starter copy for admin → platform user messages (South African English tone).
 * Use {@link buildAdminPlatformMessagePresets} so Login links match the environment (e.g. staging).
 */

export const DEFAULT_ADMIN_PLATFORM_SUBJECT = 'Message from the Paidly team';

/**
 * @param {string} [appOrigin] — e.g. window.location.origin or https://www.paidly.co.za
 * @returns {Array<{ id: string, label: string, subject: string, body: string }>}
 */
export function buildAdminPlatformMessagePresets(appOrigin = 'https://www.paidly.co.za') {
  const base = String(appOrigin || 'https://www.paidly.co.za').replace(/\/$/, '');
  const loginUrl = `${base}/Login`;

  return [
    {
      id: 'waitlist_activate',
      label: 'Waitlist → activate account',
      subject: "Your Paidly spot is ready — let's get you set up",
      body: `Hi there,

Thanks for waiting — your Paidly account is ready to use. You can sign in with the same email address you used on the waitlist and finish setup in just a few minutes:

${loginUrl}

If anything doesn't look right or you get stuck, please reply to this email and we'll help you sort it out.

Kind regards,
The Paidly team`,
    },
    {
      id: 'email_confirm',
      label: 'Confirm email address',
      subject: 'Action needed: please confirm your email for Paidly',
      body: `Hi there,

To keep your Paidly account secure and to make sure you receive invoices, receipts, and important updates, please confirm your email address.

Sign in to Paidly and complete verification from your profile, or use the link we sent when you signed up:

${loginUrl}

If that link has expired, sign in and request a new confirmation email from your account settings.

Kind regards,
The Paidly team`,
    },
    {
      id: 'product_update',
      label: 'Product update',
      subject: "Paidly update — what's new",
      body: `Hi there,

Just a quick note on something we've shipped that should make your day a bit easier: [add one or two sentences here].

You can log in here to try it:

${loginUrl}

If anything is unclear, reply to this email — we're happy to help.

Kind regards,
The Paidly team`,
    },
    {
      id: 'gentle_nudge',
      label: "Gentle nudge (haven't started yet)",
      subject: 'Still keen to try Paidly?',
      body: `Hi there,

We noticed you haven't quite got going in Paidly yet — no pressure at all. When you have a moment, you can sign in and create a test invoice or quote to see how it works for your business:

${loginUrl}

If timing was the issue, your account is still here whenever you're ready. If something put you off, tell us in one line — we read every reply.

Kind regards,
The Paidly team`,
    },
  ];
}
