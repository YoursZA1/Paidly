import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/components/CurrencySelector";
import {
  generateDefaultItems,
  getIndustries,
  getTemplateItems,
} from "@/services/IndustryPresetsService";
import { Service } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { sanitizeTemplateItemForCreate } from "@/utils/catalogCsvUtils";

export default function IndustryTemplatesDialog({
  open,
  onOpenChange,
  userId,
  currencyCode = "ZAR",
  onComplete,
}) {
  const { toast } = useToast();
  const industries = useMemo(
    () => getIndustries().filter((i) => getTemplateItems(i.code).length > 0),
    []
  );
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (industries.length === 0) {
      setSelectedIndustry("");
      return;
    }
    setSelectedIndustry((prev) =>
      prev && industries.some((i) => i.code === prev) ? prev : industries[0].code
    );
  }, [open, industries]);

  const previewItems = useMemo(
    () => (selectedIndustry ? getTemplateItems(selectedIndustry) : []),
    [selectedIndustry]
  );

  const selectedMeta = industries.find((i) => i.code === selectedIndustry);

  const handleCreate = async () => {
    if (!selectedIndustry) return;
    const templateItems = generateDefaultItems(selectedIndustry, userId);
    if (!templateItems?.length) {
      toast({
        title: "No templates",
        description: "No starter items are available for this industry.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      let created = 0;
      let skipped = 0;
      for (const item of templateItems) {
        const payload = sanitizeTemplateItemForCreate(item);
        if (!payload?.name) {
          skipped++;
          continue;
        }
        try {
          await Service.create(payload);
          created++;
        } catch (err) {
          console.warn("Industry template create failed:", payload.name, err);
          skipped++;
        }
      }

      await onComplete?.();

      const industryLabel = selectedMeta?.name || selectedIndustry.replace(/_/g, " ");
      toast({
        title: "Templates added",
        description: `${created} item(s) added for ${industryLabel}${skipped ? ` (${skipped} skipped).` : "."}`,
        variant: "success",
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Industry templates create failed:", error);
      toast({
        title: "Could not add templates",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Industry starter items</DialogTitle>
          <DialogDescription>
            Add a curated set of products and services for your business type. You can edit any item
            after it is created.
          </DialogDescription>
        </DialogHeader>

        {industries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No industry presets are configured.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Industry</label>
              <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Choose industry" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((industry) => (
                    <SelectItem key={industry.code} value={industry.code}>
                      {industry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMeta?.description ? (
                <p className="text-xs text-muted-foreground">{selectedMeta.description}</p>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/60 max-h-48 overflow-y-auto">
              <ul className="divide-y divide-border/50 text-sm">
                {previewItems.map((item, index) => (
                  <li
                    key={`${item.name}-${index}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {item.item_type || "service"}
                      </p>
                    </div>
                    <span className="text-sm tabular-nums shrink-0">
                      {formatCurrency(Number(item.default_rate ?? 0), currencyCode)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={isCreating || industries.length === 0 || previewItems.length === 0}
          >
            {isCreating ? "Adding…" : `Add ${previewItems.length} item${previewItems.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
