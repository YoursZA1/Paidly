import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import PosOperatorAccessControls from "@/components/pos/PosOperatorAccessControls";
import { workforceApi, employeeProfilePath } from "@/services/WorkforceApiService";

/**
 * POS → Manage POS operators. Operators are existing employees (memberships) with POS enabled
 * (POS job or an assigned till) — not a second staff list.
 */
export default function PosOperatorsSheet({ open, onOpenChange }) {
  const [operators, setOperators] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await workforceApi.posOperators();
      setOperators(data?.operators || []);
    } catch (err) {
      setError(err?.message || "Could not load POS operators");
      setOperators([]);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>POS operators</SheetTitle>
          <SheetDescription>
            Each operator opens the till with their own POS access code. A code never opens the Paidly dashboard.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {operators == null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          ) : operators.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No POS operators yet. In Workforce, give an employee the POS job or assign them a till, then generate their code here.
            </p>
          ) : (
            operators.map((op) => (
              <section key={op.membership_id} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-medium">{op.name}</p>
                  <Button asChild variant="link" size="sm" className="h-auto px-0 text-xs">
                    <Link to={employeeProfilePath(op.membership_id)}>Employee profile</Link>
                  </Button>
                </div>
                <PosOperatorAccessControls
                  access={op}
                  compact
                  onChange={(next) => setOperators((prev) => prev.map((row) => (row.membership_id === next.membership_id ? next : row)))}
                />
              </section>
            ))
          )}
          <Button asChild variant="outline" className="w-full">
            <Link to="/Employees">Add or edit employees in Workforce</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
