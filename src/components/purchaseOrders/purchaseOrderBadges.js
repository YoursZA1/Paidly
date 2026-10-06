/** Status pill classes shared by the PO table and preview (light + dark). */
export const PO_STATUS_BADGE = {
  draft: "bg-muted text-muted-foreground border-transparent",
  pending_approval: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-transparent",
  approved: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-transparent",
  partially_received: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent",
  received: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-transparent",
  cancelled: "bg-destructive/10 text-destructive border-transparent",
};

/** Text colour for the financial status line (shared/procurement purchaseOrderFinancialStatus). */
export const PO_FINANCIAL_STATUS_TEXT = {
  committed: "text-blue-700 dark:text-blue-400",
  received: "text-amber-700 dark:text-amber-400",
  partially_paid: "text-amber-700 dark:text-amber-400",
  paid: "text-emerald-700 dark:text-emerald-400",
};
