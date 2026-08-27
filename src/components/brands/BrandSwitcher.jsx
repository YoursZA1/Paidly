import { useNavigate } from "react-router-dom";
import { Building2, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useOrgBrands from "@/hooks/useOrgBrands";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";

export default function BrandSwitcher({ className, compact = false }) {
  const navigate = useNavigate();
  const { brands, activeBrand, activeBrandId, setActiveBrandId, canManageBrands, loading } =
    useOrgBrands();

  const label = activeBrand?.name || "Organization default";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "gap-2 rounded-xl text-foreground min-h-11 max-w-[14rem]",
            compact ? "px-2" : "px-3",
            className
          )}
          aria-label={`Current company or brand: ${label}`}
          disabled={loading}
        >
          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm font-medium">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Company / brand</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">For new invoices and quotes</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => setActiveBrandId(null)}
        >
          {!activeBrandId ? <Check className="size-4" aria-hidden /> : <span className="size-4" />}
          Organization default
        </DropdownMenuItem>
        {brands.map((brand) => (
          <DropdownMenuItem
            key={brand.id}
            className="gap-2"
            onSelect={() => setActiveBrandId(brand.id)}
          >
            {activeBrandId === brand.id ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <span className="size-4" />
            )}
            <span className="truncate">{brand.name || "Untitled brand"}</span>
          </DropdownMenuItem>
        ))}
        {canManageBrands ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => navigate(`${createPageUrl("Settings")}?tab=brands`)}
            >
              <Plus className="size-4" aria-hidden />
              Manage brands
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
