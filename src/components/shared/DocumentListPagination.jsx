import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function DocumentListPagination({
  totalPages,
  currentPage,
  visiblePages,
  onPageChange,
  itemsPerPage,
  onItemsPerPageChange,
  totalItems,
  itemLabel,
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border pt-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Show</span>
        <Select value={itemsPerPage.toString()} onValueChange={(v) => onItemsPerPageChange(Number(v))}>
          <SelectTrigger className="w-[70px] h-9 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <span>of {totalItems} {itemLabel}</span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </Button>
        <div className="flex items-center gap-1">
          {visiblePages.map((pageNum) => (
            <Button
              key={pageNum}
              variant={currentPage === pageNum ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(pageNum)}
              className="w-9 h-9 rounded-lg"
            >
              {pageNum}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

