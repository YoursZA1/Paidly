import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import { DocumentList } from "@/components/documents";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentService } from "@/services/DocumentService";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { COMMON_CURRENCIES } from "@/data/currencies";
import { ChevronDown, Loader2 } from "lucide-react";

const CREATE_DEFAULTS = {
  invoice: { title: "New invoice", label: "Unified invoice (draft)" },
  quote: { title: "New quote", label: "Unified quote (draft)" },
  payslip: { title: "New payslip", label: "Unified payslip (draft)" },
};

export default function DocumentsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [currency, setCurrency] = useState("ZAR");

  const handleCreateUnified = async (type) => {
    const meta = CREATE_DEFAULTS[type] || CREATE_DEFAULTS.invoice;
    setCreating(true);
    try {
      const doc = await DocumentService.create({
        type,
        title: meta.title,
        currency,
        base_currency: "ZAR",
        items: [{ description: "Line item", quantity: 1, unit_price: 0 }],
      });
      if (doc?.id) {
        navigate(`${createPageUrl("Documents")}/${encodeURIComponent(doc.id)}`);
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not create document",
        description: e?.message || String(e),
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="Documents"
          description="One engine for invoices, quotes, and payslips — line items, totals, lifecycle, and a full activity log. Legacy PDF and email flows still use the original pages until you migrate each feature."
        />
      </PageTemplate.Header>
      <PageTemplate.Body>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Select value={currency} onValueChange={setCurrency} disabled={creating}>
            <SelectTrigger className="w-[180px]" aria-label="Currency for new documents">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              {COMMON_CURRENCIES.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.code} — {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" disabled={creating} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                New unified document
                <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px]">
              <DropdownMenuLabel>Create draft</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={creating} onSelect={() => handleCreateUnified("invoice")}>
                {CREATE_DEFAULTS.invoice.label}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={creating} onSelect={() => handleCreateUnified("quote")}>
                {CREATE_DEFAULTS.quote.label}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={creating} onSelect={() => handleCreateUnified("payslip")}>
                {CREATE_DEFAULTS.payslip.label}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" asChild>
            <Link to={`${createPageUrl("CreateDocument")}/invoice`}>Legacy create (PDF & send)</Link>
          </Button>
        </div>
        <DocumentList />
      </PageTemplate.Body>
    </PageTemplate>
  );
}
