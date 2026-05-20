import { motion } from "framer-motion";

const BAR_HEIGHTS = [38, 62, 44, 78, 52, 88, 68, 82, 58, 92, 72, 85];

export default function ProductPreview() {
  return (
    <section
      id="product"
      className="relative scroll-mt-24 overflow-hidden border-t border-white/[0.06] px-4 py-24 sm:px-6 lg:px-8 lg:py-32"
    >
      {/* Background glow behind the preview */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 opacity-30"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(255,79,0,0.15), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#FF4F00]"
          >
            Product
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl"
          >
            Built for clarity and control
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-base text-zinc-400 sm:text-lg"
          >
            A clean dashboard that shows you exactly what matters — no clutter, no confusion.
          </motion.p>
        </div>

        {/* Dashboard mock */}
        <motion.div
          initial={{ opacity: 0, y: 48, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto mt-16 max-w-5xl"
        >
          {/* Outer glow ring */}
          <div
            className="absolute -inset-px rounded-2xl"
            aria-hidden
            style={{
              background:
                "linear-gradient(135deg, rgba(255,79,0,0.25) 0%, rgba(255,255,255,0.05) 50%, rgba(255,79,0,0.1) 100%)",
              borderRadius: "inherit",
              padding: "1px",
              WebkitMask:
                "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
            }}
          />

          <div
            className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-zinc-950 shadow-2xl"
            style={{
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.04) inset, 0 32px 64px -16px rgba(0,0,0,0.7), 0 0 100px -20px rgba(255,79,0,0.18)",
            }}
          >
            {/* Browser chrome */}
            <div className="flex items-center gap-2 border-b border-white/[0.08] bg-zinc-900/80 px-5 py-3.5">
              <span className="h-3 w-3 rounded-full bg-red-500/80" />
              <span className="h-3 w-3 rounded-full bg-amber-500/80" />
              <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
              <span className="ml-4 flex-1 truncate rounded-md bg-black/40 px-3 py-1.5 text-center text-xs text-zinc-500">
                app.paidly.co.za/dashboard
              </span>
            </div>

            {/* Dashboard content */}
            <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-7">
              {/* Revenue card */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border border-white/[0.07] bg-gradient-to-br from-[#FF4F00]/10 to-transparent p-5 sm:col-span-1"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Total Revenue
                </p>
                <p className="mt-2.5 text-2xl font-bold text-white">R 128,400</p>
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-400">
                  <span>↑ 12%</span>
                  <span className="text-zinc-500 font-normal">vs last month</span>
                </p>
              </motion.div>

              {/* Bar chart card */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 sm:col-span-2"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Outstanding This Quarter
                </p>
                <div className="mt-4 flex h-20 items-end gap-1">
                  {BAR_HEIGHTS.map((h, i) => (
                    <motion.div
                      key={i}
                      className="flex-1 rounded-t"
                      style={{
                        height: 0,
                        background:
                          i === BAR_HEIGHTS.length - 1
                            ? "linear-gradient(to top, #FF4F00, #ff8c42)"
                            : "rgba(255,79,0,0.35)",
                      }}
                      whileInView={{ height: `${h}%` }}
                      viewport={{ once: true }}
                      transition={{
                        duration: 0.6,
                        delay: 0.5 + i * 0.04,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    />
                  ))}
                </div>
              </motion.div>

              {/* Invoices table */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 sm:col-span-3"
              >
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <p className="text-sm font-semibold text-white">Recent Invoices</p>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                      3 Paid
                    </span>
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
                      1 Overdue
                    </span>
                  </div>
                </div>
                <ul className="mt-2 divide-y divide-white/[0.04] text-sm">
                  {[
                    { id: "INV-1042", client: "Acme Studio", amount: "R 4,500", status: "Paid" },
                    { id: "INV-1041", client: "Northwind Ltd", amount: "R 12,200", status: "Paid" },
                    { id: "INV-1040", client: "Cape Designs", amount: "R 8,950", status: "Overdue" },
                  ].map(({ id, client, amount, status }) => (
                    <li key={id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500">{id}</span>
                        <span className="text-zinc-300">{client}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-zinc-200">{amount}</span>
                        <span
                          className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline-flex ${
                            status === "Paid"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
