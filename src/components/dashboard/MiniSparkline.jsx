import PropTypes from "prop-types";

/**
 * Tiny trend shape next to a metric. No fill, no gradient — the line is the data.
 */
export default function MiniSparkline({ values = [], className = "" }) {
  const nums = values.map((v) => Number(v) || 0);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const w = 56;
  const h = 18;
  const points = nums
    .map((n, i) => {
      const x = (i / (nums.length - 1)) * w;
      const y = h - ((n - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

MiniSparkline.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number),
  className: PropTypes.string,
};
