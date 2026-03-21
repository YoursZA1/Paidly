import { Zap, Clock, LayoutGrid } from "lucide-react";

const POINTS = [
  {
    title: "Send invoices faster",
    body: "Templates and a focused flow mean less time in spreadsheets.",
    icon: Zap,
  },
  {
    title: "Get paid on time",
    body: "See what’s outstanding and follow up before cash flow slips.",
    icon: Clock,
  },
  {
    title: "Stay organized without spreadsheets",
    body: "Clients, quotes, and invoices in one place — without the clutter.",
    icon: LayoutGrid,
  },
];

export default function ValueSection() {
  return (
    <section className="border-t border-white/[0.06] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:gap-16 lg:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
            Stop chasing payments.
            <br />
            <span className="text-zinc-400">Start running your business.</span>
          </h2>
        </div>
        <ul className="space-y-8">
          {POINTS.map(({ title, body, icon: Icon }) => (
            <li key={title} className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[#FF4F00] ring-1 ring-white/10">
                <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
              </div>
              <div>
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-300">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
