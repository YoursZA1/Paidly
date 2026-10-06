import { format, isValid, parseISO } from "date-fns";

/** Shared page background for client-facing document links. */
export const PUBLIC_PORTAL_BG = "min-h-screen bg-[#eef1f4] text-slate-900";

export function formatPortalDate(raw) {
  if (!raw) return "";
  const d = typeof raw === "string" ? parseISO(raw) : new Date(raw);
  return isValid(d) ? format(d, "d MMMM yyyy") : "";
}

/**
 * Centered message for a public document link: loading is handled by the page,
 * this is the verify / error / empty state.
 */
export function PublicPortalMessage({ icon, title, children }) {
  return (
    <div className={`flex items-center justify-center p-4 ${PUBLIC_PORTAL_BG}`}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.45)]">
        {icon ? <div className="mb-4 flex justify-center text-primary">{icon}</div> : null}
        {title ? <h1 className="text-center text-xl font-semibold text-slate-900">{title}</h1> : null}
        <div className={title ? "mt-2" : ""}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Client portal for an invoice, quote, or payslip.
 * One bar (top on a wide screen, bottom on a phone) and the document underneath.
 */
export default function PublicDocumentPortal({
  companyName,
  documentLabel,
  documentNumber,
  summary,
  amountLabel = "Due",
  amount,
  meta,
  actions,
  children,
}) {
  return (
    <div className={PUBLIC_PORTAL_BG}>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 shadow-[0_-10px_30px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md sm:sticky sm:inset-auto sm:top-0 sm:z-30 sm:border-b sm:border-t-0 sm:shadow-none">
        <div className="mx-auto flex max-w-[920px] items-center gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-6 sm:px-6 sm:py-3.5 sm:pb-3.5">
          <div className="min-w-0 flex-1">
            {companyName ? (
              <p className="hidden truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-primary sm:block">
                {companyName}
              </p>
            ) : null}
            <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">
              {documentLabel}
              {documentNumber ? <span className="font-medium text-slate-500"> {documentNumber}</span> : null}
            </p>
            {summary ? <p className="hidden truncate text-sm text-slate-500 sm:block">{summary}</p> : null}
            {amount ? <p className="text-sm font-semibold tabular-nums text-slate-900 sm:hidden">{amount}</p> : null}
          </div>
          {amount ? (
            <div className="hidden shrink-0 text-right sm:block">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">{amountLabel}</p>
              <p className="text-xl font-semibold tabular-nums leading-tight text-slate-900">{amount}</p>
              {meta ? <p className="text-xs text-slate-500">{meta}</p> : null}
            </div>
          ) : null}
          {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        </div>
      </div>
      <main className="mx-auto w-full max-w-[920px] px-3 pb-36 pt-4 sm:px-6 sm:pb-12 sm:pt-8">{children}</main>
    </div>
  );
}

export function PublicDocumentSheet({ children, className = "" }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/80 ${className}`}
    >
      {children}
    </div>
  );
}
