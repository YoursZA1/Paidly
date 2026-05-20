import { motion } from "framer-motion";
import { Zap, Clock, LayoutGrid } from "lucide-react";

const POINTS = [
  {
    title: "Send invoices faster",
    body: "Templates and a focused flow mean less time in spreadsheets and more time doing actual work.",
    icon: Zap,
  },
  {
    title: "Get paid on time",
    body: "See exactly what's outstanding and follow up before cash flow slips — all from one dashboard.",
    icon: Clock,
  },
  {
    title: "Stay organized without spreadsheets",
    body: "Clients, quotes, invoices, and reports in one place — without the clutter or the complexity.",
    icon: LayoutGrid,
  },
];

export default function ValueSection() {
  return (
    <section className="border-t border-white/[0.06] px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
      <div className="mx-auto grid max-w-6xl gap-16 lg:grid-cols-2 lg:items-center lg:gap-24">
        {/* Left: headline */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-[#FF4F00]">
            Why Paidly
          </p>
          <h2 className="text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
            Stop chasing payments.
            <br />
            <span className="text-zinc-400">Start running your business.</span>
          </h2>
          <p className="mt-5 text-zinc-400 leading-relaxed">
            Most invoicing tools are either too simple or too complex. Paidly sits in the sweet spot
            — powerful enough for a real business, clean enough that you&apos;ll actually use it.
          </p>
        </motion.div>

        {/* Right: points */}
        <ul className="space-y-8">
          {POINTS.map(({ title, body, icon: Icon }, i) => (
            <motion.li
              key={title}
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="flex gap-5"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-[#FF4F00] ring-1 ring-white/[0.08] transition-all duration-300">
                <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
              </div>
              <div>
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
