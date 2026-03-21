const PERSONAS = [
  {
    title: "Freelancers",
    copy: "One place for quotes, invoices, and who still owes you — without living in email threads.",
  },
  {
    title: "Agencies",
    copy: "Keep client work moving: send polished documents fast and stay on top of receivables.",
  },
  {
    title: "Growing businesses",
    copy: "A clear view of billing and cash flow so you can plan ahead, not just react.",
  },
];

export default function SocialProof() {
  return (
    <section className="border-t border-white/[0.06] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Built for freelancers, agencies, and growing businesses
        </h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {PERSONAS.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 text-left"
            >
              <p className="text-sm font-semibold text-orange-400">{p.title}</p>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{p.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
