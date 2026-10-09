import { motion } from "framer-motion";
import { FileText, Users, Wallet, Store, Briefcase, LineChart } from "lucide-react";
import FeatureCard from "./FeatureCard";

const FEATURES = [
  {
    title: "Invoices and quotes",
    description: "Send a branded invoice or quote in minutes. When a quote is accepted, turn it into an invoice without typing it again.",
    icon: FileText,
  },
  {
    title: "Clients",
    description: "Keep every customer in one list. Import an existing spreadsheet, then pick the same clients on invoices and quotes.",
    icon: Users,
  },
  {
    title: "Get paid",
    description: "See who still owes you, send a reminder, and take payment from the invoice — online, in cash, or on a card machine.",
    icon: Wallet,
  },
  {
    title: "Products and the till",
    description: "Sell from a catalogue. Shops can ring up a sale on the till, with stock moving only after the payment is confirmed.",
    icon: Store,
  },
  {
    title: "Payroll and leave",
    description: "Payslips and leave sit with the rest of the business, so staff pay is not a second spreadsheet.",
    icon: Briefcase,
  },
  {
    title: "Cash flow",
    description: "See what is outstanding, overdue, and still to come in — invoice income and till sales, without counting the same rand twice.",
    icon: LineChart,
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
            Everything you need to get paid and run the business
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-zinc-400"
          >
            Invoices, clients, the till, and payroll in one place. Plan limits are on the pricing section below.
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
