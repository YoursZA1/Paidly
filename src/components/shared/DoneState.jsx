import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CELEBRATION } from "@shared/ux/doneStates.js";
import { runPaidConfetti } from "@/utils/confetti";

/**
 * Paidly Done State — the UI half of shared/ux/doneStates.js.
 *
 *   ✓ Invoice sent                      ← title (what happened)
 *   INV-2026-0042 · ABC Trading          ← reference
 *   R12,500.00 · Due 12 October 2026
 *   Sent to accounts@abctrading.co.za    ← message
 *   [View invoice] [Download PDF] [...]  ← 2–3 next actions
 *   Payment status: Awaiting payment     ← what is still pending
 *   Track payment status →               ← next open loop
 *
 * variant="panel" renders a card for a page; variant="dialog" renders bare content for a Dialog.
 *
 * @param {{
 *   tone?: "success" | "pending" | "failed",
 *   title: string,
 *   reference?: { number?: string, counterparty?: string, amount?: string, meta?: string },
 *   message?: import("react").ReactNode,
 *   actions?: Array<{ label: string, onClick?: () => void, to?: string, href?: string, icon?: any, variant?: string, disabled?: boolean }>,
 *   status?: { label?: string, value: string, tone?: "success" | "pending" | "failed" | "neutral" },
 *   pending?: import("react").ReactNode,
 *   followUp?: { label: string, onClick?: () => void, to?: string, href?: string } | string | null,
 *   celebration?: string,
 *   celebrationLabel?: string,
 *   onDismiss?: () => void,
 *   variant?: "panel" | "dialog",
 *   className?: string,
 * }} props
 */
export default function DoneState({
  tone = "success",
  title,
  reference = null,
  message = null,
  actions = [],
  status = null,
  pending = null,
  followUp = null,
  celebration = CELEBRATION.NONE,
  celebrationLabel = "",
  onDismiss,
  variant = "panel",
  className = "",
}) {
  const celebrated = useRef(false);
  useEffect(() => {
    if (celebrated.current) return;
    if (celebration === CELEBRATION.STRONG || celebration === CELEBRATION.MILESTONE) {
      celebrated.current = true;
      runPaidConfetti();
    }
  }, [celebration]);

  const Icon = tone === "failed" ? AlertTriangle : tone === "pending" ? Clock : CheckCircle2;
  const iconClass =
    tone === "failed"
      ? "bg-destructive/10 text-destructive"
      : tone === "pending"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  const statusDot =
    (status?.tone || tone) === "failed"
      ? "bg-destructive"
      : (status?.tone || tone) === "success"
        ? "bg-emerald-500"
        : status?.tone === "neutral"
          ? "bg-muted-foreground"
          : "bg-amber-500";

  const shell =
    variant === "dialog"
      ? `space-y-4 ${className}`
      : `relative rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6 space-y-4 ${className}`;

  const followUpNode = (() => {
    if (!followUp) return null;
    if (typeof followUp === "string") {
      return <p className="text-sm text-muted-foreground">{followUp}</p>;
    }
    const inner = (
      <>
        {followUp.label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </>
    );
    const cls = "inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline";
    if (followUp.to) return <Link to={followUp.to} className={cls}>{inner}</Link>;
    if (followUp.href) return <a href={followUp.href} className={cls}>{inner}</a>;
    return (
      <button type="button" onClick={followUp.onClick} className={cls}>
        {inner}
      </button>
    );
  })();

  return (
    <section className={shell} role="status" aria-live="polite" data-done-state={tone}>
      {onDismiss && variant === "panel" ? (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold leading-tight text-foreground">{title}</h2>
          {celebration !== CELEBRATION.NONE && celebrationLabel ? (
            <p className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {celebrationLabel}
            </p>
          ) : null}
        </div>
      </div>

      {reference && (reference.number || reference.counterparty || reference.amount) ? (
        <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
          {reference.number || reference.counterparty ? (
            <p className="text-sm text-muted-foreground">
              {[reference.number, reference.counterparty].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {reference.amount ? (
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{reference.amount}</p>
          ) : null}
          {reference.meta ? <p className="text-sm text-muted-foreground">{reference.meta}</p> : null}
        </div>
      ) : null}

      {message ? <div className="text-sm text-foreground/90">{message}</div> : null}

      {actions.length ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {actions.slice(0, 3).map((action, index) => {
            const ActionIcon = action.icon;
            const content = (
              <>
                {ActionIcon ? <ActionIcon className="h-4 w-4" aria-hidden="true" /> : null}
                {action.label}
              </>
            );
            const variantName = action.variant || (index === 0 ? "default" : "outline");
            if (action.to) {
              return (
                <Button key={action.label} asChild variant={variantName} className="gap-2" disabled={action.disabled}>
                  <Link to={action.to}>{content}</Link>
                </Button>
              );
            }
            if (action.href) {
              return (
                <Button key={action.label} asChild variant={variantName} className="gap-2">
                  <a href={action.href}>{content}</a>
                </Button>
              );
            }
            return (
              <Button
                key={action.label}
                type="button"
                variant={variantName}
                className="gap-2"
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {content}
              </Button>
            );
          })}
        </div>
      ) : null}

      {status || pending || followUpNode ? (
        <div className="space-y-1.5 border-t border-border/70 pt-3">
          {status ? (
            <p className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${statusDot}`} aria-hidden="true" />
              <span className="text-muted-foreground">{status.label || "Status"}:</span>{" "}
              <span className="font-medium text-foreground">{status.value}</span>
            </p>
          ) : null}
          {pending ? <p className="text-sm text-muted-foreground">{pending}</p> : null}
          {followUpNode}
        </div>
      ) : null}
    </section>
  );
}
