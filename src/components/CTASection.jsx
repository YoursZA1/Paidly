import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { createSignupUrl } from "@/utils";

export default function CTASection() {
  return (
    <section className="border-t border-white/[0.06] px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/[0.1] px-8 py-20 text-center sm:px-16"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,79,0,0.14) 0%, rgba(255,79,0,0.04) 50%, transparent 80%), " +
            "linear-gradient(to bottom, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
          boxShadow: "0 0 80px -20px rgba(255,79,0,0.2)",
        }}
      >
        {/* Top border glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          aria-hidden
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,79,0,0.5) 40%, rgba(255,255,255,0.2) 50%, rgba(255,79,0,0.5) 60%, transparent 100%)",
          }}
        />

        {/* Grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mb-5 text-xs font-semibold uppercase tracking-widest text-[#FF4F00]"
          >
            Get started today
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
          >
            Ready to get paid faster?
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-5 max-w-lg text-base text-zinc-400"
          >
            Join thousands of businesses using Paidly. Create your free account and send your first
            invoice in under 2 minutes.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              to={createSignupUrl()}
              className="group inline-flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-[#FF4F00] px-10 text-sm font-semibold text-white shadow-xl shadow-[#FF4F00]/30 transition-all duration-200 hover:bg-[#E64700] hover:shadow-[0_0_40px_rgba(255,79,0,0.45)] sm:w-auto"
            >
              Get started free
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="mt-5 text-xs font-medium uppercase tracking-widest text-zinc-600"
          >
            No credit card required
          </motion.p>
        </div>
      </motion.div>
    </section>
  );
}
