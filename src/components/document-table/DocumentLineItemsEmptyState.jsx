import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DocumentLineItemsEmptyState({ onAdd, actionLabel = "Add first item" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
        <FileText className="h-7 w-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">No line items yet</p>
        <p className="text-sm text-muted-foreground">Add a product or service to start this document.</p>
      </div>
      {typeof onAdd === "function" ? (
        <Button type="button" variant="default" size="sm" className="gap-2" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
