import { useState, useEffect, useCallback } from "react";
import { Loader2, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Service } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { invalidateServicesCatalog } from "@/hooks/useServicesCatalogQuery";
import ServiceForm from "@/components/services/ServiceForm";

export default function CatalogItemDialog({
  open,
  onOpenChange,
  item,
  defaultType = "service",
  onSaved,
}) {
  const [fullItem, setFullItem] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formValid, setFormValid] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isNew = !item?.id;
  const formId = "catalog-item-dialog-form";

  useEffect(() => {
    if (!open) {
      setFullItem(null);
      setFormValid(false);
      return;
    }
    if (isNew) return;

    let cancelled = false;
    setIsFetching(true);
    Service.get(item.id)
      .then((data) => { if (!cancelled) setFullItem(data || item._raw || item); })
      .catch(() => { if (!cancelled) setFullItem(item._raw || item); })
      .finally(() => { if (!cancelled) setIsFetching(false); });

    return () => { cancelled = true; };
  }, [open, isNew, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const serviceForForm = isNew ? null : (fullItem ?? item?._raw ?? item ?? null);

  const serviceDataKey = isNew
    ? `new-${defaultType}`
    : `edit:${item?.id}:${fullItem?.updated_at || item?.updated_at || ""}`;

  const handleValidityChange = useCallback((valid) => setFormValid(Boolean(valid)), []);

  const handleSave = async (serviceData) => {
    setIsSaving(true);
    try {
      if (isNew) {
        await Service.create(serviceData);
        toast({ title: "Item created", description: `${serviceData.name} added to catalog.`, variant: "success" });
      } else {
        await Service.update(item.id, serviceData);
        toast({ title: "Item updated", description: "Changes saved.", variant: "success" });
      }
      await invalidateServicesCatalog(queryClient);
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      const msg = String(error?.message || error || "");
      toast({
        title: "Could not save",
        description: msg.includes("organization")
          ? "No organization found. Try signing out and back in."
          : msg.includes("permission") || msg.includes("RLS")
          ? "Permission denied."
          : msg.includes("duplicate") || msg.includes("unique")
          ? "An item with this name may already exist."
          : msg || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const titleText = isNew
    ? defaultType === "product" ? "New product" : "New service"
    : `Edit · ${item?.name || "item"}`;

  const showSkeleton = !isNew && isFetching && !fullItem;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!isSaving) onOpenChange(next); }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>

        {showSkeleton ? (
          <div className="space-y-4 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        ) : (
          <ServiceForm
            key={item?.id || `new-${defaultType}`}
            service={serviceForForm}
            serviceDataKey={serviceDataKey}
            defaultType={serviceForForm?.item_type || defaultType}
            variant="dialog"
            surface="editor"
            formId={formId}
            hideActions
            isSaving={isSaving}
            onValidityChange={handleValidityChange}
            onSave={handleSave}
            onCancel={() => onOpenChange(false)}
          />
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border/40 mt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isSaving || !formValid || showSkeleton}
            title={!formValid ? "Complete all required fields to save." : undefined}
          >
            {isSaving
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
              : <Save className="h-4 w-4 mr-2" aria-hidden />}
            {isNew ? "Create item" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
