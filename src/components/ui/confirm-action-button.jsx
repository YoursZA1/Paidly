"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { Check, Star, Archive, XCircle, Ban, Send, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const HINGE = "3px 6px";
const LID_OPEN = -35;
const WALL_TOP = 6;
const WALL_TOP_OPEN = 13.5;
const WALL_BASE = 20;

const HOLD = { confirmed: 1400, cancelled: 600 };

const EASE = [0.32, 0.72, 0, 1];
const EASE_LID = [0.34, 1.1, 0.64, 1];

const WIDTH = { duration: 0.62, ease: EASE };
const LID = { duration: 0.6, ease: EASE_LID };
const WALL = { duration: 0.56, ease: EASE };
const IN = { duration: 0.44, ease: EASE, delay: 0.14 };
const OUT = { duration: 0.3, ease: EASE };
const TAP = { duration: 0.2, ease: EASE };
const SWAP = { duration: 0.22, ease: EASE };
const SETTLE = { duration: 0.45, ease: EASE };
const PRESS = {
  type: "spring",
  stiffness: 520,
  damping: 18,
  mass: 0.5,
};
const INSTANT = { duration: 0 };

const SURFACE = "bg-[#F4F4F9] dark:bg-[#262626]";
const RECESS = "bg-[#E7E7EF] dark:bg-[#1B1B1B]";
const GLYPH = "text-[#868593] dark:text-[#9B9AA7]";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[#868593] focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const ACCENT = "#FF5F2E";

const LIFT =
  "shadow-[0_0.5px_1px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.08),inset_0_0.5px_0_rgba(255,255,255,0.9)] dark:shadow-[0_0.5px_1px_rgba(0,0,0,0.35),0_1.5px_4px_rgba(0,0,0,0.25),inset_0_0.5px_0_rgba(255,255,255,0.07)]";

const ACTION_PRESETS = {
  delete: {
    label: "Delete",
    confirmLabel: "Confirm delete",
    cancelLabel: "Cancel",
    confirmedStatus: "Deleted",
    cancelledStatus: "Kept",
    kind: "delete",
  },
  remove: {
    label: "Remove",
    confirmLabel: "Confirm remove",
    cancelLabel: "Cancel",
    confirmedStatus: "Removed",
    cancelledStatus: "Kept",
    kind: "delete",
  },
  archive: {
    label: "Archive",
    confirmLabel: "Confirm archive",
    cancelLabel: "Cancel",
    confirmedStatus: "Archived",
    cancelledStatus: "Kept",
    kind: "icon",
    Icon: Archive,
  },
  void: {
    label: "Void",
    confirmLabel: "Confirm void",
    cancelLabel: "Cancel",
    confirmedStatus: "Voided",
    cancelledStatus: "Kept",
    kind: "icon",
    Icon: Ban,
  },
  cancel: {
    label: "Cancel",
    confirmLabel: "Confirm cancel",
    cancelLabel: "Keep",
    confirmedStatus: "Cancelled",
    cancelledStatus: "Kept",
    kind: "icon",
    Icon: XCircle,
  },
  star: {
    label: "Set as default",
    confirmLabel: "Confirm default",
    cancelLabel: "Cancel",
    confirmedStatus: "Default set",
    cancelledStatus: "Cancelled",
    kind: "icon",
    Icon: Star,
  },
  send: {
    label: "Send",
    confirmLabel: "Confirm send",
    cancelLabel: "Cancel",
    confirmedStatus: "Sent",
    cancelledStatus: "Kept",
    kind: "icon",
    Icon: Send,
  },
  edit: {
    label: "Edit",
    confirmLabel: "Confirm edit",
    cancelLabel: "Cancel",
    confirmedStatus: "Confirmed",
    cancelledStatus: "Cancelled",
    kind: "icon",
    Icon: Pencil,
  },
  custom: {
    label: "Confirm action",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    confirmedStatus: "Done",
    cancelledStatus: "Cancelled",
    kind: "icon",
    Icon: Check,
  },
};

const SIZES = {
  sm: { tile: 32, panel: 72, root: "h-8 rounded-xl", trigger: "h-8 w-8 rounded-xl", icon: 16, circle: "h-6 w-6", stroke: 14 },
  md: { tile: 48, panel: 84, root: "h-12 rounded-2xl", trigger: "h-12 w-12 rounded-2xl", icon: 20, circle: "h-7 w-7", stroke: 14 },
};

const panelMotion = {
  hidden: { opacity: 0, x: -6, transition: OUT },
  shown: { opacity: 1, x: 0, transition: { ...IN, staggerChildren: 0.07 } },
};

const circleMotion = {
  hidden: { opacity: 0, scale: 0.9, transition: OUT },
  shown: { opacity: 1, scale: 1, transition: IN },
};

function ActionCircle({ label, onClick, children, reduced, circleClass }) {
  return (
    <motion.div className="flex" variants={reduced ? undefined : circleMotion}>
      <motion.button
        type="button"
        aria-label={label}
        onClick={onClick}
        whileHover={reduced ? undefined : { scale: 1.03 }}
        whileTap={reduced ? undefined : { scale: 0.84 }}
        transition={PRESS}
        className={cn(
          "grid place-items-center rounded-full transition-colors duration-200 hover:bg-[#FAFAFD] dark:hover:bg-[#2C2C2C]",
          FOCUS,
          SURFACE,
          LIFT,
          circleClass
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          width="14"
          height="14"
          stroke="currentColor"
          strokeWidth="3.5"
        >
          {children}
        </svg>
      </motion.button>
    </motion.div>
  );
}

/**
 * Expand-to-confirm control for consequential icon actions
 * (delete, remove, void, archive, send, set-default, …).
 *
 * Use this for action chips that should ask before running.
 * Do not use for primary form CTAs (Save / Continue / Submit).
 */
export function ConfirmActionButton({
  action = "delete",
  size = "md",
  label,
  confirmLabel,
  cancelLabel,
  confirmedStatus,
  cancelledStatus,
  icon: IconProp,
  onConfirm,
  onCancel,
  disabled = false,
  className,
  ...props
}) {
  const preset = ACTION_PRESETS[action] || ACTION_PRESETS.custom;
  const metrics = SIZES[size] || SIZES.md;
  const reduced = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("idle");
  const trigger = useRef(null);
  const timing = (transition) => (reduced ? INSTANT : transition);

  const resolvedLabel = label || preset.label;
  const resolvedConfirm = confirmLabel || preset.confirmLabel;
  const resolvedCancel = cancelLabel || preset.cancelLabel;
  const resolvedConfirmed = confirmedStatus || preset.confirmedStatus;
  const resolvedCancelled = cancelledStatus || preset.cancelledStatus;
  const kind = preset.kind;
  const Icon = IconProp || preset.Icon || Check;

  const top = useMotionValue(WALL_TOP);
  const wall = useTransform(top, (y) => WALL_BASE - y);
  const bin = useMotionTemplate`M19 ${top}v${wall}a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V${top}`;
  const settle = useMotionValue(1);

  useEffect(() => {
    if (kind !== "delete") return undefined;
    const walls = animate(
      top,
      open ? WALL_TOP_OPEN : WALL_TOP,
      reduced ? INSTANT : WALL
    );
    return () => walls.stop();
  }, [open, reduced, top, kind]);

  useEffect(() => {
    if (status === "idle") return undefined;
    const nudge =
      status === "cancelled" && !reduced
        ? animate(settle, [1, 0.86, 1], SETTLE)
        : null;
    const done = setTimeout(() => setStatus("idle"), HOLD[status]);
    return () => {
      nudge?.stop();
      clearTimeout(done);
    };
  }, [status, reduced, settle]);

  const resolve = (next) => {
    setOpen(false);
    setStatus(next);
    trigger.current?.focus();
    (next === "confirmed" ? onConfirm : onCancel)?.();
  };

  return (
    <motion.div
      data-slot="confirm-action-button"
      data-action={action}
      data-state={open ? "open" : "closed"}
      data-status={status}
      className={cn(
        "relative overflow-visible",
        metrics.root,
        SURFACE,
        GLYPH,
        disabled && "pointer-events-none opacity-50",
        className
      )}
      animate={{ width: open ? metrics.tile + metrics.panel : metrics.tile }}
      transition={timing(WIDTH)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) resolve("cancelled");
      }}
      {...props}
    >
      <motion.button
        ref={trigger}
        type="button"
        aria-label={resolvedLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) return resolve("cancelled");
          setStatus("idle");
          setOpen(true);
        }}
        whileTap={reduced ? undefined : { scale: 0.94 }}
        transition={TAP}
        className={cn("relative z-10 grid place-items-center", metrics.trigger, FOCUS)}
      >
        <AnimatePresence mode="wait" initial={false}>
          {status === "confirmed" ? (
            <motion.svg
              key="done"
              viewBox="0 0 24 24"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              width={metrics.icon}
              height={metrics.icon}
              stroke={ACCENT}
              strokeWidth="2.5"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={timing(SWAP)}
            >
              <motion.path
                d="M4 12.5 9.5 18 20 7"
                initial={reduced ? undefined : { pathLength: 0 }}
                animate={reduced ? undefined : { pathLength: 1 }}
                transition={SETTLE}
              />
            </motion.svg>
          ) : kind === "delete" ? (
            <motion.svg
              key="bin"
              viewBox="0 0 24 24"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              width={metrics.icon}
              height={metrics.icon}
              stroke="currentColor"
              strokeWidth="2"
              className="overflow-visible"
              style={{ scale: settle }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={timing(SWAP)}
            >
              <motion.path d={bin} />
              <motion.g
                style={{ transformBox: "view-box", transformOrigin: HINGE }}
                animate={{ rotate: open ? LID_OPEN : 0 }}
                transition={timing(LID)}
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </motion.g>
            </motion.svg>
          ) : (
            <motion.span
              key="icon"
              className="grid place-items-center"
              style={{ scale: settle }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={timing(SWAP)}
            >
              <Icon className="shrink-0" style={{ width: metrics.icon, height: metrics.icon }} strokeWidth={2} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <span role="status" aria-live="polite" className="sr-only">
        {status === "confirmed"
          ? resolvedConfirmed
          : status === "cancelled"
            ? resolvedCancelled
            : ""}
      </span>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            style={{ width: metrics.panel }}
            className={cn(
              "absolute inset-y-0 right-0 flex items-center justify-center gap-1.5 sm:gap-2",
              metrics.root.includes("rounded-xl") ? "rounded-xl" : "rounded-2xl",
              RECESS
            )}
            variants={reduced ? undefined : panelMotion}
            initial="hidden"
            animate="shown"
            exit="hidden"
          >
            <span
              aria-hidden
              className={cn(
                "absolute -left-1 top-1/2 z-20 h-2.5 w-1.5 -translate-y-1/2 [clip-path:polygon(100%_0,0_50%,100%_100%)]",
                RECESS
              )}
            />
            <ActionCircle
              label={resolvedConfirm}
              onClick={() => resolve("confirmed")}
              reduced={reduced}
              circleClass={metrics.circle}
            >
              <path d="M4 12.5 9.5 18 20 7" stroke={ACCENT} />
            </ActionCircle>
            <ActionCircle
              label={resolvedCancel}
              onClick={() => resolve("cancelled")}
              reduced={reduced}
              circleClass={metrics.circle}
            >
              <path d="M6 6 18 18M18 6 6 18" />
            </ActionCircle>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Back-compat wrapper matching the provided DeleteButton API. */
export function DeleteButton({ onConfirm, onCancel, className, ...props }) {
  return (
    <ConfirmActionButton
      action="delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
      className={className}
      {...props}
    />
  );
}

export default ConfirmActionButton;
