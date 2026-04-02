import { Link } from "react-router-dom";
import { createSignupUrl } from "@/utils";

export default function CTASection() {
  return (
    <section className="border-t border-white/[0.06] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-transparent px-6 py-16 text-center sm:px-10">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
          Ready to get paid faster?
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-zinc-400">
          Join thousands of businesses using Paidly — create your free account and send your first
          invoice today.
        </p>
        <Link
          to={createSignupUrl()}
          className="mt-10 inline-flex min-h-12 items-center justify-center rounded-lg bg-[#FF4F00] px-10 text-sm font-semibold text-white shadow-lg shadow-[#FF4F00]/30 transition hover:bg-[#E64700]"
        >
          Get started free
        </Link>
      </div>
    </section>
  );
}
