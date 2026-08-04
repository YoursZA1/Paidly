import { Link } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  FileText,
  LayoutDashboard,
  Mail,
  Package,
  Receipt,
  Settings,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { createPageUrl, createSignupUrl } from "@/utils";
import JsonLd from "@/components/seo/JsonLd";
import { buildHowToStructuredData } from "@/lib/seo/structuredData";

const quickStart = [
  {
    step: 1,
    title: "Create your account",
    body: "Sign up with email, confirm your address, then log in on any device.",
    icon: UserPlus,
    cta: { label: "Get started free", to: createSignupUrl() },
  },
  {
    step: 2,
    title: "Set up your business profile",
    body: "Add company name, address, and logo in Settings so every invoice looks professional.",
    icon: Settings,
    cta: { label: "Open Settings", to: createPageUrl("Settings") },
  },
  {
    step: 3,
    title: "Add banking details",
    body: "Save your bank account on invoices so clients know exactly where to pay.",
    icon: Banknote,
    cta: { label: "Payment details", to: `${createPageUrl("Settings")}?tab=payments` },
  },
];

const guides = [
  {
    id: "clients",
    title: "Clients",
    icon: Users,
    summary: "Your client list powers invoices, quotes, and payment tracking.",
    steps: [
      "Go to Clients and click Add client.",
      "Enter name, email, and optional billing details.",
      "Open a client anytime to see their invoices, quotes, and activity.",
    ],
    link: { label: "Clients", to: createPageUrl("Clients") },
  },
  {
    id: "invoices",
    title: "Invoices",
    icon: FileText,
    summary: "Create, send, and track invoices from draft to paid.",
    steps: [
      "Open Invoices → New invoice (or Create from the dashboard).",
      "Pick a client, add line items from your services catalog or custom lines.",
      "Preview the PDF, then send by email or share a secure link.",
      "Mark payments when money arrives — your dashboard and cash flow update automatically.",
    ],
    link: { label: "Invoices", to: createPageUrl("Invoices") },
  },
  {
    id: "quotes",
    title: "Quotes",
    icon: Receipt,
    summary: "Win work with quotes, then convert to invoices in one click.",
    steps: [
      "Create a quote with the same line-item flow as invoices.",
      "Send it to your client for approval.",
      "When they accept, convert the quote to an invoice without re-entering data.",
    ],
    link: { label: "Quotes", to: createPageUrl("Quotes") },
  },
  {
    id: "dashboard",
    title: "Dashboard & cash flow",
    icon: LayoutDashboard,
    summary: "See what is overdue, what was paid, and how your month is trending.",
    steps: [
      "Dashboard shows recent activity and key totals at a glance.",
      "Cash Flow breaks down income and expenses over time.",
      "Use filters to focus on a client or date range when reviewing numbers.",
    ],
    link: { label: "Dashboard", to: createPageUrl("Dashboard") },
  },
  {
    id: "inventory",
    title: "Products & inventory",
    icon: Package,
    summary: "Manage your product catalog, track stock, and add services for invoice line items.",
    steps: [
      "Go to Manage Products. Click Add new product to create a physical product with SKU, cost, price, and opening stock.",
      "Click Add service to add a service, labor rate, material, or expense — these appear as line items on invoices and quotes.",
      "Use the Category filter and search to find items quickly. Edit any row to update pricing or stock levels.",
      "Open the Tools panel to record a manual sale, receive stock, or view stock movement history.",
      "Scan a barcode with a USB scanner or the camera icon to instantly look up and sell or receive a product.",
      "Create a delivery order to track incoming stock from a supplier — marking it delivered automatically updates stock on hand.",
    ],
    link: { label: "Manage Products", to: createPageUrl("Services") },
  },
  {
    id: "send",
    title: "Sending & reminders",
    icon: Mail,
    summary: "Get documents to clients and follow up without leaving Paidly.",
    steps: [
      "Send invoices and quotes directly from the document view.",
      "Configure reminder rules under Settings → Reminders for overdue invoices.",
      "Clients can pay via PayFast where enabled on your plan.",
    ],
    link: { label: "Reminder settings", to: `${createPageUrl("Settings")}?tab=reminders` },
  },
];

const tips = [
  "Products and services share one catalog — anything you add appears as a line-item option on every new invoice or quote.",
  "Recurring invoices automate repeat billing for retainers and subscriptions.",
  "Scan a barcode with any USB wedge scanner on the Manage Products page to instantly record a sale or receive stock.",
  "Works offline: draft changes sync when you are back online (mobile-friendly).",
  "Set a reorder level on products and Paidly flags low-stock items so you never run out unexpectedly.",
  "Invite your team from Settings when you need shared access on one organization.",
];

export default function HowTo() {
  const howToLd = buildHowToStructuredData(
    quickStart.map((s) => ({ name: s.title, text: s.body }))
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-sans text-zinc-100 antialiased selection:bg-[#FF4F00]/30">
      <JsonLd id="howto" data={howToLd} />
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#0a0a0a]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <Link to={createPageUrl("Home")} className="flex items-center gap-2 text-white" aria-label="Paidly home">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
              <img src="/logo.svg" alt="" className="h-6 w-6" aria-hidden />
            </div>
            <span className="text-sm font-semibold">Paidly</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm" aria-label="How to navigation">
            <Link to={createPageUrl("Home")} className="hidden text-zinc-400 transition hover:text-white sm:inline">
              Home
            </Link>
            <Link to={createPageUrl("Login")} className="text-zinc-400 transition hover:text-white">
              Log in
            </Link>
            <Link
              to={createSignupUrl()}
              className="rounded-lg bg-[#FF4F00] px-3 py-2 font-semibold text-white shadow-lg shadow-[#FF4F00]/20 hover:bg-[#E64700]"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-16 lg:px-8">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,79,0,0.18),transparent)]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#FF4F00]/30 bg-[#FF4F00]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#ff8c42]">
              <Zap className="h-3.5 w-3.5" aria-hidden />
              How to use Paidly
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
              Everything you need to invoice, quote, and get paid
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              A short guide for new and returning users. Follow the steps below, then jump straight into the app —
              most teams send their first invoice in under ten minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to={createSignupUrl()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#FF4F00] px-5 text-sm font-semibold text-white shadow-lg shadow-[#FF4F00]/25 transition hover:bg-[#E64700]"
              >
                Get started free
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href="#quick-start"
                className="inline-flex min-h-11 items-center rounded-lg border border-white/[0.12] bg-white/[0.04] px-5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.07]"
              >
                Jump to quick start
              </a>
            </div>
          </div>
        </section>

        <section
          id="quick-start"
          className="scroll-mt-24 border-t border-white/[0.06] bg-[#080808] px-4 py-14 sm:px-6 lg:px-8"
        >
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Quick start</h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
              Do these three steps once. After that, creating and sending invoices is repeatable every time.
            </p>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {quickStart.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.step}
                    className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-6"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF4F00]/15 text-[#FF4F00]">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Step {item.step}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">{item.body}</p>
                    <Link
                      to={item.cta.to}
                      className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#ff8c42] transition hover:text-[#FF4F00]"
                    >
                      {item.cta.label}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section id="guides" className="scroll-mt-24 px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Core workflows</h2>
            <p className="mt-2 text-sm text-zinc-400 sm:text-base">
              Deep links below open the app after you sign in.
            </p>
            <div className="mt-10 space-y-6">
              {guides.map((guide) => {
                const Icon = guide.icon;
                return (
                  <article
                    key={guide.id}
                    id={guide.id}
                    className="scroll-mt-28 rounded-2xl border border-white/[0.08] bg-[#0c0c0c]/80 p-6 sm:p-8"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
                          <Icon className="h-5 w-5 text-[#FF4F00]" aria-hidden />
                        </span>
                        <div>
                          <h3 className="text-xl font-semibold text-white">{guide.title}</h3>
                          <p className="mt-1 text-sm text-zinc-400">{guide.summary}</p>
                        </div>
                      </div>
                      <Link
                        to={guide.link.to}
                        className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.08] sm:self-center"
                      >
                        Open {guide.link.label}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </div>
                    <ol className="mt-6 space-y-2 border-t border-white/[0.06] pt-6">
                      {guide.steps.map((step, i) => (
                        <li key={step} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FF4F00]/15 text-xs font-semibold text-[#FF4F00]">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] bg-[#080808] px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Pro tips</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {tips.map((tip) => (
                <li
                  key={tip}
                  className="flex gap-3 rounded-xl border border-white/[0.06] bg-[#0c0c0c] px-4 py-3 text-sm leading-relaxed text-zinc-400"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF4F00]" aria-hidden />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-2xl border border-[#FF4F00]/25 bg-gradient-to-br from-[#FF4F00]/15 to-transparent p-8 text-center sm:p-10">
            <h2 className="text-xl font-bold text-white sm:text-2xl">Ready to try it?</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-zinc-300 sm:text-base">
              Create a free account, complete your profile, and send your first invoice today.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                to={createSignupUrl()}
                className="inline-flex min-h-11 items-center rounded-lg bg-[#FF4F00] px-6 text-sm font-semibold text-white shadow-lg shadow-[#FF4F00]/25 hover:bg-[#E64700]"
              >
                Get started free
              </Link>
              <Link
                to={createPageUrl("Home")}
                className="inline-flex min-h-11 items-center text-sm font-medium text-zinc-300 underline-offset-4 hover:text-white hover:underline"
              >
                Back to home
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.08] px-4 py-8 text-center text-xs text-zinc-500 sm:px-6">
        <p>
          Need help?{" "}
          <a href="mailto:support@paidly.co.za" className="text-zinc-400 underline-offset-2 hover:text-white hover:underline">
            support@paidly.co.za
          </a>
        </p>
      </footer>
    </div>
  );
}
