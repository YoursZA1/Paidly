import { Link } from "react-router-dom";
import { createWaitlistUrl } from "@/utils";
import { Check } from "lucide-react";

const PLANS = [
  {
    name: "Individual",
    price: "R25",
    period: "/mo",
    description: "Solo operators and side projects.",
    features: ["Unlimited invoices", "Client management", "Email delivery", "Basic reports"],
    highlighted: false,
  },
  {
    name: "SME",
    price: "R50",
    period: "/mo",
    description: "Small teams that need more control.",
    features: ["Everything in Individual", "Quotes & templates", "Payment tracking", "Priority support"],
    highlighted: true,
    badge: "Most popular",
  },
  {
    name: "Corporate",
    price: "R110",
    period: "/mo",
    description: "Growing businesses with heavier volume.",
    features: ["Everything in SME", "Advanced reporting", "Multi-user ready", "Dedicated onboarding"],
    highlighted: false,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-24 border-t border-white/[0.06] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
          Simple pricing
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-center text-zinc-400">
          Pick a plan that matches how you work. Upgrade or downgrade anytime.
        </p>
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-xl border p-6 sm:p-8 ${
                plan.highlighted
                  ? "border-[#FF4F00]/50 bg-[#FF4F00]/[0.06] shadow-lg shadow-[#FF4F00]/10"
                  : "border-white/[0.08] bg-white/[0.02]"
              }`}
            >
              {plan.badge ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#FF4F00] px-3 py-0.5 text-xs font-semibold text-white">
                  {plan.badge}
                </span>
              ) : null}
              <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
              <p className="mt-1 text-sm text-zinc-400">{plan.description}</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                <span className="text-zinc-500">{plan.period}</span>
              </p>
              <ul className="mt-8 flex-1 space-y-3 text-sm text-zinc-300">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="h-4 w-4 shrink-0 text-[#FF4F00]" strokeWidth={2} aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to={createWaitlistUrl()}
                className={`mt-8 inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition ${
                  plan.highlighted
                    ? "bg-[#FF4F00] text-white hover:bg-[#E64700]"
                    : "border border-white/15 bg-transparent text-white hover:border-white/25 hover:bg-white/[0.05]"
                }`}
              >
                Join waitlist
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
