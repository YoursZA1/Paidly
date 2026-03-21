import { Link } from "react-router-dom";
import { createWaitlistUrl } from "@/utils";
import { PRODUCT_LAUNCH_BADGE } from "@/constants/productLaunch";

export default function CTASection() {
  return (
    <section className="border-t border-white/[0.06] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-transparent px-6 py-16 text-center sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#FF8C42]">{PRODUCT_LAUNCH_BADGE}</p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
          Be first in line when we open the doors
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-zinc-400">
          Add your email to the waitlist — we&apos;ll only reach out with launch news and how to get
          started.
        </p>
        <Link
          to={createWaitlistUrl()}
          className="mt-10 inline-flex min-h-12 items-center justify-center rounded-lg bg-[#FF4F00] px-10 text-sm font-semibold text-white shadow-lg shadow-[#FF4F00]/30 transition hover:bg-[#E64700]"
        >
          Join the waitlist
        </Link>
      </div>
    </section>
  );
}
