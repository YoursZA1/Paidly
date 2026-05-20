import { motion } from "framer-motion";

const PERSONAS = [
  {
    title: "Freelancers",
    copy: "One place for quotes, invoices, and who still owes you — without living in email threads or spreadsheet chaos.",
    icon: "✦",
  },
  {
    title: "Agencies",
    copy: "Keep client work moving: send polished documents fast and stay on top of receivables across multiple projects.",
    icon: "✦",
  },
  {
    title: "Growing businesses",
    copy: "A clear view of billing and cash flow so you can plan ahead, not just react when invoices go unpaid.",
    icon: "✦",
  },
];

export default function SocialProof() {
  return (
    <section className="border-t border-white/[0.06] px-4 py-24 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#FF4F00]"
          >
            Who it&apos;s for
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
          >
            Built for freelancers, agencies,
            <br className="hidden sm:block" /> and growing businesses
          </motion.h2>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {PERSONAS.map(({ title, copy }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.09, ease: [0.16, 1, 0.3, 1] }}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-7 text-left transition-all duration-300 hover:border-white/[0.13] hover:bg-white/[0.04]"
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                aria-hidden
                style={{
                  background:
                    "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,79,0,0.06), transparent 70%)",
                }}
              />
              <p className="text-xs font-semibold uppercase tracking-widest text-[#FF4F00]">
                {title}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400">{copy}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
