import React from "react";

/**
 * Rich toast description after emailing an invoice or quote.
 * Highlights current step (Sent) and shows the natural progression.
 */
export function documentSendSuccessDescription({ mode, recipientEmail }) {
  const stages = mode === "quote" ? ["Sent", "Viewed", "Accepted"] : ["Sent", "Viewed", "Paid"];

  return (
    <div className="space-y-2">
      <p className="leading-snug">
        {recipientEmail ? (
          <>
            Delivered to <span className="font-medium">{recipientEmail}</span>.
          </>
        ) : (
          "Email delivered."
        )}
      </p>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs opacity-95">
        <span className="sr-only">Status progression:</span>
        {stages.map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && (
              <span className="opacity-70" aria-hidden="true">
                /
              </span>
            )}
            <span
              className={
                i === 0
                  ? "font-semibold underline decoration-white/50 underline-offset-2"
                  : "opacity-80"
              }
            >
              {label}
            </span>
          </React.Fragment>
        ))}
      </div>
      <p className="text-[11px] opacity-80 leading-tight">
        {mode === "quote"
          ? "Update to viewed when they open the link; accepted when they approve."
          : "Move to viewed when they open the link; mark paid when you record payment."}
      </p>
    </div>
  );
}
