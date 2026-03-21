import { Link } from "react-router-dom";
import { createWaitlistUrl } from "@/utils";
import { PRODUCT_LAUNCH_BADGE } from "@/constants/productLaunch";

/**
 * @param {{ onLoginClick: () => void }} props
 */
export default function Hero({ onLoginClick }) {
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28 lg:px-8 lg:pt-32">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(255, 79, 0, 0.22), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(255, 255, 255, 0.06), transparent 50%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <h1 className="font-sans text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl sm:leading-[1.08] lg:text-6xl">
          Get Paid Faster.{" "}
          <span className="bg-gradient-to-r from-[#FF4F00] to-[#ff8c42] bg-clip-text text-transparent">
            Without the Admin.
          </span>
        </h1>
        <p className="mx-auto mt-4 inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-zinc-300">
          {PRODUCT_LAUNCH_BADGE}
        </p>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
          Create invoices, send quotes, and track payments in one clean platform built for modern
          businesses. Join the waitlist to get early access.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            to={createWaitlistUrl()}
            className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-lg bg-[#FF4F00] px-8 text-sm font-semibold text-white shadow-lg shadow-[#FF4F00]/30 transition hover:bg-[#E64700] sm:w-auto sm:max-w-none"
          >
            Join the waitlist
          </Link>
          <button
            type="button"
            onClick={() => onLoginClick?.()}
            className="inline-flex min-h-12 w-full max-w-xs cursor-pointer items-center justify-center rounded-lg border border-white/[0.12] bg-white/[0.04] px-8 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.07] sm:w-auto sm:max-w-none"
          >
            Log In
          </button>
        </div>
        <p className="mt-8 text-xs font-medium uppercase tracking-wider text-zinc-400">
          No spam — one email before launch.
        </p>
      </div>
    </section>
  );
}
