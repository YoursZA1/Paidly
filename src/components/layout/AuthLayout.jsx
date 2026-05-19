/**
 * Minimal shell for public auth routes (/login, /signup, /forgot-password).
 * No app nav, realtime, sync, or dashboard providers — only page content.
 */
export default function AuthLayout({ children }) {
  return <div className="auth-layout min-h-screen">{children}</div>;
}
