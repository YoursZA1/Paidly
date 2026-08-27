import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, UploadCloud, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import useOrgBrands from "@/hooks/useOrgBrands";
import { OrgBrandService } from "@/services/OrgBrandService";
import { uploadLogo, validateLogoFile, logoMaxSizeLabel } from "@/lib/logoUpload";
import AssetService from "@/services/AssetService";
import LogoImage from "@/components/shared/LogoImage";

const EMPTY_DRAFT = { id: null, name: "", logo_url: "" };

export default function OrgBrandsSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { brands, loading, canManageBrands, refresh, activeBrandId, setActiveBrandId } = useOrgBrands();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [logoFile, setLogoFile] = useState(null);
  const [previewSrc, setPreviewSrc] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    if (!dialogOpen) {
      setDraft(EMPTY_DRAFT);
      setLogoFile(null);
    }
  }, [dialogOpen]);

  useEffect(() => {
    if (!logoFile) {
      setPreviewSrc(draft.logo_url ? AssetService.getLogo(draft.logo_url) : "");
      return undefined;
    }
    const url = URL.createObjectURL(logoFile);
    setPreviewSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile, draft.logo_url]);

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  };

  const openEdit = (brand) => {
    setDraft({ id: brand.id, name: brand.name || "", logo_url: brand.logo_url || "" });
    setLogoFile(null);
    setDialogOpen(true);
  };

  const handleLogoPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validation = validateLogoFile(file);
    if (!validation.valid) {
      toast({ title: "Invalid logo", description: validation.message, variant: "destructive" });
      return;
    }
    setLogoFile(file);
  };

  const handleSave = async () => {
    const name = String(draft.name || "").trim();
    if (!name) {
      toast({ title: "Name required", description: "Enter a brand name.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let logo_url = draft.logo_url || null;
      if (logoFile) {
        logo_url = await uploadLogo(logoFile, user?.id);
      }
      if (draft.id) {
        await OrgBrandService.update(draft.id, { name, logo_url });
        toast({ title: "Brand updated" });
      } else {
        const created = await OrgBrandService.create({ name, logo_url });
        if (created?.id && !activeBrandId) setActiveBrandId(created.id);
        toast({ title: "Brand created" });
      }
      setDialogOpen(false);
      await refresh();
    } catch (e) {
      toast({ title: "Could not save brand", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete?.id) return;
    setSaving(true);
    try {
      await OrgBrandService.remove(pendingDelete.id);
      if (activeBrandId === pendingDelete.id) setActiveBrandId(null);
      toast({ title: "Brand removed" });
      setPendingDelete(null);
      await refresh();
    } catch (e) {
      toast({ title: "Could not remove brand", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Brands are trading names and logos on invoices. They belong to this Paidly organization — not a
        second login or workspace.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading brands…
        </div>
      ) : brands.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No brands yet. New documents use your organization profile until you add one.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {brands.map((brand) => (
            <li key={brand.id} className="flex items-center gap-3 p-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                {brand.logo_url ? (
                  <LogoImage src={brand.logo_url} className="h-full w-full object-contain" alt="" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{brand.name}</p>
                {activeBrandId === brand.id ? (
                  <p className="text-xs text-muted-foreground">Active for new documents</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                {activeBrandId !== brand.id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveBrandId(brand.id)}
                  >
                    Use for new docs
                  </Button>
                ) : null}
                {canManageBrands ? (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => openEdit(brand)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      aria-label={`Remove ${brand.name}`}
                      onClick={() => setPendingDelete(brand)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canManageBrands ? (
        <Button type="button" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add brand
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Only organization admins can add or edit brands.</p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit brand" : "New brand"}</DialogTitle>
            <DialogDescription>Name and logo stored on this organization&apos;s companies table.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brand-name">Name</Label>
              <Input
                id="brand-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. OnThe Design Studio"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-logo">Logo</Label>
              <p className="text-xs text-muted-foreground">PNG, JPEG, or SVG up to {logoMaxSizeLabel()}.</p>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {previewSrc ? (
                    <img src={previewSrc} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <Button type="button" variant="outline" className="gap-2" asChild>
                  <label htmlFor="brand-logo" className="cursor-pointer">
                    <UploadCloud className="h-4 w-4" />
                    {logoFile ? logoFile.name : "Upload"}
                  </label>
                </Button>
                <input
                  id="brand-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="sr-only"
                  onChange={handleLogoPick}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing invoices keep their assigned brand id (or become unassigned if the database
              clears it). This does not delete invoices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
