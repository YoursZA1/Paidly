import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, LayoutTemplate, MoreVertical, Upload } from "lucide-react";

export default function CatalogDataActions({
  isImporting,
  isExporting,
  exportDisabled,
  onImportFile,
  onExport,
  onOpenIndustryTemplates,
}) {
  const fileInputRef = useRef(null);

  const triggerImport = () => fileInputRef.current?.click();

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onImportFile}
        aria-hidden
      />

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
          <DropdownMenuItem onClick={triggerImport} disabled={isImporting}>
            <Upload className="h-4 w-4 mr-2" />
            {isImporting ? "Importing…" : "Import CSV"}
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
          onClick={triggerImport}
          disabled={isImporting}
        >
          <Upload className={`h-4 w-4 mr-1.5 ${isImporting ? "animate-pulse" : ""}`} />
          {isImporting ? "Importing…" : "Import"}
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
