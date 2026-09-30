import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, LayoutTemplate, MoreVertical, Upload } from "lucide-react";

/** Import (Excel / CSV / PDF → review dialog), CSV export and industry templates. */
export default function CatalogDataActions({ isExporting, exportDisabled, onImport, onExport, onOpenIndustryTemplates }) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 lg:hidden"
            aria-label="Import, export, and templates"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={onImport}>
            <Upload className="h-4 w-4 mr-2" />
            Import products
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExport} disabled={isExporting || exportDisabled}>
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? "Exporting…" : "Export CSV"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenIndustryTemplates}>
            <LayoutTemplate className="h-4 w-4 mr-2" />
            Industry templates
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="hidden lg:flex items-center gap-2 shrink-0">
        <Button
          type="button"
          variant="outline"
          className="h-11 px-3 rounded-md uppercase text-xs tracking-wide font-semibold"
          onClick={onImport}
        >
          <Upload className="h-4 w-4 mr-1.5" />
          Import products
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-3 rounded-md uppercase text-xs tracking-wide font-semibold"
          onClick={onExport}
          disabled={isExporting || exportDisabled}
        >
          <Download className={`h-4 w-4 mr-1.5 ${isExporting ? "animate-pulse" : ""}`} />
          {isExporting ? "Exporting…" : "Export"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-3 rounded-md uppercase text-xs tracking-wide font-semibold"
          onClick={onOpenIndustryTemplates}
        >
          <LayoutTemplate className="h-4 w-4 mr-1.5" />
          Templates
        </Button>
      </div>
    </>
  );
}
