/**
 * Grouped "New Document" dropdown — every catalog type, organized by category. Selecting a type
 * calls `onSelect(typeKey)`. The parent owns creation so it can show loading + route to the editor.
 */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { typesByCategory } from "@/document-engine";
import { DocumentTypeIcon, CategoryIcon } from "./documentIcon";

/**
 * @param {{ onSelect: (typeKey: string) => void, creating?: boolean, disabled?: boolean }} props
 */
export default function NewDocumentMenu({ onSelect, creating = false, disabled = false }) {
  const groups = typesByCategory();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" disabled={disabled || creating} className="gap-2">
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          New Document
          <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Create a document</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {groups.map((group) => (
          <DropdownMenuSub key={group.key}>
            <DropdownMenuSubTrigger className="gap-2">
              <CategoryIcon category={group.key} className="h-4 w-4 text-muted-foreground" />
              <span>{group.label}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[60vh] w-56 overflow-y-auto">
              {group.types.map((t) => (
                <DropdownMenuItem
                  key={t.key}
                  disabled={creating}
                  className="gap-2"
                  onSelect={() => onSelect(t.key)}
                >
                  <DocumentTypeIcon type={t.key} className="h-4 w-4 text-muted-foreground" />
                  <span>{t.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
