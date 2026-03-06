import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Quote, Client, Service, QuoteTemplate } from "@/api/entities";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, Save, Send, Check, Copy } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/components/auth/AuthContext";

import QuoteDetails from "../components/quote/QuoteDetails";
import QuotePreview from "../components/quote/QuotePreview";

const getDefaultPaymentTermsText = (terms, days) => {
  if (!terms || terms === "net_30") {
    return `Payment is due within 30 days of invoice date.\n\nLate payments may incur a 1.5% monthly service charge.\nAll payments should be made to the banking details provided.`;
  }
  if (terms === "due_on_receipt") {
    return `Payment is due immediately upon acceptance of this quote.\n\nPlease remit payment to the banking details provided.\nThank you for your prompt payment.`;
  }
  const termDays = terms === "custom" ? days || 30 : parseInt(terms.split("_")[1] || "30", 10);
  return `Payment is due within ${termDays} days of invoice date upon acceptance.\n\nLate payments may incur a 1.5% monthly service charge.\nAll payments should be made to the banking details provided.`;
};

export default function CreateQuote() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const autoSaveRef = useRef(null);
  const taxRateInputRef = useRef(null);

  const defaultValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [quoteData, setQuoteData] = useState({
    client_id: "",
    project_title: "",
    project_description: "",
    items: [],
    subtotal: 0,
    tax_rate: 0,
    tax_amount: 0,
    total_amount: 0,
    valid_until: defaultValidUntil,
    notes: "",
    terms_conditions: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (quoteData.client_id && clients.length > 0) {
      const selectedClient = clients.find((c) => c.id === quoteData.client_id);
      if (selectedClient?.payment_terms && !quoteData.terms_conditions) {
        const termsText = getDefaultPaymentTermsText(
          selectedClient.payment_terms,
          selectedClient.payment_terms_days
        );
        setQuoteData((prev) => ({ ...prev, terms_conditions: termsText }));
      }
    }
  }, [quoteData.client_id, clients]);

  // Auto-save draft to localStorage (debounced)
  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      try {
        const stored = localStorage.getItem("quoteDraft");
        const draft = stored ? JSON.parse(stored) : {};
        const hasData = quoteData.items?.length > 0 || quoteData.client_id || quoteData.project_title;
        if (hasData) {
          localStorage.setItem("quoteDraft", JSON.stringify({ ...draft, quoteData, savedAt: Date.now() }));
          setLastSavedAt(Date.now());
        }
      } catch (e) {
        // ignore
      }
      autoSaveRef.current = null;
    }, 1500);
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    };
  }, [quoteData]);

  const loadData = async () => {
    try {
      const [clientsData, servicesData, templatesData] = await Promise.all([
        Client.list("-created_date"),
        Service.list("-created_date"),
        QuoteTemplate.list("-created_date"),
      ]);
      setClients(clientsData || []);
      setServices(servicesData || []);
      setTemplates(templatesData || []);
    } catch (err) {
      console.error("Error loading data:", err);
      toast({
        title: "✗ Error",
        description: "Failed to load data. Please refresh the page.",
        variant: "destructive",
      });
    }
  };

  const handleDuplicateLastQuote = async () => {
    setIsDuplicating(true);
    try {
      const list = await Quote.list("-created_date");
      const lastQuote = list?.[0];
      if (!lastQuote) {
        toast({
          title: "No quotes yet",
          description: "Create a quote first, then you can duplicate it.",
          variant: "destructive",
        });
        return;
      }
      const full = await Quote.get(lastQuote.id);
      if (!full) {
        toast({ title: "Could not load quote", variant: "destructive" });
        return;
      }
      const items = (full.items || []).map((item) => ({
        service_name: item.service_name || item.name || "",
        description: item.description || "",
        quantity: Number(item.quantity || item.qty || 1),
        unit_price: Number(item.unit_price || item.rate || item.price || 0),
        total_price: Number(item.total_price || item.total || 0),
      }));
      const defaultValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      setQuoteData({
        client_id: "",
        project_title: full.project_title || "",
        project_description: full.project_description || "",
        items: items.length > 0 ? items : [{ service_name: "", description: "", quantity: 1, unit_price: 0, total_price: 0 }],
        subtotal: full.subtotal || 0,
        tax_rate: full.tax_rate ?? 0,
        tax_amount: full.tax_amount || 0,
        total_amount: full.total_amount || 0,
        valid_until: full.valid_until || defaultValidUntil,
        notes: full.notes || "",
        terms_conditions: full.terms_conditions || "",
      });
      try {
        localStorage.removeItem("quoteDraft");
      } catch (_) {}
      setLastSavedAt(Date.now());
      toast({
        title: "Quote duplicated",
        description: `Cloned "${full.project_title || full.quote_number || "Quote"}" for a new client. Select a client to continue.`,
        variant: "success",
      });
    } catch (err) {
      console.error("Error duplicating quote:", err);
      toast({
        title: "Could not duplicate quote",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleTemplateSelect = (templateId) => {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setQuoteData((prev) => ({
        ...prev,
        project_title: template.project_title || prev.project_title,
        project_description: template.project_description || prev.project_description,
        items: template.items || [],
        notes: template.notes || prev.notes,
        terms_conditions: template.terms_conditions || prev.terms_conditions,
        subtotal: (template.items || []).reduce((sum, item) => sum + (item.total_price || 0), 0),
        total_amount: (template.items || []).reduce((sum, item) => sum + (item.total_price || 0), 0),
      }));
    }
  };

  const handleCreateQuote = async () => {
    if (!quoteData.client_id) {
      setError("Please select a client.");
      toast({
        title: "✗ Validation Error",
        description: "Please select a client before creating the quote.",
        variant: "destructive",
      });
      return;
    }

    if (!quoteData.items || quoteData.items.length === 0) {
      setError("Please add at least one item.");
      toast({
        title: "✗ Validation Error",
        description: "Please add at least one product or service to the quote.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const client = clients.find((c) => c.id === quoteData.client_id);
      const getInitials = (name) => {
        if (!name) return "CL";
        const parts = name.trim().split(/\s+/);
        if (parts.length > 1) {
          return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
      };

      const clientInitials = getInitials(client?.name);
      const now = new Date();
      const datePart = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}`;
      const timePart = `${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}`;
      const quoteNumber = `QUO-${datePart}-${clientInitials}-${timePart}`;

      const quoteToCreate = {
        ...quoteData,
        quote_number: quoteNumber,
        status: "draft",
        items: quoteData.items.map((item) => ({
          service_name: item.name || item.service_name,
          description: item.description || "",
          quantity: Number(item.quantity || item.qty || 1),
          unit_price: Number(item.unit_price || item.rate || item.price || 0),
          total_price: Number(item.total_price || item.total || 0),
        })),
      };

      await Quote.create(quoteToCreate);
      setLastSavedAt(Date.now());

      toast({
        title: "✓ Quote Created",
        description: `Quote ${quoteNumber} has been created successfully.`,
        variant: "success",
      });

      setTimeout(() => {
        navigate(createPageUrl("Quotes"));
      }, 1500);
    } catch (err) {
      console.error("Error creating quote:", err);
      const errorMessage = err.message || err.toString();
      setError(
        errorMessage.includes("organization")
          ? "No organization found. Please contact support or try logging out and back in."
          : errorMessage.includes("permission") || errorMessage.includes("RLS")
            ? "Permission denied. Please check your account permissions."
            : errorMessage.includes("schema cache") || errorMessage.includes("find the table 'public.quotes'")
              ? "Quotes table missing. Run scripts/ensure-quotes-schema.sql in Supabase SQL Editor."
              : errorMessage.includes("column") || errorMessage.includes("does not exist")
                ? "Database schema mismatch. Run scripts/ensure-quotes-schema.sql in Supabase SQL Editor."
                : `Failed to create quote: ${errorMessage}`
      );
      toast({
        title: "✗ Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const showSavedIndicator = lastSavedAt && Date.now() - lastSavedAt < 30000;

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <nav className="text-sm text-muted-foreground flex items-center gap-3">
                <Link
                  to={createPageUrl("Quotes")}
                  className="hover:text-foreground transition-colors"
                >
                  Quotes
                </Link>
                <span className="mx-2">/</span>
                <span className="text-foreground font-medium">New Quote</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDuplicateLastQuote}
                  disabled={isDuplicating}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
                  title="Clone your most recent quote for a new client"
                >
                  {isDuplicating ? (
                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Duplicate Last Quote
                    </>
                  )}
                </Button>
              </nav>
              {showSavedIndicator && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                  <Check className="w-3.5 h-3.5" />
                  Saved just now
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="default"
                onClick={() => setShowPreview((p) => !p)}
                className="rounded-xl border-border bg-card text-foreground hover:bg-muted"
              >
                {showPreview ? (
                  <>
                    <EyeOff className="w-4 h-4 mr-2" />
                    Hide Preview
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Show Preview
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={handleCreateQuote}
                disabled={isSaving}
                className="rounded-xl border-border bg-card text-foreground hover:bg-muted"
              >
                <Save className="w-4 h-4 mr-2" />
                Save as Draft
              </Button>
              <Button
                size="default"
                onClick={handleCreateQuote}
                disabled={isSaving}
                className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </span>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Quote
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {error && (
          <div className="mb-6 bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Split-screen: editor (left) + sticky preview (right) */}
        <div
          className={
            showPreview
              ? "grid grid-cols-1 lg:grid-cols-2 gap-10"
              : "max-w-3xl"
          }
        >
          {/* Left: Editor */}
          <div className="space-y-8 overflow-auto">
            {templates.length > 0 && (
              <Card className="bg-white border-slate-100 rounded-[32px] shadow-sm">
                <CardContent className="p-4 flex items-center gap-4">
                  <Label className="whitespace-nowrap text-sm font-medium">Start from Template:</Label>
                  <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                    <SelectTrigger className="w-full sm:w-[300px] bg-slate-50 border-none rounded-2xl">
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}

            <QuoteDetails
              quoteData={quoteData}
              setQuoteData={setQuoteData}
              clients={clients}
              services={services}
              setServices={setServices}
              showNextButton={false}
              taxRateInputRef={taxRateInputRef}
            />
          </div>

          {/* Right: Sticky preview (stacks below editor on mobile) */}
          {showPreview && (
            <div className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-[32px] shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden bg-white">
                <QuotePreview
                  quoteData={quoteData}
                  clients={clients}
                  user={user}
                  previewOnly
                  loading={false}
                  onTotalClick={() => taxRateInputRef.current?.focus?.()}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
