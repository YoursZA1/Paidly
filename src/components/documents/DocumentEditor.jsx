import PropTypes from "prop-types";
import { cn } from "@/lib/utils";

/**
 * Two-column document layout: main form (left) + sticky summary (right).
 * @param {{
 *   title?: string,
 *   description?: string,
 *   summaryTitle?: string,
 *   form: React.ReactNode,
 *   summary: React.ReactNode,
 *   className?: string,
 * }} props
 */
export function DocumentEditor({ title, description, summaryTitle = "Summary", form, summary, className }) {
  const headingId = "document-editor-title";
  const summaryId = "document-editor-summary";

  return (
    <div className={cn("w-full min-w-0 space-y-6", className)}>
      {(title || description) && (
        <header className="space-y-1">
          {title ? (
            <h1 id={headingId} className="text-2xl font-semibold tracking-tight md:text-3xl">
              {title}
            </h1>
          ) : null}
          {description ? <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
        </header>
      )}
      <div
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-start"
        role="presentation"
      >
        <section
          className="min-w-0 space-y-6"
          aria-labelledby={title ? headingId : undefined}
          aria-label={title ? undefined : "Document details"}
        >
          {form}
        </section>
        <aside
          id={summaryId}
          aria-label={summaryTitle}
          className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm ring-1 ring-border/40 lg:sticky lg:top-6 lg:self-start"
        >
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{summaryTitle}</h2>
          {summary}
        </aside>
      </div>
    </div>
  );
}

DocumentEditor.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  summaryTitle: PropTypes.string,
  form: PropTypes.node.isRequired,
  summary: PropTypes.node.isRequired,
  className: PropTypes.string,
};
