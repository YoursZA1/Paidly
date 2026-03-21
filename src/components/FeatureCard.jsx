import PropTypes from "prop-types";

export default function FeatureCard({ title, description, icon: Icon }) {
  return (
    <div className="group relative flex flex-col rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 transition hover:border-white/[0.12] hover:bg-white/[0.04]">
      {Icon ? (
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF4F00]/10 text-[#FF4F00] ring-1 ring-[#FF4F00]/20">
          <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{description}</p>
    </div>
  );
}

FeatureCard.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  icon: PropTypes.elementType,
};
