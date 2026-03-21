export default function ProductPreview() {
  return (
    <section id="product" className="scroll-mt-24 border-t border-white/[0.06] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
            Built for clarity and control
          </h2>
          <p className="mt-4 text-base text-zinc-400 sm:text-lg">
            A clean dashboard that shows you exactly what matters — no clutter, no confusion.
          </p>
        </div>

        <div
          className="relative mx-auto mt-14 max-w-5xl rounded-xl border border-white/[0.1] bg-zinc-950 p-1 shadow-2xl shadow-black/50 ring-1 ring-white/[0.06]"
          style={{
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.04) inset, 0 25px 50px -12px rgba(0,0,0,0.6), 0 0 80px -20px rgba(255, 79, 0, 0.15)",
          }}
        >
          <div className="flex items-center gap-2 border-b border-white/[0.08] bg-zinc-900/80 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-red-500/80" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
            <span className="ml-4 flex-1 truncate rounded-md bg-black/40 px-3 py-1 text-center text-xs text-zinc-500">
              app.paidly.co.za/dashboard
            </span>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-6">
            <div className="rounded-lg border border-white/[0.06] bg-gradient-to-br from-white/[0.06] to-transparent p-4 sm:col-span-1">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total revenue</p>
              <p className="mt-2 text-2xl font-semibold text-white">R 128,400</p>
              <p className="mt-1 text-xs text-emerald-400/90">+12% vs last month</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 sm:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Outstanding</p>
              <div className="mt-4 flex h-24 items-end gap-1">
                {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-[#FF4F00]/50"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 sm:col-span-3">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <p className="text-sm font-medium text-white">Recent invoices</p>
                <span className="rounded-md bg-[#FF4F00]/15 px-2 py-0.5 text-xs font-medium text-[#FF8C42]">
                  Paid
                </span>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-zinc-400">
                <li className="flex justify-between border-b border-white/[0.04] py-2">
                  <span>INV-1042 — Acme Studio</span>
                  <span className="text-zinc-300">R 4,500</span>
                </li>
                <li className="flex justify-between border-b border-white/[0.04] py-2">
                  <span>INV-1041 — Northwind Ltd</span>
                  <span className="text-zinc-300">R 12,200</span>
                </li>
                <li className="flex justify-between py-2">
                  <span>INV-1040 — Cape Designs</span>
                  <span className="text-zinc-300">R 8,950</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
