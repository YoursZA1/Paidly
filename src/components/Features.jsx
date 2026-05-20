import { motion } from "framer-motion";
import { FileText, Wallet, Users, ArrowRightLeft, LineChart, Sparkles } from "lucide-react";
import FeatureCard from "./FeatureCard";

const FEATURES = [
  {
    title: "Create Invoices",
    description: "Send professional invoices in minutes — not hours. Templates, line items, and branded PDFs ready to go.",
    icon: FileText,
  },
  {
    title: "Track Payments",
    description: "Know exactly who owes you and when. Mark payments, send reminders, never lose track of a rand.",
    icon: Wallet,
  },
  {
    title: "Manage Clients",
    description: "Keep all your customer details in one clean place. Search, filter, and see every interaction at a glance.",
    icon: Users,
  },
  {
    title: "Quotes to Invoices",
    description: "Convert accepted quotes into invoices instantly — no re-entering data, no friction.",
    icon: ArrowRightLeft,
  },
  {
    title: "Cash Flow Visibility",
    description: "Understand your income at a glance. See what's outstanding, overdue, or coming in next month.",
    icon: LineChart,
  },
  {
    title: "Professional output",
    description: "Branded PDFs, a clean dashboard, and a workflow that gets out of your way so you can focus on work.",
    icon: Sparkles,
  },
];

export default function Features() {
  return (
    <section
      id="features"
      className="relative scroll-mt-24 border-t border-white/[0.06] px-4 py-24 sm:px-6 lg:px-8 lg:py-32"
    >
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#FF4F00]"
          >
            Features
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl"
          >
            Everything you need to run your billing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-zinc-400"
          >
            A focused set of tools that cover the full invoicing lifecycle — nothing bloated, nothing missing.
          </motion.p>
        </div>

        {/* Cards grid */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {FEATURES.map((f, i) => (
            <FeatureCard
              key={f.title}
              title={f.title}
              description={f.description}
              icon={f.icon}
              index={i}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
