import { Button } from "@/components/ui/button";
import { uncoveredPayRunIds } from "@shared/payroll/adjustmentRun.js";

export default function AdjustmentRunBanner({
  signals = [],
  runs = [],
  creating = false,
  onCreateAdjustment,
}) {
  const uncoveredIds = uncoveredPayRunIds(signals);
  const affected = uncoveredIds.map((id) => runs.find((row) => row.id === id)).filter(Boolean);
  const labels = affected.map((row) => row.period_label).filter(Boolean);

  return (
    <div className="mb-4 text-sm text-amber-900 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Unpaid leave was approved after a finalized pay run
        {labels.length ? ` (${labels.join(", ")})` : ""}. Create an adjustment run so
        calculate applies the leave once — the locked run is not rewritten.
      </p>
      {onCreateAdjustment ? (
        <Button
          type="button"
          className="rounded-xl h-9 shrink-0 bg-primary text-primary-foreground"
          disabled={creating || !uncoveredIds.length}
          onClick={() => onCreateAdjustment(uncoveredIds[0])}
        >
          {creating ? "Creating…" : "Create adjustment run"}
        </Button>
      ) : null}
    </div>
  );
}
