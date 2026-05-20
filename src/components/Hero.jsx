import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl, createSignupUrl } from "@/utils";

const FADE_UP = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

const STATS = [
  { value: "2 min", label: "to first invoice" },
  { value: "R0", label: "to get started" },
  { value: "100%", label: "browser-based" },
];

/**
 * @param {{ onLoginClick: () => void }} props
 */
export default function Hero({ onLoginClick }) {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-32 lg:px-8 lg:pt-36">
      {/* Layered ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% -5%, rgba(255,79,0,0.2) 0%, transparent 60%), " +
            "radial-gradient(ellipse 50% 35% at 85% 15%, rgba(255,255,255,0.05) 0%, transparent 50%), " +
            "radial-gradient(ellipse 40% 30% at 10% 80%, rgba(255,79,0,0.06) 0%, transparent 50%)",
        }}
      />
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto max-w-4xl text-center">
        {/* Headline */}
        <motion.h1
          initial="hidden"
          animate="visible"
          variants={FADE_UP}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-sans text-5xl font-bold leading-[1.06] tracking-tight text-white sm:text-6xl lg:text-[4.5rem]"
        >
          Get Paid Faster.{" "}
          <br className="hidden sm:block" />
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(135deg, #FF6B2B 0%, #FF4F00 40%, #ff8c42 80%, #ffc089 100%)",
            }}
          >
            Without the Admin.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial="hidden"
          animate="visible"
          variants={FADE_UP}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-[1.1rem]"
        >
          Create invoices, send quotes, and track payments — all in one clean platform built for
          modern South African businesses.
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={FADE_UP}
          transition={{ duration: 0.6, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
        >
          <Link
            to={createSignupUrl()}
            className="group relative inline-flex min-h-12 w-full max-w-xs items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#FF4F00] px-8 text-sm font-semibold text-white shadow-lg shadow-[#FF4F00]/30 transition-all duration-200 hover:bg-[#E64700] hover:shadow-[0_0_32px_rgba(255,79,0,0.45)] sm:w-auto sm:max-w-none"
          >
            Get started free
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <button
            type="button"
            onClick={() => onLoginClick?.()}
            className="inline-flex min-h-12 w-full max-w-xs cursor-pointer items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.04] px-8 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:border-white/[0.2] hover:bg-white/[0.08] sm:w-auto sm:max-w-none"
          >
            Log In
          </button>
        </motion.div>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={FADE_UP}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mt-5 text-xs font-medium uppercase tracking-widest text-zinc-600"
        >
          No credit card required
        </motion.p>

        {/* Stats row */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={FADE_UP}
          transition={{ duration: 0.55, delay: 0.38, ease: [0.16, 1, 0.3, 1] }}
          className="mt-14 flex flex-wrap items-start justify-center gap-10 border-t border-white/[0.06] pt-12 sm:gap-16"
        >
          {STATS.map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                {label}
              </p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
