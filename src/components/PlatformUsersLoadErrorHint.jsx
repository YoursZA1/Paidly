/**
 * Shown when GET /api/admin/platform-users fails with Supabase Auth Admin "User not allowed"
 * (server key not authorized for listUsers).
 */
export default function PlatformUsersLoadErrorHint({ message }) {
  if (!String(message || '').toLowerCase().includes('user not allowed')) return null;
  return (
    <span className="text-muted-foreground" role="note">
      {' '}
      This usually means the API host is not configured with a valid{' '}
      <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code> for the same project as{' '}
      <code className="rounded bg-muted px-1">SUPABASE_URL</code> (Supabase Auth Admin rejected{' '}
      <code className="rounded bg-muted px-1">listUsers</code>). Set both on the server or Vercel, redeploy, and confirm the
      key is the service role secret from Supabase → Project Settings → API.
    </span>
  );
}
