import { cn } from '@/lib/utils';

/**
 * Page Template System — three zones for dashboard list/index pages:
 *
 * 1. Header — title + description + primary actions (`PageTemplate.Header` + `PageHeader` or custom row)
 * 2. Content — main table, grid, or form (`PageTemplate.Body` children)
 * 3. Side panel — filters, counts, summary (`PageTemplate.Body` `sidePanel` prop)
 *
 * Use `embedded` inside shells that already provide padding/background (e.g. `AdminLayout`).
 * Target adoption: Invoices, Quotes, Clients, Services, Affiliates (and new list pages).
 *
 * @param {{ children: React.ReactNode, className?: string, embedded?: boolean }} props
 */
function PageTemplateRoot({ children, className, embedded = false }) {
  if (embedded) {
    return <div className={cn('w-full min-w-0', className)}>{children}</div>;
  }
  return (
    <div className={cn('min-h-screen w-full min-w-0 bg-background mobile-page', className)}>
      <div className="responsive-page-shell py-4 sm:py-6 md:py-8">{children}</div>
    </div>
  );
}

function PageTemplateHeader({ children, className }) {
  return <div className={cn('mb-4 sm:mb-6 md:mb-8', className)}>{children}</div>;
}

PageTemplateHeader.displayName = 'PageTemplate.Header';

/**
 * @param {{
 *   children: React.ReactNode,
 *   sidePanel?: React.ReactNode,
 *   sidePanelClassName?: string,
 *   mainClassName?: string,
 *   className?: string,
 * }} props
 */
function PageTemplateBody({ children, sidePanel, sidePanelClassName, mainClassName, className }) {
  const hasSide = sidePanel != null && sidePanel !== false;

  return (
    <div
      className={cn(
        'grid w-full min-w-0 gap-4 md:gap-6',
        hasSide && 'lg:grid-cols-[minmax(0,1fr)_minmax(240px,340px)] lg:items-start',
        className
      )}
    >
      <div className={cn('min-w-0', mainClassName)}>{children}</div>
      {hasSide ? (
        <aside
          className={cn(
            'min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-6 lg:self-start',
            sidePanelClassName
          )}
        >
          {sidePanel}
        </aside>
      ) : null}
    </div>
  );
}

PageTemplateBody.displayName = 'PageTemplate.Body';

export const PageTemplate = Object.assign(PageTemplateRoot, {
  Header: PageTemplateHeader,
  Body: PageTemplateBody,
});

export default PageTemplate;
