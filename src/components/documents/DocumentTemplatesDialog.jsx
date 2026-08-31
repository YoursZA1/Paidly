import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentService } from "@/services/DocumentService";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_TEMPLATE_PRESETS,
  HUB_DOCUMENT_TYPE_DEFS,
  typeLabel,
  isHubPersistedType,
} from "@/document-engine";
import { DocumentTypeIcon } from "./documentIcon";
import { useToast } from "@/components/ui/use-toast";
import { Copy, Star, Loader2, LayoutTemplate, Plus, Trash2, Search, AlertCircle } from "lucide-react";

/**
 * Templates library: browse org templates, add starter presets, set defaults, create documents.
 */
export default function DocumentTemplatesDialog({ open, onOpenChange, onCreated }) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [tableReady, setTableReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState("library");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await DocumentService.listTemplates({
        type: filterType === "all" ? undefined : filterType,
      });
      setTemplates(result.rows || []);
      setTableReady(result.tableReady !== false);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not load templates", description: e?.message });
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [filterType, toast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setTab("library");
    }
  }, [open]);

  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter(
      (t) =>
        t.name?.toLowerCase().includes(term) ||
        typeLabel(t.type).toLowerCase().includes(term) ||
        t.description?.toLowerCase().includes(term)
    );
  }, [templates, search]);

  const filteredPresets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return DOCUMENT_TEMPLATE_PRESETS.filter((p) => {
      if (!isHubPersistedType(p.type)) return false;
      if (filterType !== "all" && p.type !== filterType) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        typeLabel(p.type).toLowerCase().includes(term)
      );
    });
  }, [filterType, search]);

  const run = async (id, fn) => {
    setBusyId(id);
    try {
      await fn();
      await load();
    } catch (e) {
      toast({ variant: "destructive", title: "Action failed", description: e?.message || String(e) });
    } finally {
      setBusyId(null);
    }
  };

  const handleUseTemplate = async (templateId) => {
    setBusyId(templateId);
    try {
      const doc = await DocumentService.createFromTemplate(templateId);
      toast({ title: "Document created", description: "Draft opened from your template." });
      onCreated?.(doc);
      onOpenChange(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not create document", description: e?.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
            Templates
          </DialogTitle>
          <DialogDescription className="text-left leading-relaxed">
            Reusable starting points for contracts, proposals, job cards, reports, and purchase orders.
            Invoices, quotes, and payslips use their own specialised pages. Set a default per hub
            document type to speed up creation from the New Document menu.
          </DialogDescription>
        </DialogHeader>

        {!tableReady ? (
          <div className="mx-6 mt-4 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              The templates table is not available yet. Run{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">supabase db push</code> to apply the documents hub
              migration, then reload this page.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="pl-9"
              aria-label="Search templates"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by document type">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <SelectItem value="all">All types</SelectItem>
              {HUB_DOCUMENT_TYPE_DEFS.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col px-6 pb-6">
          <TabsList className="mb-4 w-full justify-start">
            <TabsTrigger value="library">Your templates ({templates.length})</TabsTrigger>
            <TabsTrigger value="starters">Starter templates</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
                ))}
              </div>
            ) : !filteredTemplates.length ? (
              <EmptyState
                icon={<LayoutTemplate className="h-6 w-6 text-muted-foreground" />}
                title={templates.length ? "No matches" : "No templates saved yet"}
                description={
                  templates.length
                    ? "Try a different search or filter."
                    : "Add a starter template below, or open any document and choose Save as template."
                }
                action={
                  !templates.length ? (
                    <Button type="button" variant="outline" onClick={() => setTab("starters")}>
                      Browse starter templates
                    </Button>
                  ) : null
                }
              />
            ) : (
              <ul className="space-y-2">
                {filteredTemplates.map((tpl) => (
                  <li
                    key={tpl.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <DocumentTypeIcon type={tpl.type} className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{tpl.name}</span>
                          {tpl.is_default ? (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="h-3 w-3" /> Default
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{typeLabel(tpl.type)}</p>
                        {tpl.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{tpl.description}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:shrink-0">
                      <Button
                        size="sm"
                        disabled={busyId === tpl.id || !tableReady}
                        onClick={() => handleUseTemplate(tpl.id)}
                      >
                        {busyId === tpl.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use"}
                      </Button>
                      {!tpl.is_default ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === tpl.id || !tableReady}
                          onClick={() =>
                            run(tpl.id, async () => {
                              await DocumentService.setDefaultTemplate(tpl.id);
                              toast({ title: "Default updated", description: `New ${typeLabel(tpl.type)} documents will start from this template.` });
                            })
                          }
                        >
                          Set default
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === tpl.id || !tableReady}
                        onClick={() =>
                          run(tpl.id, async () => {
                            await DocumentService.duplicateTemplate(tpl.id);
                            toast({ title: "Template duplicated" });
                          })
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === tpl.id || !tableReady}
                        className="text-destructive hover:text-destructive"
                        onClick={() =>
                          run(tpl.id, async () => {
                            await DocumentService.removeTemplate(tpl.id);
                            toast({ title: "Template removed" });
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="starters" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <p className="mb-4 text-sm text-muted-foreground">
              Paidly includes curated starters for common business documents. Add any preset to your library, then
              customise or set it as the default for that type.
            </p>
            {!filteredPresets.length ? (
              <EmptyState
                title="No starter matches"
                description="Try clearing the search or type filter."
              />
            ) : (
              <ul className="space-y-2">
                {filteredPresets.map((preset) => {
                  const categoryLabel =
                    DOCUMENT_CATEGORIES.find((c) =>
                      HUB_DOCUMENT_TYPE_DEFS.some((t) => t.key === preset.type && t.category === c.key)
                    )?.label || "";
                  return (
                    <li
                      key={preset.key}
                      className="flex flex-col gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-border">
                          <DocumentTypeIcon type={preset.type} className="h-4 w-4 text-muted-foreground" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">{preset.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {typeLabel(preset.type)}
                            {categoryLabel ? ` · ${categoryLabel}` : ""}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{preset.description}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === preset.key || !tableReady}
                          onClick={() =>
                            run(preset.key, async () => {
                              await DocumentService.createTemplateFromPreset(preset.key);
                              toast({ title: "Added to your library", description: preset.name });
                              setTab("library");
                            })
                          }
                        >
                          <Plus className="mr-1 h-4 w-4" /> Add to library
                        </Button>
                        <Button
                          size="sm"
                          disabled={busyId === preset.key || !tableReady}
                          onClick={() =>
                            run(preset.key, async () => {
                              const tpl = await DocumentService.createTemplateFromPreset(preset.key, {
                                isDefault: true,
                              });
                              toast({
                                title: "Default template set",
                                description: `${preset.name} is now the default for ${typeLabel(preset.type)}.`,
                              });
                              setTab("library");
                              void tpl;
                            })
                          }
                        >
                          Add & set default
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
