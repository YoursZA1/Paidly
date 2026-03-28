import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CheckCircle2, RefreshCw, Sparkles, Wallet } from "lucide-react";
import { createAffiliateApplyUrl, createAffiliateDashboardUrl, createPageUrl } from "@/utils";

const steps = [
  { title: "Apply", body: "Tell us who you reach and how you’d promote Paidly." },
  { title: "Get approved", body: "We review partners who fit our audience — usually within a few business days." },
  { title: "Start earning", body: "Share your link from the dashboard. We track signups and paid conversions." },
];

const benefits = [
  {
    title: "Recurring commission",
    body: "Earn on subscription revenue from customers you refer — aligned with how SaaS grows.",
    icon: RefreshCw,
  },
  {
    title: "Real-time tracking",
    body: "Clicks, signups, and earnings live in one place after you’re approved.",
    icon: BarChart3,
  },
  {
    title: "Fast payouts",
    body: "Clear commission records — we keep the ledger honest so you can trust the numbers.",
    icon: Wallet,
  },
];

export default function AffiliateLanding() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] font-sans text-zinc-100 antialiased selection:bg-[#FF4F00]/30">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#0a0a0a]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <Link to={createPageUrl("Home")} className="flex items-center gap-2 text-white" aria-label="Paidly home">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
              <img src="/logo.svg" alt="" className="h-6 w-6" aria-hidden />
            </div>
            <span className="text-sm font-semibold">Paidly</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to={createPageUrl("Home")} className="hidden text-zinc-400 transition hover:text-white sm:inline">
              Home
            </Link>
            <Link to={createPageUrl("Login")} className="text-zinc-400 transition hover:text-white">
              Log in
            </Link>
            <Link
              to={createPageUrl("Signup")}
              className="rounded-lg bg-[#FF4F00] px-3 py-2 font-semibold text-white shadow-lg shadow-[#FF4F00]/20 hover:bg-[#E64700]"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,79,0,0.15),transparent)]" />
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#FF4F00]">Affiliate program</p>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
              Earn by Helping Businesses Get Paid Faster
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
              Promote Paidly. Earn recurring income for every paying user you bring — with a clean ledger: clicks,
              signups, and commissions in your dashboard.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                to={createAffiliateApplyUrl()}
                className="inline-flex rounded-xl bg-[#FF4F00] px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-[#FF4F00]/25 transition hover:bg-[#E64700]"
              >
                Apply Now
              </Link>
              <Link
                to={createAffiliateDashboardUrl()}
                className="text-sm font-medium text-zinc-400 underline-offset-4 transition hover:text-white hover:underline"
              >
                Already approved? Open your dashboard →
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] bg-[#080808] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">How it works</h2>
            <ol className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-3">
              {steps.map((s, i) => (
                <li
                  key={s.title}
                  className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-6 text-center sm:text-left"
                >
                  <span className="mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF4F00]/15 text-sm font-bold text-[#FF4F00] sm:mx-0">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">Benefits</h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {benefits.map((b) => (
                <div key={b.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
                  <b.icon className="mb-4 h-8 w-8 text-[#FF4F00]" aria-hidden />
                  <h3 className="font-semibold text-white">{b.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] bg-[#080808] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
            <Sparkles className="h-10 w-10 text-[#FF4F00]" aria-hidden />
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to grow with us?</h2>
            <p className="text-zinc-400">
              We review every application. No spam — ever. Start with the form and we&apos;ll follow up by email.
            </p>
            <Link
              to={createAffiliateApplyUrl()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#FF4F00] px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#FF4F00]/25 transition hover:bg-[#E64700]"
            >
              Apply Now
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="flex items-center gap-2 text-xs text-zinc-500">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
              Recurring commission on eligible plans — exact terms are confirmed when you&apos;re approved.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-zinc-500">
        <Link to={createPageUrl("Home")} className="hover:text-zinc-300">
          Paidly
        </Link>
        {" · "}
        <Link to={createAffiliateApplyUrl()} className="hover:text-zinc-300">
          Apply
        </Link>
        {" · "}
        <Link to={createPageUrl("TermsAndConditions")} className="hover:text-zinc-300">
          Terms
        </Link>
      </footer>
    </div>
  );
}
