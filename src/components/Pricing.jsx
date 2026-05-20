import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { createSignupUrl } from "@/utils";

const PLANS = [
  {
    name: "Individual",
    price: "R25",
    period: "/mo",
    description: "Solo operators and side projects.",
    features: [
      "Unlimited invoices",
      "Client management",
      "Email delivery",
      "Basic reports",
    ],
    highlighted: false,
  },
  {
    name: "SME",
    price: "R50",
    period: "/mo",
    description: "Small teams that need more control.",
    features: [
      "Everything in Individual",
      "Quotes & templates",
      "Payment tracking",
      "Priority support",
    ],
    highlighted: true,
    badge: "Most popular",
  },
  {
    name: "Corporate",
    price: "R110",
    period: "/mo",
    description: "Growing businesses with heavier volume.",
    features: [
      "Everything in SME",
      "Advanced reporting",
      "Multi-user ready",
      "Dedicated onboarding",
    ],
    highlighted: false,
  },
];

export default function Pricing() {
  return (
    <section
      id="pricing"
      className="relative scroll-mt-24 border-t border-white/[0.06] px-4 py-24 sm:px-6 lg:px-8 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#FF4F00]"
          >
            Pricing
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl"
          >
            Simple, honest pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-zinc-400"
          >
            Pick a plan that matches how you work. Upgrade or downgrade anytime — no lock-in.
          </motion.p>
        </div>

        {/* Plans */}
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className={`relative flex flex-col overflow-hidden rounded-2xl border p-7 transition-all duration-300 ${
                plan.highlighted
                  ? "border-[#FF4F00]/40 bg-gradient-to-b from-[#FF4F00]/[0.08] to-transparent shadow-xl shadow-[#FF4F00]/10 hover:border-[#FF4F00]/55"
                  : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
              }`}
            >
              {/* Highlighted top border accent */}
              {plan.highlighted && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-px"
                  aria-hidden
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,79,0,0.6) 50%, transparent)",
                  }}
                />
              )}

              {plan.badge && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#FF4F00] px-3.5 py-1 text-xs font-semibold text-white shadow-lg shadow-[#FF4F00]/30">
                  {plan.badge}
                </span>
              )}

              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                {plan.name}
              </p>
              <p className="mt-1 text-sm text-zinc-500">{plan.description}</p>

              <p className="mt-7 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-white">{plan.price}</span>
                <span className="text-sm text-zinc-500">{plan.period}</span>
              </p>

              <ul className="mt-8 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-300">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#FF4F00]"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to={createSignupUrl()}
                className={`mt-9 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-all duration-200 ${
                  plan.highlighted
                    ? "bg-[#FF4F00] text-white shadow-lg shadow-[#FF4F00]/25 hover:bg-[#E64700] hover:shadow-[#FF4F00]/40"
                    : "border border-white/[0.12] bg-transparent text-white hover:border-white/[0.22] hover:bg-white/[0.06]"
                }`}
              >
                Get started free
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 text-center text-sm text-zinc-500"
        >
          All plans include a free trial period. No credit card required to start.
        </motion.p>
      </div>
    </section>
  );
}
