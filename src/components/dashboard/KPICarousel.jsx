import { useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";

const CARD_WIDTH = 276; // 260px + 16px gap
const DRAG_THRESHOLD = 50;

/**
 * Framer Motion Carousel for KPI cards — swipe horizontally on mobile.
 * On desktop (md+), renders children in a grid (no carousel).
 */
export default function KPICarousel({ children, className = "" }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const x = useMotionValue(0);
  const containerRef = useRef(null);
  const childCount = Array.isArray(children) ? children.length : 1;

  const handleDragEnd = (_, info) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const direction = velocity < -100 ? 1 : velocity > 100 ? -1 : offset < -DRAG_THRESHOLD ? 1 : offset > DRAG_THRESHOLD ? -1 : 0;
    let nextIndex = currentIndex + direction;
    nextIndex = Math.max(0, Math.min(nextIndex, childCount - 1));
    setCurrentIndex(nextIndex);
    animate(x, -nextIndex * CARD_WIDTH, { type: "spring", stiffness: 300, damping: 30 });
  };

  return (
    <>
      {/* Mobile: Framer Motion drag carousel */}
      <div className={`md:hidden overflow-hidden ${className}`} ref={containerRef}>
        <motion.div
          className="flex gap-4 pb-2"
          style={{ x }}
          drag="x"
          dragConstraints={{ left: -(childCount - 1) * CARD_WIDTH, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
        >
          {Array.isArray(children)
            ? children.map((child, i) => (
                <div key={i} className="shrink-0 w-[260px] snap-center">
                  {child}
                </div>
              ))
            : children}
        </motion.div>
        {/* Page indicators — 48px touch targets */}
        {childCount > 1 && (
          <div className="flex justify-center gap-1 mt-3">
            {Array.from({ length: childCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to card ${i + 1}`}
                onClick={() => {
                  setCurrentIndex(i);
                  animate(x, -i * CARD_WIDTH, { type: "spring", stiffness: 300, damping: 30 });
                }}
                className="min-w-[48px] min-h-[48px] flex items-center justify-center touch-manipulation -m-2"
              >
                <span
                  className={`block rounded-full transition-all ${
                    i === currentIndex ? "w-6 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-muted-foreground/40"
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
