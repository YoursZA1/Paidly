import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Invoice, Client, User, BankingDetail } from '@/api/entities';
import { withTimeoutRetry, ENTITY_GET_TIMEOUT_MS } from '@/utils/fetchWithTimeout';
import { format, isValid, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import generatePdfFromElement from '@/utils/generatePdfFromElement';
import InvoicePDFDownloadLink from '@/components/pdf/InvoicePDFDownloadLink';
import { effectiveBankingDetail } from '@/utils/effectiveBankingDetail';
import invoiceTemplatePdfCaptureCss from '@/components/pdf/invoiceTemplatePdfCapture.css?raw';
import { mapInvoiceDataForTemplate, normalizeInvoiceTemplateKey } from '@/utils/invoiceTemplateData';

// Import templates
import ClassicTemplate from '@/components/invoice/templates/ClassicTemplate';
import ModernTemplate from '@/components/invoice/templates/ModernTemplate';
import MinimalTemplate from '@/components/invoice/templates/MinimalTemplate';
import BoldTemplate from '@/components/invoice/templates/BoldTemplate';

const TEMPLATES = {
    classic: ClassicTemplate,
    modern: ModernTemplate,
    minimal: MinimalTemplate,
    bold: BoldTemplate
};

const DRAFT_STORAGE_KEY = 'invoiceDraft';
const OPTIONAL_FETCH_TIMEOUT_MS = 15000;

export default function InvoicePDF() {
    const location = useLocation();
    const navigate = useNavigate();
    const urlParams = new URLSearchParams(location.search);
    const invoiceId = urlParams.get('id');
    const isDraft = urlParams.get('draft') === '1';
    const autoDownload = urlParams.get('download') === 'true';
    const [invoice, setInvoice] = useState(null);
    const [client, setClient] = useState(null);
    const [user, setUser] = useState(null);
    const [bankingDetail, setBankingDetail] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [loadError, setLoadError] = useState(null);

    useEffect(() => {
        if (isDraft) {
            try {
                const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
                if (raw) {
                    const draft = JSON.parse(raw);
                    const { invoiceData, client: draftClient, user: draftUser } = draft;
                    if (invoiceData && draftClient && draftUser) {
                        setInvoice({
                            ...invoiceData,
                            ...mapInvoiceDataForTemplate(invoiceData),
                        });
                        setClient(draftClient);
                        setUser(draftUser);
                        setBankingDetail(draft.bankingDetail || null);
                    }
                }
            } catch (e) {
                console.error('Failed to load draft invoice:', e);
            }
            setIsLoading(false);
            return;
        }
        if (invoiceId) {
            loadInvoiceData();
        }
    }, [invoiceId, isDraft]);

    const printRef = useRef(null);

    useEffect(() => {
        if (!autoDownload || isLoading || !invoice) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            if (cancelled || !printRef.current) return;
            try {
                setIsGeneratingPdf(true);
                const filename = `${invoice.invoice_number || 'invoice'}.pdf`;
                await generatePdfFromElement(printRef.current, filename);
            } catch (e) {
                if (!cancelled) {
                    console.error('Auto-download PDF failed, falling back to print:', e);
                    window.print();
                }
            } finally {
                setIsGeneratingPdf(false);
            }
        }, 600);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [autoDownload, isLoading, invoice]);

    const loadInvoiceData = async () => {
        setLoadError(null);
        setIsLoading(true);
        try {
            const invoiceRecord = await withTimeoutRetry(() => Invoice.get(invoiceId), ENTITY_GET_TIMEOUT_MS, 2);
            if (!invoiceRecord) {
                setIsLoading(false);
                return;
            }

            const optionalFetch = async (fn, fallback = null) => {
                try {
                    return await withTimeoutRetry(fn, OPTIONAL_FETCH_TIMEOUT_MS, 1);
                } catch (error) {
                    console.warn('Optional invoice PDF dependency failed to load:', error?.message || error);
                    return fallback;
                }
            };

            const [clientData, userData, bankingData] = await Promise.all([
                optionalFetch(
                    () => Client.get(invoiceRecord.client_id),
                    invoiceRecord.client_name
                        ? { name: invoiceRecord.client_name, email: invoiceRecord.client_email || '' }
                        : null
                ),
                optionalFetch(() => User.me(), null),
                invoiceRecord.banking_detail_id
                    ? optionalFetch(() => BankingDetail.get(invoiceRecord.banking_detail_id), null)
                    : Promise.resolve(null),
            ]);

            setInvoice({
                ...invoiceRecord,
                ...mapInvoiceDataForTemplate(invoiceRecord),
            });
            setClient(clientData || null);
            setUser(userData);
            setBankingDetail(bankingData || null);
        } catch (error) {
            console.error('Error loading invoice data:', error);
            setLoadError(error?.message || 'Failed to load invoice. Please check your connection and try again.');
        }
        setIsLoading(false);
    };

    const safeFormatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = parseISO(dateStr);
        return isValid(date) ? format(date, 'MMMM d, yyyy') : 'N/A';
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (loadError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
                <p className="text-gray-600 text-center max-w-md">
                    {loadError.includes('timed out') ? 'The request took too long. This can happen when the server is busy or your connection is slow.' : loadError}
                </p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => loadInvoiceData()} className="rounded-lg">Try again</Button>
                    <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-lg">Back</Button>
                </div>
            </div>
        );
    }

    if (!invoice) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-gray-600">
                    {isDraft ? 'No draft data found. Please try downloading from the Create Invoice page again.' : 'Document not found.'}
                </p>
                <Button variant="outline" onClick={() => navigate(-1)} className="rounded-lg">Back</Button>
            </div>
        );
    }

    const templateKey =
        normalizeInvoiceTemplateKey(invoice.invoice_template) ||
        normalizeInvoiceTemplateKey(user?.invoice_template) ||
        'classic';

    // Prefer snapshot fields on the invoice so print/PDF matches the saved document and create preview.
    const resolvedUser = user
        ? {
              ...user,
              logo_url:
                  invoice.owner_logo_url ||
                  user.logo_url ||
                  user.company_logo_url ||
                  invoice.company?.logo_url ||
                  null,
              company_name: invoice.owner_company_name || user.company_name,
              company_address: invoice.owner_company_address || user.company_address,
              currency: invoice.currency || invoice.owner_currency || user.currency || 'ZAR',
              invoice_template: templateKey,
          }
        : {
              company_name: invoice.owner_company_name || 'Company',
              logo_url: invoice.company?.logo_url || invoice.owner_logo_url || null,
              company_address: invoice.owner_company_address || '',
              currency: invoice.currency || invoice.owner_currency || 'ZAR',
              invoice_template: templateKey,
              invoice_header: '',
          };
    const TemplateComponent = TEMPLATES[templateKey] || TEMPLATES.classic;
    const userCurrency = resolvedUser?.currency || invoice.currency || invoice.owner_currency || 'ZAR';
    const bankingForTemplates = effectiveBankingDetail(bankingDetail, resolvedUser);

    return (
        <>
            <style>{invoiceTemplatePdfCaptureCss}</style>

            <div className="min-h-screen bg-gray-100 py-4 sm:py-8 print:bg-white print:py-0">
                <div className="pdf-wrapper w-full max-w-4xl mx-auto px-2 sm:px-4">
                    <div className="no-print invoice-pdf-actions mb-4 flex flex-col sm:flex-row justify-end gap-2">
                        <Button
                            onClick={() => (isDraft ? window.close() : navigate(-1))}
                            variant="outline"
                            className="btn-back px-4 sm:px-6 py-2.5 sm:py-2 rounded-lg text-sm border-slate-200"
                        >
                            {isDraft ? 'Close' : 'Back'}
                        </Button>
                        <InvoicePDFDownloadLink
                            invoice={invoice}
                            client={client}
                            user={resolvedUser}
                            bankingDetail={bankingDetail}
                            className="btn-download px-4 sm:px-6 py-2.5 sm:py-2 rounded-lg text-sm font-medium"
                        />
                        <Button
                            onClick={async () => {
                                if (!printRef.current || isGeneratingPdf) return;
                                setIsGeneratingPdf(true);
                                try {
                                    const filename = `${invoice.invoice_number || 'invoice'}.pdf`;
                                    await generatePdfFromElement(printRef.current, filename);
                                } catch (e) {
                                    console.error('PDF generation failed, falling back to print:', e);
                                    window.print();
                                } finally {
                                    setIsGeneratingPdf(false);
                                }
                            }}
                            disabled={isGeneratingPdf}
                            variant="outline"
                            className="px-4 sm:px-6 py-2.5 sm:py-2 rounded-lg text-sm font-medium"
                        >
                            {isGeneratingPdf ? 'Generating PDF…' : 'Download PDF (template)'}
                        </Button>
                    </div>

                    <div ref={printRef} className="print-container pdf-page bg-white shadow-lg rounded-lg p-4 sm:p-8 print:shadow-none print:rounded-none overflow-x-auto">
                        <div className="pdf-content invoice-container invoice-pdf-export min-w-0 w-full max-w-full" style={{ maxWidth: '210mm' }}>
                            <TemplateComponent
                                invoice={invoice}
                                client={client || { name: invoice.client_name || 'Client' }}
                                user={resolvedUser}
                                bankingDetail={bankingForTemplates}
                                userCurrency={userCurrency}
                                safeFormatDate={safeFormatDate}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}