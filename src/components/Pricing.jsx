import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { createSignupUrl } from "@/utils";
import {
  MARKETING_PLAN_ORDER,
  MARKETING_PLANS,
  MARKETING_TRIAL_FOOTER,
  formatMarketingZar,
} from "@shared/planMarketing.js";

export default function Pricing() {
  const [cycle, setCycle] = useState("monthly");
  const [plans, setPlans] = useState([]);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/subscriptions/plans");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load plans");
        if (!cancelled) setPlans(Array.isArray(data.plans) ? data.plans : []);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e?.message || "Failed to load plans");
          setPlans([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(() => {
    const byFamily = new Map();
    for (const p of plans) {
      const fam = String(p.plan_family || "").toLowerCase();
      if (!(fam in MARKETING_PLANS)) continue;
      if (!byFamily.has(fam)) byFamily.set(fam, {});
      const entry = byFamily.get(fam);
      const cyc = String(p.billing_cycle || "monthly").toLowerCase();
      if (cyc === "annual" || cyc === "yearly") entry.annual = p;
      else entry.monthly = p;
      entry.name = p.name;
      entry.contact_sales = Boolean(p.contact_sales);
      entry.description = p.description;
    }

    // Fallback static if API empty — copy and amounts from the public catalog.
    if (byFamily.size === 0) {
      return MARKETING_PLAN_ORDER.map((fam) => {
        const copy = MARKETING_PLANS[fam];
        return {
          family: fam,
          name: copy.name,
          priceLabel: copy.contactSales
            ? "Custom"
            : formatMarketingZar(cycle === "annual" ? copy.annualPriceZar : copy.monthlyPriceZar, {
                grouped: cycle === "annual",
              }),
          period: copy.contactSales ? "" : cycle === "annual" ? "/yr" : "/mo",
          description: copy.description,
          features: copy.features,
          highlighted: copy.highlighted,
          badge: copy.badge,
          contactSales: copy.contactSales,
          cta: copy.ctaSignup,
        };
      });
    }

    return MARKETING_PLAN_ORDER.filter((f) => byFamily.has(f)).map((fam) => {
      const copy = MARKETING_PLANS[fam];
      const entry = byFamily.get(fam);
      const row =
        fam === "enterprise"
          ? entry.monthly || entry.annual
          : cycle === "annual"
            ? entry.annual || entry.monthly
            : entry.monthly || entry.annual;
      const contactSales = Boolean(copy.contactSales || entry.contact_sales || row?.contact_sales);
      const monthlyAmt = Number(entry.monthly?.amount);
      const annualAmt = Number(entry.annual?.amount);
      const savings =
        cycle === "annual" &&
        Number.isFinite(monthlyAmt) &&
        Number.isFinite(annualAmt) &&
        monthlyAmt * 12 > annualAmt;

      return {
        family: fam,
        name: copy.name || entry.name || fam,
        priceLabel: contactSales ? "Custom" : formatMarketingZar(row?.amount, { grouped: cycle === "annual" }),
        period: contactSales ? "" : cycle === "annual" ? "/yr" : "/mo",
        description: copy.description || entry.description || "",
        features: copy.features || [],
        highlighted: copy.highlighted,
        badge: copy.badge || (savings ? "2 months free" : null),
        contactSales,
        cta: copy.ctaSignup,
      };
    });
  }, [plans, cycle]);

  return (
    <section
      id="pricing"
      className="relative scroll-mt-24 border-t border-white/[0.06] px-4 py-24 sm:px-6 lg:px-8 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
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
            Starter, Business, and Growth — or Enterprise for custom needs. Annual billing includes two months free.
          </motion.p>

          <div className="mt-8 inline-flex rounded-full border border-white/[0.1] bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                cycle === "monthly" ? "bg-[#FF4F00] text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setCycle("annual")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                cycle === "annual" ? "bg-[#FF4F00] text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Annual
            </button>
          </div>
          {loadError ? (
            <p className="mt-3 text-xs text-zinc-500">Showing default prices ({loadError})</p>
          ) : null}
        </div>

        <div className={`mt-16 grid gap-5 ${cards.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {cards.map((plan, i) => (
            <motion.div
              key={plan.family}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className={`relative flex flex-col rounded-2xl border p-7 transition-all duration-300 ${
                plan.highlighted
                  ? "border-[#FF4F00]/40 bg-gradient-to-b from-[#FF4F00]/[0.08] to-transparent shadow-xl shadow-[#FF4F00]/10 hover:border-[#FF4F00]/55"
                  : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
              }`}
            >
              {plan.highlighted && (
                <div
                  className="pointer-events-none absolute left-6 right-6 top-0 h-px"
                  aria-hidden
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,79,0,0.6) 50%, transparent)",
                  }}
                />
              )}

              {plan.badge && (
                <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#FF4F00] px-3.5 py-1 text-xs font-semibold text-white shadow-lg shadow-[#FF4F00]/30">
                  {plan.badge}
                </span>
              )}

              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                {plan.name}
              </p>
              <p className="mt-1 text-sm text-zinc-500">{plan.description}</p>

              <p className="mt-7 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-white">{plan.priceLabel}</span>
                {plan.period ? <span className="text-sm text-zinc-500">{plan.period}</span> : null}
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
                to={plan.contactSales ? "/contact" : createSignupUrl()}
                className={`mt-9 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-all duration-200 ${
                  plan.highlighted
                    ? "bg-[#FF4F00] text-white shadow-lg shadow-[#FF4F00]/25 hover:bg-[#E64700] hover:shadow-[#FF4F00]/40"
                    : "border border-white/[0.12] bg-transparent text-white hover:border-white/[0.22] hover:bg-white/[0.06]"
                }`}
              >
                {plan.cta || (plan.contactSales ? "Contact sales" : "Get started free")}
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
          {MARKETING_TRIAL_FOOTER}
        </motion.p>
      </div>
    </section>
  );
}
