import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { Client, Invoice, Quote, QuoteTemplate } from "@/api/entities";
import { supabase } from "@/lib/supabaseClient";
import { verifyTableExists } from "@/utils/supabaseErrorUtils";
import { sendInvoiceToClient } from "@/services/InvoiceSendService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, Loader2, Send, Download, ImageIcon, RotateCcw } from "lucide-react";
import LineItemsEditor from "@/components/LineItemsEditor";
import DocumentPreview from "@/components/DocumentPreview";
import { downloadDocumentPreviewFromElement, waitForPreviewPaint } from "@/utils/documentPreviewPdf";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/components/auth/AuthContext";
import { createPageUrl } from "@/utils";
import { formatCurrency } from "@/components/CurrencySelector";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import { withApiLogging } from "@/utils/apiLogger";
import { DEFAULT_INVOICE_TERMS_BODY } from "@/constants/invoiceTerms";
import { snapshotDocumentBrandForPersist } from "@/utils/documentBrandColors";
import { uploadDocumentLogo, logoMaxSizeLabel } from "@/lib/logoUpload";
import { lineItemHasContent } from "@/utils/lineItemContent";

const CURRENCIES = ["ZAR", "USD", "EUR", "GBP", "AUD", "CAD"];

/** Sentinel so Radix Select stays controlled (empty client_id must not use `undefined` → avoids uncontrolled/controlled warning). */
const CLIENT_SELECT_NONE = "__paidly_no_client__";

function normalizeDocType(raw) {
  const t = String(raw || "").toLowerCase();
  if (t === "quote" || t === "quotes") return "quote";
  return "invoice";
}

function getInitials(name) {
  if (!name) return "CL";
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function generateNumber(docType, clientName) {
  const prefix = docType === "quote" ? "QUO" : "INV";
  const initials = getInitials(clientName);
  const now = new Date();
  const datePart = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}`;
  const timePart = `${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}`;
  return `${prefix}-${datePart}-${initials}-${timePart}`;
}

function buildPaidLineItems(lineItems, discount) {
  const rows = Array.isArray(lineItems) ? lineItems : [];
  const mapped = rows
    .filter(lineItemHasContent)
    .map((row) => {
      const qty = Number(row.quantity) || 1;
      const unit = Number(row.unit_price) || 0;
      const total =
        Number(row.total) != null && !Number.isNaN(Number(row.total))
          ? Number(row.total)
          : Math.round(qty * unit * 100) / 100;
      const desc = (row.description || row.service_name || row.name || "").trim() || "Item";
      return {
        service_name: desc.split("\n")[0].slice(0, 200),
        description: desc.includes("\n") ? desc.split("\n").slice(1).join("\n").trim() : "",
        quantity: qty,
        unit_price: unit,
        total_price: total,
      };
    });

  const d = Number(discount) || 0;
  if (d > 0) {
    mapped.push({
      service_name: "Discount",
      description: "",
      quantity: 1,
      unit_price: -d,
      total_price: -d,
    });
  }
  return mapped;
}

export default function CreateDocument() {
  const { type: typeParam } = useParams();
  const docType = normalizeDocType(typeParam);
  const initialTerms = docType === "invoice" ? DEFAULT_INVOICE_TERMS_BODY : "";
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const profileDefaultsApplied = useRef(false);
  const previewPdfRef = useRef(null);
  const documentLogoInputRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [documentLogoUploading, setDocumentLogoUploading] = useState(false);
  const [pdfExportPending, setPdfExportPending] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [loadedQuote, setLoadedQuote] = useState(null);
  const [prefillLoading, setPrefillLoading] = useState(false);

  const [form, setForm] = useState({
    number: "",
    status: "draft",
    client_name: "",
    client_email: "",
    client_address: "",
    client_id: "",
    issue_date: new Date().toISOString().split("T")[0],
    due_date: "",
    line_items: [{ description: "", quantity: 1, unit_price: 0, total: 0 }],
    tax_rate: 0,
    discount: 0,
    currency: user?.currency || "ZAR",
    notes: "",
    company_name: "",
    company_email: "",
    company_address: "",
    terms_conditions: initialTerms,
    /** Public URL for logo on this document only; empty = use profile logo */
    document_logo_url: "",
  });

  useEffect(() => {
    if (!user || profileDefaultsApplied.current) return;
    profileDefaultsApplied.current = true;
    setForm((f) => ({
      ...f,
      currency: user.currency || f.currency || "ZAR",
      company_name: user.company_name || f.company_name,
      company_email: user.email || f.company_email,
      company_address: user.company_address || f.company_address,
    }));
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingClients(true);
      try {
        const list = await withApiLogging("createDocument.clients.list", () =>
          withTimeoutRetry(() => Client.list("-created_date", { limit: 100, maxWaitMs: 8000 }), 20000, 1)
        );
        if (!cancelled) setClients(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) {
          setClients([]);
          toast({
            title: "Could not load clients",
            description: e?.message || "You can still enter client details manually.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    setForm((f) => ({ ...f, number: generateNumber(docType, f.client_name || "") }));
  }, [docType]);

  useEffect(() => {
    if (docType !== "invoice") return;
    setForm((f) => {
      if ((f.terms_conditions || "").trim()) return f;
      return { ...f, terms_conditions: DEFAULT_INVOICE_TERMS_BODY };
    });
  }, [docType]);

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const quoteIdParam = searchParams.get("quoteId");
  const clientIdParam = searchParams.get("client_id");
  const templateIdParam = searchParams.get("templateId");
  const duplicateLastParam = searchParams.get("duplicateLast");

  useEffect(() => {
    if (docType !== "invoice" || !quoteIdParam) {
      setLoadedQuote(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setPrefillLoading(true);
      try {
        const quote = await withApiLogging("createDocument.quote.get", () =>
          withTimeoutRetry(() => Quote.get(quoteIdParam), 20000, 1)
        );
        if (cancelled) return;
        if (!quote) {
          toast({
            title: "Quote not found",
            description: "You can still create an invoice from scratch.",
            variant: "destructive",
          });
          setLoadedQuote(null);
          return;
        }
        setLoadedQuote(quote);
        let qc = null;
        if (quote.client_id) {
          try {
            qc = await withTimeoutRetry(() => Client.get(quote.client_id), 15000, 1);
          } catch {
            qc = null;
          }
        }
        const items = Array.isArray(quote.items) ? quote.items : [];
        const dueDate = quote.valid_until
          ? new Date(quote.valid_until).toISOString().split("T")[0]
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const line_items = items.map((item) => {
          const qty = Number(item.quantity ?? 1);
          const rate = Number(item.unit_price ?? item.rate ?? 0);
          const total = Number(item.total_price ?? item.total ?? qty * rate);
          const desc =
            [item.service_name || item.name, item.description].filter(Boolean).join("\n") || "Item";
          return { description: desc, quantity: qty, unit_price: rate, total };
        });
        const clientName = qc?.name || "";
        setForm((f) => ({
          ...f,
          client_id: quote.client_id || "",
          client_name: qc?.name || "",
          client_email: qc?.email || "",
          client_address: [qc?.address, qc?.city, qc?.country].filter(Boolean).join("\n") || "",
          issue_date: new Date().toISOString().split("T")[0],
          due_date: dueDate,
          line_items: line_items.length > 0 ? line_items : f.line_items,
          tax_rate: Number(quote.tax_rate ?? 0),
          discount: 0,
          notes: quote.notes || "",
          terms_conditions: quote.terms_conditions || DEFAULT_INVOICE_TERMS_BODY,
          currency: quote.currency || f.currency || user?.currency || "ZAR",
          number: generateNumber("invoice", clientName),
          document_logo_url: (quote.owner_logo_url && String(quote.owner_logo_url).trim()) || "",
        }));
        toast({
          title: "Quote loaded",
          description: "Client, lines, and totals are filled from the quote. Edit as needed, then save.",
          variant: "default",
        });
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Could not load quote",
            description: e?.message || "Try again or create the invoice manually.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docType, quoteIdParam, toast, user?.currency]);

  useEffect(() => {
    if (!clientIdParam || (docType !== "invoice" && docType !== "quote")) return;
    const c = clients.find((x) => x.id === clientIdParam);
    if (!c) return;
    setForm((f) => {
      if (f.client_id === clientIdParam) return f;
      return {
        ...f,
        client_id: c.id,
        client_name: c.name,
        client_email: c.email || "",
        client_address: [c.address, c.city, c.country].filter(Boolean).join("\n"),
        number: generateNumber(docType, c.name || ""),
      };
    });
  }, [clientIdParam, clients, docType]);

  useEffect(() => {
    if (docType !== "quote" || !templateIdParam) return;
    let cancelled = false;
    (async () => {
      setPrefillLoading(true);
      try {
        const template = await withTimeoutRetry(() => QuoteTemplate.get(templateIdParam), 20000, 1);
        if (cancelled || !template) {
          if (!cancelled && templateIdParam) {
            toast({
              title: "Template not found",
              description: "Create the quote from scratch or pick another template.",
              variant: "destructive",
            });
          }
          return;
        }
        const rawItems = Array.isArray(template.items) ? template.items : [];
        const line_items = rawItems.map((item) => {
          const qty = Number(item.quantity ?? 1);
          const rate = Number(item.unit_price ?? item.rate ?? item.price ?? 0);
          const total = Number(item.total_price ?? item.total ?? qty * rate);
          const desc =
            [item.service_name || item.name, item.description].filter(Boolean).join("\n") || "Item";
          return { description: desc, quantity: qty, unit_price: rate, total };
        });
        setForm((f) => ({
          ...f,
          line_items: line_items.length > 0 ? line_items : f.line_items,
          notes: template.notes || f.notes,
          terms_conditions: template.terms_conditions || f.terms_conditions,
          tax_rate: Number(template.tax_rate ?? f.tax_rate ?? 0),
        }));
        toast({
          title: "Template loaded",
          description: "Lines and terms are filled from the template. Select a client and review.",
          variant: "default",
        });
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Could not load template",
            description: e?.message || "Try again without a template.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docType, templateIdParam, toast]);

  useEffect(() => {
    if (docType !== "quote" || duplicateLastParam !== "1") return;
    let cancelled = false;
    (async () => {
      setPrefillLoading(true);
      try {
        const list = await withTimeoutRetry(() => Quote.list("-created_date", { limit: 1 }), 20000, 1);
        const last = list?.[0];
        if (cancelled) return;
        if (!last) {
          toast({
            title: "No quote to duplicate",
            description: "Create a quote first, or start from a blank document.",
            variant: "destructive",
          });
          return;
        }
        const full = await withTimeoutRetry(() => Quote.get(last.id), 20000, 1);
        if (cancelled || !full) return;
        let qc = null;
        if (full.client_id) {
          try {
            qc = await withTimeoutRetry(() => Client.get(full.client_id), 15000, 1);
          } catch {
            qc = null;
          }
        }
        const items = Array.isArray(full.items) ? full.items : [];
        const dueDate = full.valid_until
          ? new Date(full.valid_until).toISOString().split("T")[0]
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const line_items = items.map((item) => {
          const qty = Number(item.quantity ?? 1);
          const rate = Number(item.unit_price ?? item.rate ?? 0);
          const total = Number(item.total_price ?? item.total ?? qty * rate);
          const desc =
            [item.service_name || item.name, item.description].filter(Boolean).join("\n") || "Item";
          return { description: desc, quantity: qty, unit_price: rate, total };
        });
        const clientName = qc?.name || "";
        setForm((f) => ({
          ...f,
          client_id: full.client_id || "",
          client_name: qc?.name || "",
          client_email: qc?.email || "",
          client_address: [qc?.address, qc?.city, qc?.country].filter(Boolean).join("\n") || "",
          issue_date: new Date().toISOString().split("T")[0],
          due_date: dueDate,
          line_items: line_items.length > 0 ? line_items : f.line_items,
          tax_rate: Number(full.tax_rate ?? 0),
          discount: 0,
          notes: full.notes || "",
          terms_conditions: full.terms_conditions || "",
          currency: full.currency || f.currency || user?.currency || "ZAR",
          number: generateNumber("quote", clientName),
          document_logo_url: (full.owner_logo_url && String(full.owner_logo_url).trim()) || "",
        }));
        toast({
          title: "Last quote duplicated",
          description: "Review lines and client, then save as a new quote.",
          variant: "default",
        });
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Could not duplicate",
            description: e?.message || "Try again.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docType, duplicateLastParam, toast, user?.currency]);

  useEffect(() => {
    if (!loadedQuote?.client_id || clients.length === 0) return;
    setForm((f) => {
      if (f.client_id !== loadedQuote.client_id) return f;
      if (f.client_name && f.client_name.trim()) return f;
      const qc = clients.find((c) => c.id === loadedQuote.client_id);
      if (!qc) return f;
      return {
        ...f,
        client_name: qc.name,
        client_email: qc.email || "",
        client_address: [qc.address, qc.city, qc.country].filter(Boolean).join("\n"),
      };
    });
  }, [loadedQuote, clients]);

  const update = useCallback((field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
  }, []);

  const selectClient = useCallback(
    (clientId) => {
      const client = clients.find((c) => c.id === clientId);
      if (client) {
        setForm((f) => ({
          ...f,
          client_id: client.id,
          client_name: client.name,
          client_email: client.email || "",
          client_address: [client.address, client.city, client.country].filter(Boolean).join("\n"),
        }));
      }
    },
    [clients]
  );

  const handleDocumentLogoChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !user?.id) return;
      setDocumentLogoUploading(true);
      try {
        const url = await uploadDocumentLogo(file, user.id);
        setForm((f) => ({ ...f, document_logo_url: url }));
        toast({
          title: "Document logo",
          description: "This logo is used on this invoice or quote only. Your profile logo is unchanged.",
          variant: "default",
        });
      } catch (err) {
        toast({
          title: "Upload failed",
          description: err?.message || "Could not upload image.",
          variant: "destructive",
        });
      } finally {
        setDocumentLogoUploading(false);
      }
    },
    [toast, user?.id]
  );

  const computed = useMemo(() => {
    const subtotal = (form.line_items || []).reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const afterDiscount = Math.max(0, subtotal - (Number(form.discount) || 0));
    const taxAmount = afterDiscount * ((Number(form.tax_rate) || 0) / 100);
    const total = afterDiscount + taxAmount;
    return { subtotal, subtotal_before_discount: subtotal, afterDiscount, tax_amount: taxAmount, total };
  }, [form.line_items, form.tax_rate, form.discount]);

  const profileLogoUrl = user?.logo_url || user?.company_logo_url || null;
  const effectiveOwnerLogoUrl = useMemo(() => {
    const override = (form.document_logo_url || "").trim();
    return override || profileLogoUrl || null;
  }, [form.document_logo_url, profileLogoUrl]);

  const previewDoc = useMemo(
    () => ({
      ...form,
      subtotal: computed.afterDiscount,
      tax_amount: computed.tax_amount,
      total: computed.total,
      owner_logo_url: effectiveOwnerLogoUrl,
    }),
    [form, computed, effectiveOwnerLogoUrl]
  );

  const resolveClientId = async () => {
    if (form.client_id) return form.client_id;
    const name = (form.client_name || "").trim();
    if (!name) {
      throw new Error("Enter a client name or select an existing client.");
    }
    const created = await Client.create({
      name,
      email: (form.client_email || "").trim() || null,
      address: (form.client_address || "").trim() || null,
    });
    if (!created?.id) throw new Error("Could not create client.");
    setClients((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
    setForm((f) => ({ ...f, client_id: created.id }));
    return created.id;
  };

  const persistInvoice = async (sendNow) => {
    const clientId = await resolveClientId();
    const clientRow = clients.find((c) => c.id === clientId) || {
      name: form.client_name,
    };

    const number =
      (form.number || "").trim() ||
      generateNumber("invoice", clientRow.name || form.client_name);

    const subtotal = computed.afterDiscount;
    const tax_rate = Number(form.tax_rate) || 0;
    const tax_amount = computed.tax_amount;
    const total_amount = computed.total;

    const owner_company_name = (form.company_name || "").trim() || user?.company_name || null;
    const owner_company_address = (form.company_address || "").trim() || user?.company_address || null;
    const owner_email = (form.company_email || "").trim() || user?.email || null;
    const owner_currency = form.currency || user?.currency || "ZAR";
    const owner_logo_url = effectiveOwnerLogoUrl;

    const delivery_date =
      (form.due_date || "").trim() ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const items = buildPaidLineItems(form.line_items, form.discount);

    const invoiceToCreate = {
      client_id: clientId,
      invoice_number: number,
      status: "draft",
      project_title: form.client_name ? `Invoice for ${form.client_name}` : "Invoice",
      project_description: "",
      invoice_date: form.issue_date,
      delivery_date,
      delivery_address: (form.client_address || "").trim() || "",
      subtotal,
      tax_rate,
      tax_amount,
      total_amount,
      currency: form.currency || "ZAR",
      notes: form.notes || "",
      terms_conditions: form.terms_conditions || "",
      owner_company_name,
      owner_company_address,
      owner_email,
      owner_currency,
      owner_logo_url,
      items,
    };

    const [invoicesCheck, itemsCheck] = await Promise.all([
      verifyTableExists(supabase, "invoices"),
      verifyTableExists(supabase, "invoice_items"),
    ]);
    if (!invoicesCheck.exists || !itemsCheck.exists) {
      toast({
        title: "Database tables unavailable",
        description:
          invoicesCheck.error ||
          itemsCheck.error ||
          "Confirm invoices and invoice_items exist in Supabase and refresh the schema cache if needed.",
        variant: "destructive",
      });
      return;
    }

    const created = await withTimeoutRetry(() => Invoice.create(invoiceToCreate), 45000, 2);
    const invoiceId = created?.id;

    if (sendNow) {
      if (!invoiceId) {
        toast({
          title: "Could not send",
          description: "The invoice was not returned with an id. Check the list or try again.",
          variant: "destructive",
        });
        return;
      }
      await sendInvoiceToClient(invoiceId);
      window.open(
        createPageUrl(`InvoicePDF?id=${invoiceId}&download=true`),
        "_blank",
        "noopener,noreferrer"
      );
      toast({
        title: "Invoice sent",
        description: `Marked sent and opened PDF for ${number}.`,
        variant: "success",
      });
      setTimeout(() => navigate(createPageUrl("Invoices")), 1500);
      return;
    }

    toast({
      title: "Invoice created",
      description: `Saved as draft ${number}.`,
      variant: "success",
    });
    setTimeout(() => navigate(createPageUrl("Invoices")), 800);
  };

  const handleSave = async () => {
    const items = buildPaidLineItems(form.line_items, form.discount);
    if (items.length === 0) {
      toast({
        title: "Add line items",
        description: "Enter at least one line with a description or amounts.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (docType === "quote") {
        const clientId = await resolveClientId();
        const clientRow = clients.find((c) => c.id === clientId) || {
          name: form.client_name,
        };

        const number =
          (form.number || "").trim() ||
          generateNumber(docType, clientRow.name || form.client_name);

        const subtotal = computed.afterDiscount;
        const tax_rate = Number(form.tax_rate) || 0;
        const tax_amount = computed.tax_amount;
        const total_amount = computed.total;

        const owner_company_name = (form.company_name || "").trim() || user?.company_name || null;
        const owner_company_address = (form.company_address || "").trim() || user?.company_address || null;
        const owner_email = (form.company_email || "").trim() || user?.email || null;
        const owner_currency = form.currency || user?.currency || "ZAR";
        const owner_logo_url = effectiveOwnerLogoUrl;

        const valid_until =
          (form.due_date || "").trim() ||
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

        const quoteToCreate = {
          client_id: clientId,
          quote_number: number,
          status: "draft",
          project_title: form.client_name ? `Quote for ${form.client_name}` : "Quote",
          project_description: "",
          valid_until,
          subtotal,
          tax_rate,
          tax_amount,
          total_amount,
          currency: form.currency || "ZAR",
          notes: form.notes || "",
          terms_conditions: form.terms_conditions || "",
          owner_company_name,
          owner_company_address,
          owner_email,
          owner_currency,
          owner_logo_url,
          ...snapshotDocumentBrandForPersist(user),
          items,
        };

        await withTimeoutRetry(() => Quote.create(quoteToCreate), 45000, 2);
        toast({
          title: "Quote created",
          description: `Saved as ${number}.`,
          variant: "success",
        });
        setTimeout(() => navigate(createPageUrl("Quotes")), 800);
        return;
      }

      await persistInvoice(false);
    } catch (err) {
      console.error("CreateDocument save:", err);
      const msg = err?.message || String(err);
      toast({
        title: "Could not save",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendInvoiceNow = async () => {
    if (docType !== "invoice") return;
    const items = buildPaidLineItems(form.line_items, form.discount);
    if (items.length === 0) {
      toast({
        title: "Add line items",
        description: "Enter at least one line with a description or amounts.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await persistInvoice(true);
    } catch (err) {
      console.error("CreateDocument send:", err);
      const msg = err?.message || String(err);
      toast({
        title: "Could not send invoice",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const currencyCode = form.currency || "ZAR";
  const listHref = docType === "quote" ? createPageUrl("Quotes") : createPageUrl("Invoices");

  const queuePdfDownload = useCallback(() => {
    const items = buildPaidLineItems(form.line_items, form.discount);
    if (items.length === 0) {
      toast({
        title: "Nothing to export",
        description: "Add at least one line item with a description or amounts.",
        variant: "destructive",
      });
      return;
    }
    if (!showPreview) setShowPreview(true);
    setPdfExportPending(true);
  }, [form.line_items, form.discount, showPreview, toast]);

  useEffect(() => {
    if (!showPreview) {
      setPdfExportPending(false);
      setPdfExporting(false);
    }
  }, [showPreview]);

  useEffect(() => {
    if (!pdfExportPending || !showPreview) return;

    let cancelled = false;

    const run = async () => {
      await waitForPreviewPaint();
      if (cancelled) return;

      const el = previewPdfRef.current;
      if (!el) {
        if (!cancelled) {
          toast({
            title: "Preview not ready",
            description: "Try Download PDF again in a moment.",
            variant: "destructive",
          });
          setPdfExportPending(false);
        }
        return;
      }

      if (!cancelled) setPdfExporting(true);
      try {
        const numberRaw =
          (form.number || "").trim() || (docType === "quote" ? "quote-draft" : "invoice-draft");
        await downloadDocumentPreviewFromElement(el, docType, numberRaw);
        if (!cancelled) {
          toast({ title: "PDF downloaded", description: "Saved to your downloads folder.", variant: "success" });
        }
      } catch (err) {
        if (!cancelled) {
          console.error("CreateDocument PDF:", err);
          toast({
            title: "Could not create PDF",
            description: err?.message || "Try again or use Preview first.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) {
          setPdfExporting(false);
          setPdfExportPending(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [pdfExportPending, showPreview, docType, form.number, toast]);

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(listHref)} aria-label="Back to list">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              New {docType === "quote" ? "Quote" : "Invoice"}
            </h1>
            <p className="text-sm text-muted-foreground">#{form.number}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? "Edit" : "Preview"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={queuePdfDownload}
            disabled={saving || loadingClients || prefillLoading || pdfExporting}
          >
            {pdfExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download PDF
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingClients} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {docType === "invoice" ? "Save draft" : "Save"}
          </Button>
          {docType === "invoice" && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleSendInvoiceNow}
              disabled={saving || loadingClients || prefillLoading}
              className="gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send now
            </Button>
          )}
        </div>
      </div>

      {showPreview ? (
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-xl">
            <DocumentPreview
              ref={previewPdfRef}
              doc={previewDoc}
              docType={docType}
              clients={clients}
              user={user}
              hideStatus={pdfExportPending || pdfExporting}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your company</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company name</Label>
                    <Input
                      value={form.company_name}
                      onChange={(e) => update("company_name", e.target.value)}
                      placeholder={user?.company_name || "Your company"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      value={form.company_email}
                      onChange={(e) => update("company_email", e.target.value)}
                      placeholder={user?.email || "billing@company.com"}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Textarea
                    value={form.company_address}
                    onChange={(e) => update("company_address", e.target.value)}
                    placeholder={user?.company_address || "Business address"}
                    rows={2}
                  />
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div>
                    <Label className="text-foreground">Logo on this document</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Optional. Use a different logo than your profile (e.g. sub-brand) for this invoice or quote
                      only. Max {logoMaxSizeLabel()}, PNG, JPEG, or SVG.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                      {effectiveOwnerLogoUrl ? (
                        <img
                          src={effectiveOwnerLogoUrl}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={documentLogoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                        className="hidden"
                        onChange={handleDocumentLogoChange}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={documentLogoUploading || !user?.id}
                        onClick={() => documentLogoInputRef.current?.click()}
                      >
                        {documentLogoUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Upload"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!(form.document_logo_url || "").trim()}
                        onClick={() => update("document_logo_url", "")}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Use profile logo
                      </Button>
                    </div>
                  </div>
                  {(form.document_logo_url || "").trim() ? (
                    <p className="text-xs text-muted-foreground">Using a document-only logo for this draft.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Using your profile logo{profileLogoUrl ? "" : " (add one in Settings)"}.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Client</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {clients.length > 0 && (
                  <div className="space-y-2">
                    <Label>Select existing client</Label>
                    <Select
                      value={form.client_id ? form.client_id : CLIENT_SELECT_NONE}
                      onValueChange={(v) => {
                        if (v === CLIENT_SELECT_NONE) {
                          setForm((f) => ({ ...f, client_id: "" }));
                          return;
                        }
                        selectClient(v);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingClients ? "Loading…" : "Choose a client…"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CLIENT_SELECT_NONE}>Choose a client…</SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Separator />
                <p className="text-xs text-muted-foreground">
                  New clients are saved to your Paidly client list when you save this document.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Client name</Label>
                    <Input
                      value={form.client_name}
                      onChange={(e) => update("client_name", e.target.value)}
                      placeholder="Client name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Client email</Label>
                    <Input
                      value={form.client_email}
                      onChange={(e) => update("client_email", e.target.value)}
                      placeholder="client@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Client address</Label>
                  <Textarea
                    value={form.client_address}
                    onChange={(e) => update("client_address", e.target.value)}
                    placeholder="Billing / delivery address"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Line items</CardTitle>
              </CardHeader>
              <CardContent>
                <LineItemsEditor
                  items={form.line_items}
                  onChange={(items) => update("line_items", items)}
                  currencyCode={form.currency}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Document number</Label>
                  <Input value={form.number} onChange={(e) => update("number", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{docType === "quote" ? "Issue date" : "Invoice date"}</Label>
                  <Input type="date" value={form.issue_date} onChange={(e) => update("issue_date", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{docType === "quote" ? "Valid until" : "Due date"}</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => update("due_date", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select
                    value={CURRENCIES.includes(form.currency) ? form.currency : "ZAR"}
                    onValueChange={(v) => update("currency", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal (lines)</span>
                  <span className="font-medium">{formatCurrency(computed.subtotal, currencyCode)}</span>
                </div>
                <div className="space-y-2">
                  <Label>Discount ({currencyCode})</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.discount}
                    onChange={(e) => update("discount", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">After discount</span>
                  <span>{formatCurrency(computed.afterDiscount, currencyCode)}</span>
                </div>
                <div className="space-y-2">
                  <Label>Tax rate (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.tax_rate}
                    onChange={(e) => update("tax_rate", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(computed.tax_amount, currencyCode)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="font-bold text-lg">Total</span>
                  <span className="font-bold text-lg text-primary">
                    {formatCurrency(computed.total, currencyCode)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Payment terms, thank you message…"
                  rows={3}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
