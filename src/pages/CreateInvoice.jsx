import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Invoice, Client, Service, Quote, BankingDetail } from "@/api/entities";
import InvoiceDetails from "@/components/invoice/InvoiceDetails";
import InvoicePreview from "@/components/invoice/InvoicePreview";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/components/auth/AuthContext";
import { createPageUrl } from "@/utils";
import InvoicePreviewSkeleton from "@/components/invoice/InvoicePreviewSkeleton";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import { supabase } from "@/lib/supabaseClient";
import { verifyTableExists } from "@/utils/supabaseErrorUtils";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Save, Send } from "lucide-react";
import { sendInvoiceToClient } from "@/services/InvoiceSendService";

export default function CreateInvoice() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [bankingDetails, setBankingDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(true);

  const [invoiceData, setInvoiceData] = useState({
    client_id: "",
    project_title: "",
    project_description: "",
    reference_number: "",
    items: [],
    subtotal: 0,
    tax_rate: 0,
    tax_amount: 0,
    total_amount: 0,
    invoice_date: new Date().toISOString().split("T")[0],
    delivery_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    delivery_address: "",
    banking_detail_id: "",
    notes: "",
    terms_conditions: "",
    currency: user?.currency || "USD",
    status: "draft",
  });

  // Load clients, services, and optionally prefill from quote (Convert Quote to Invoice)
  useEffect(() => {
    async function loadInitialData() {
      setLoading(true);
      setError("");
      try {
        const urlParams = new URLSearchParams(location.search);
        const quoteId = urlParams.get("quoteId");
        const clientId = urlParams.get("client_id");

        const [clientsList, servicesList, bankingList, quoteData] = await withTimeoutRetry(() => Promise.all([
          Client.list("-created_date"),
          Service.list("-created_date"),
          BankingDetail.list().catch(() => []),
          quoteId ? Quote.get(quoteId).catch(() => null) : Promise.resolve(null),
        ]), 15000, 2);
        setClients(clientsList || []);
        setServices(servicesList || []);
        setBankingDetails(Array.isArray(bankingList) ? bankingList : []);

        if (quoteData && quoteId) {
          const quote = quoteData;
            const items = Array.isArray(quote?.items) ? quote.items : [];
            const dueDate = quote?.valid_until
              ? new Date(quote.valid_until).toISOString().split("T")[0]
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const quoteClient = quote?.client_id
              ? clientsList.find((c) => c.id === quote.client_id)
              : null;
            const deliveryAddress = [
              quoteClient?.address,
              quoteClient?.name,
              quoteClient?.email ? `Email: ${quoteClient.email}` : "",
              quoteClient?.phone ? `Phone: ${quoteClient.phone}` : "",
            ]
              .filter(Boolean)
              .join("\n");
            const mappedItems = items.map((item) => {
              const qty = Number(item.quantity ?? 1);
              const rate = Number(item.unit_price ?? item.rate ?? 0);
              const total = Number(item.total_price ?? item.total ?? qty * rate);
              return {
                name: item.service_name || item.name || "Item",
                service_name: item.service_name || item.name || "Item",
                description: item.description || "",
                quantity: qty,
                rate,
                total,
                unit_price: rate,
                total_price: total,
              };
            });
            setInvoiceData({
              client_id: quote?.client_id || "",
              project_title: quote?.project_title || "",
              project_description: quote?.project_description || "",
              reference_number: "",
              items: mappedItems,
              subtotal: Number(quote?.subtotal ?? 0),
              tax_rate: Number(quote?.tax_rate ?? 0),
              tax_amount: Number(quote?.tax_amount ?? 0),
              total_amount: Number(quote?.total_amount ?? 0),
              invoice_date: new Date().toISOString().split("T")[0],
              delivery_date: dueDate,
              delivery_address: deliveryAddress.trim() || "",
              banking_detail_id: "",
              notes: quote?.notes || "",
              terms_conditions: quote?.terms_conditions || "",
              currency: user?.currency || "USD",
              status: "draft",
            });
            toast({
              title: "Quote loaded",
              description:
                "Client, items, and totals have been filled from the quote. You can edit and create the invoice.",
              variant: "default",
            });
        } else if (quoteId && !quoteData) {
          toast({
            title: "✗ Quote not found",
            description: "The quote could not be loaded. You can still create an invoice from scratch.",
            variant: "destructive",
          });
        } else if (clientId && clientsList.find((c) => c.id === clientId)) {
          setInvoiceData((prev) => ({ ...prev, client_id: clientId }));
        }
      } catch (err) {
        console.error("Error loading data:", err);
        setError("Failed to load data. Please refresh.");
        toast({
          title: "✗ Error",
          description: "Failed to load clients and services. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, [location.search, toast, user?.currency]);

  async function handleCreateInvoice(options = {}) {
    const sendNow = options && typeof options === "object" && options.sendNow === true;

    if (!invoiceData.client_id) {
      setError("Please select a client.");
      toast({
        title: "✗ Validation Error",
        description: "Please select a client before creating the invoice.",
        variant: "destructive",
      });
      return;
    }

    if (!invoiceData.items || invoiceData.items.length === 0) {
      setError("Please add at least one item.");
      toast({
        title: "✗ Validation Error",
        description: "Please add at least one product or service to the invoice.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setError("");

    try {
      const invoicesCheck = await verifyTableExists(supabase, "invoices");
      const itemsCheck = await verifyTableExists(supabase, "invoice_items");

      if (!invoicesCheck.exists || !itemsCheck.exists) {
        const missingTables = [];
        if (!invoicesCheck.exists) missingTables.push("invoices");
        if (!itemsCheck.exists) missingTables.push("invoice_items");
        const errorMsg = `Missing tables: ${missingTables.join(", ")}. ${invoicesCheck.error || itemsCheck.error || ""}`;
        setError(errorMsg);
        toast({
          title: "✗ Schema Error",
          description: `Tables missing: ${missingTables.join(", ")}. Run scripts/ensure-invoices-schema.sql in Supabase SQL Editor, then scripts/reload-schema-cache.sql.`,
          variant: "destructive",
          duration: 10000,
        });
        setLoading(false);
        return;
      }

      const selectedClient = clients.find((c) => c.id === invoiceData.client_id);
      const getInitials = (name) => {
        if (!name) return "CL";
        const parts = name.trim().split(/\s+/);
        if (parts.length > 1) {
          return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
      };

      const clientInitials = getInitials(selectedClient?.name);
      const now = new Date();
      const datePart = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}`;
      const timePart = `${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}`;
      const invoiceNumber = `INV-${datePart}-${clientInitials}-${timePart}`;

      const invoiceToCreate = {
        ...invoiceData,
        invoice_number: invoiceNumber,
        status: "draft",
        items:
          Array.isArray(invoiceData.items) && invoiceData.items.length > 0
            ? invoiceData.items.map((item) => ({
                service_name: item.name || item.service_name,
                description: item.description || "",
                quantity: Number(item.quantity || item.qty || 1),
                unit_price: Number(item.unit_price || item.rate || item.price || 0),
                total_price: Number(item.total_price || item.total || 0),
              }))
            : [],
      };

      const created = await Invoice.create(invoiceToCreate);
      const invoiceId = created?.id;

      if (sendNow && invoiceId) {
        await sendInvoiceToClient(invoiceId);
        window.open(createPageUrl(`InvoicePDF?id=${invoiceId}&download=true`), "_blank", "noopener,noreferrer");
        toast({
          title: "✓ Invoice Sent",
          description: `Invoice ${invoiceNumber} has been sent and PDF generated.`,
          variant: "success",
        });
      } else {
        toast({
          title: "✓ Invoice Created",
          description: `Invoice ${invoiceNumber} has been saved as draft.`,
          variant: "success",
        });
      }

      setTimeout(() => {
        navigate(createPageUrl("Invoices"));
      }, 1500);
    } catch (err) {
      console.error("Error creating invoice:", err);
      const errorMessage = err.message || err.toString();
      const errorLower = errorMessage.toLowerCase();
      setError(errorMessage);

      let description = `Failed to create invoice: ${errorMessage}`;
      if (errorLower.includes("organization")) {
        description =
          "No organization found. Please contact support or try logging out and back in.";
      } else if (errorLower.includes("permission") || errorLower.includes("rls")) {
        description = "Permission denied. Please check your account permissions.";
      } else if (
        errorLower.includes("schema cache") ||
        errorLower.includes("could not find the table") ||
        errorLower.includes("find the table 'public.invoices'")
      ) {
        description =
          "Invoices DB/cache: Run scripts/ensure-invoices-schema.sql in Supabase SQL Editor, then reload schema.";
      } else if (errorLower.includes("column") || errorLower.includes("does not exist")) {
        description =
          "Database schema mismatch. Run scripts/ensure-invoices-schema.sql in Supabase SQL Editor.";
      }

      toast({
        title: "✗ Error",
        description,
        variant: "destructive",
        duration: description.length > 200 ? 10000 : 5000,
      });
    } finally {
      setLoading(false);
    }
  }

  if (loading && clients.length === 0) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <InvoicePreviewSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-6 bg-[#F9FAFB] min-h-screen">
      {/* 1. Data Entry Column (Left) */}
      <div className="flex-1 max-w-2xl space-y-6">
        <nav className="text-sm text-muted-foreground">
          <Link to={createPageUrl("Invoices")} className="hover:text-foreground transition-colors">
            Invoices
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-medium">New Invoice</span>
        </nav>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">New Invoice</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Generate and send new invoice.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview((p) => !p)}
            className="text-muted-foreground hover:text-foreground"
          >
            {showPreview ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
            {showPreview ? "Hide Preview" : "Show Preview"}
          </Button>
        </div>

        <InvoiceDetails
          invoiceData={invoiceData}
          setInvoiceData={setInvoiceData}
          clients={clients}
          products={[]}
          services={services}
          setServices={setServices}
          setProducts={() => {}}
          onNext={() => {}}
          showNextButton={false}
        />

        {/* Actions when preview is hidden */}
        {!showPreview && (
          <div className="flex flex-wrap gap-3 pt-4">
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-2xl font-bold"
              onClick={() => handleCreateInvoice({ sendNow: true })}
              disabled={loading}
            >
              {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Invoice Now
            </Button>
            <Button
              variant="outline"
              className="border-slate-200 px-6 py-3 rounded-2xl font-bold"
              onClick={() => handleCreateInvoice({ sendNow: false })}
              disabled={loading}
            >
              <Save className="w-4 h-4 mr-2" />
              Save as Draft
            </Button>
          </div>
        )}
      </div>

      {/* 2. Preview Column (Right) - sticky with actions */}
      {showPreview && (
        <div className="lg:w-[450px] shrink-0">
          <div className="sticky top-6">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs font-bold text-slate-400 uppercase">Live Preview</p>
            </div>
            <div className="bg-white rounded-[40px] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden transform scale-95 origin-top">
              <InvoicePreview
                invoiceData={invoiceData}
                clients={clients}
                user={user}
                previewOnly
                loading={false}
                bankingDetail={invoiceData.banking_detail_id ? (bankingDetails.find(b => b.id === invoiceData.banking_detail_id) || null) : null}
              />
            </div>
            <div className="mt-6 space-y-3">
              <Button
                className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-bold shadow-lg shadow-orange-200 transition-all"
                onClick={() => handleCreateInvoice({ sendNow: true })}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </span>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Send Invoice Now
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-all"
                onClick={() => handleCreateInvoice({ sendNow: false })}
                disabled={loading}
              >
                <Save className="w-5 h-5 mr-2" />
                Save as Draft
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
