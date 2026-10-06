import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  ChefHat,
  FileText,
  Loader2,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LandingLoginModal from "@/components/auth/LandingLoginModal";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUserId } from "@/lib/authUserId";
import { useDemoMode } from "@/hooks/useDemoMode";
import { startLiveDemo } from "@/lib/demo/demoModeApi";
import { createSignupUrl } from "@/utils";

const INSIDE = [
  { icon: Users, title: "15 customers", body: "Corporates, event planners and schools with real-looking histories." },
  { icon: FileText, title: "20 invoices · 8 quotes", body: "Paid, pending, overdue and draft — with VAT, line items and payments." },
  { icon: ChefHat, title: "Restaurant POS", body: "10 tables, dine-in and takeaway orders moving through kitchen → ready → payment." },
  { icon: Boxes, title: "Menu & stock", body: "18 menu items with costs, stock levels and low-stock alerts." },
  { icon: Receipt, title: "Expenses & team", body: "Supplier costs, rent and utilities, plus a 7-person team with payroll." },
  { icon: BarChart3, title: "Reports", body: "Revenue, POS sales, expenses and outstanding invoices from real records." },
];

/**
 * Public /demo page (also /demo/anything — ids in the URL are ignored; the server decides everything).
 * "Enter Live Demo" creates a private, short-lived Mavela Café workspace for this visitor.
 */
export default function DemoLanding() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, session, logout } = useAuth();
  const demo = useDemoMode();
  const signedIn = Boolean(getAuthUserId(user) || session?.user?.id);
  const [loginOpen, setLoginOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const ended = new URLSearchParams(location.search).get("ended") === "1";

  const enter = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setError("");
    // The dashboard chunk downloads while the session is created, so arrival is not a second wait.
    if (!import.meta.env.VITEST) {
      void import("@/pages/Dashboard").catch(() => {});
    }
    try {
      if (signedIn && !demo.isDemo) {
        // A demo never shares a browser session with a real account.
        await logout?.();
      }
      await startLiveDemo();
      navigate("/Dashboard", { replace: true });
    } catch (err) {
      setError(err?.message || "We couldn't start the demo. Please try again.");
      setStarting(false);
    }
  }, [demo.isDemo, logout, navigate, signedIn, starting]);

  const inDemo = signedIn && demo.isDemo && !demo.expired;

  return (
    <div className="min-h-screen overflow-x-clip bg-[#0a0a0a] font-sans text-zinc-100 antialiased selection:bg-[#FF4F00]/30">
      <Navbar onLoginClick={() => setLoginOpen(true)} />

      <main>
        <section className="relative overflow-hidden px-4 pb-16 pt-24 sm:px-6 sm:pt-32 lg:px-8">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(255,79,0,0.16), transparent 70%)" }}
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FF7A3D]">Live demo · Mavela Café</p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Experience Paidly with a live demo business.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              Explore how Paidly helps you manage customers, invoices, quotes, expenses, inventory, employees, POS and payments —
              all in one place.
            </p>

            {ended ? (
              <p role="status" className="mx-auto mt-6 max-w-md rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">
                Your demo has ended and its data was deleted. Start a fresh one anytime.
              </p>
            ) : null}

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              {inDemo ? (
                <Link
                  to="/Dashboard"
                  className="inline-flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-[#FF4F00] px-8 text-sm font-semibold text-white shadow-lg shadow-[#FF4F00]/30 transition-colors hover:bg-[#E64700] sm:w-auto"
                >
                  Continue your demo
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void enter()}
                  disabled={starting}
                  data-testid="enter-live-demo"
                  className="inline-flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-[#FF4F00] px-8 text-sm font-semibold text-white shadow-lg shadow-[#FF4F00]/30 transition-colors hover:bg-[#E64700] disabled:cursor-wait disabled:opacity-80 sm:w-auto"
                >
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {starting ? "Signing you into the demo…" : signedIn && !demo.isDemo ? "Sign out & enter live demo" : "Enter Live Demo"}
                  {starting ? null : <ArrowRight className="h-4 w-4" aria-hidden />}
                </button>
              )}
              <Link
                to={createSignupUrl()}
                className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.04] px-8 text-sm font-semibold text-white transition-colors hover:border-white/[0.2] hover:bg-white/[0.08] sm:w-auto"
              >
                Create Your Paidly Account
              </Link>
            </div>

            {error ? (
              <p role="alert" className="mx-auto mt-5 max-w-md text-sm text-red-300">
                {error}
              </p>
            ) : null}
            {signedIn && !demo.isDemo && !starting ? (
              <p className="mx-auto mt-5 max-w-md text-xs text-zinc-500">
                You&apos;re signed in to your own Paidly account. Entering the demo signs you out first — your business is not affected.
              </p>
            ) : (
              <p className="mt-5 text-xs font-medium uppercase tracking-widest text-zinc-600">No signup · no card · ready in seconds</p>
            )}
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 lg:px-8" aria-labelledby="demo-inside">
          <div className="mx-auto max-w-5xl">
            <h2 id="demo-inside" className="text-center text-2xl font-semibold text-white sm:text-3xl">
              A real restaurant, already running
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-zinc-400">
              Follow a customer from quote to invoice to payment, seat a table and send the order to the kitchen, or watch a
              sale flow into stock and reports.
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {INSIDE.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                  <Icon className="h-5 w-5 text-[#FF7A3D]" aria-hidden />
                  <p className="mt-3 font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 pb-24 sm:px-6 lg:px-8" aria-labelledby="demo-safe">
          <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
            <h2 id="demo-safe" className="sr-only">
              How the demo works
            </h2>
            {[
              { icon: Wallet, title: "Payments are simulated", body: "Choose Demo Payment Successful, Failed or Pending. No money moves and no payment provider is contacted." },
              { icon: ShieldCheck, title: "Private and isolated", body: "Your demo business is yours alone and is deleted when the demo ends. No emails, SMS or WhatsApp messages are sent." },
              { icon: RotateCcw, title: "Reset anytime", body: "Try anything. Reset Demo puts Mavela Café back to its original state in seconds." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <Icon className="h-5 w-5 text-zinc-300" aria-hidden />
                <p className="mt-3 font-semibold text-white">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer onLoginClick={() => setLoginOpen(true)} />
      <LandingLoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}
