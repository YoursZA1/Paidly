import { motion } from "framer-motion";
import PropTypes from "prop-types";

export default function FeatureCard({ title, description, icon: Icon, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 transition-all duration-300 hover:border-white/[0.14] hover:bg-white/[0.04]"
      style={{ willChange: "transform" }}
    >
      {/* Hover glow */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,79,0,0.07), transparent 70%)" }}
        aria-hidden
      />

      {Icon ? (
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF4F00]/10 text-[#FF4F00] ring-1 ring-[#FF4F00]/20 transition-all duration-300 group-hover:bg-[#FF4F00]/15 group-hover:ring-[#FF4F00]/30">
          <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </div>
      ) : null}
      <h3 className="text-[0.9375rem] font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
    </motion.div>
  );
}

FeatureCard.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  icon: PropTypes.elementType,
  index: PropTypes.number,
};
