import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Invoice, Client, User, BankingDetail } from '@/api/entities';
import { withTimeoutRetry } from '@/utils/fetchWithTimeout';
import { format, isValid, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import generatePdfFromElement from '@/utils/generatePdfFromElement';
import InvoicePDFDownloadLink from '@/components/pdf/InvoicePDFDownloadLink';

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
                        const mappedInvoice = {
                            invoice_number: invoiceData.reference_number || invoiceData.invoice_number || 'Draft',
                            delivery_date: invoiceData.delivery_date,
                            created_date: invoiceData.invoice_date || invoiceData.delivery_date,
                            items: (invoiceData.items || []).map((item) => ({
                                service_name: item.name || item.service_name || 'Item',
                                description: item.description || '',
                                quantity: Number(item.quantity ?? item.qty ?? 1),
                                unit_price: Number(item.unit_price ?? item.rate ?? item.price ?? 0),
                                total_price: Number(item.total_price ?? item.total ?? 0),
                            })),
                            subtotal: Number(invoiceData.subtotal ?? 0),
                            tax_rate: Number(invoiceData.tax_rate ?? 0),
                            tax_amount: Number(invoiceData.tax_amount ?? 0),
                            total_amount: Number(invoiceData.total_amount ?? 0),
                            notes: invoiceData.notes || '',
                            terms_conditions: invoiceData.terms_conditions || '',
                            project_title: invoiceData.project_title || '',
                            project_description: invoiceData.project_description || '',
                        };
                        setInvoice(mappedInvoice);
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
            const invoiceRecord = await withTimeoutRetry(() => Invoice.get(invoiceId), 45000, 2);
            if (!invoiceRecord) {
                setIsLoading(false);
                return;
            }

            const [clientData, userData, bankingData] = await withTimeoutRetry(
                () =>
                    Promise.all([
                        Client.get(invoiceRecord.client_id),
                        User.me(),
                        invoiceRecord.banking_detail_id
                            ? BankingDetail.get(invoiceRecord.banking_detail_id).catch(() => null)
                            : Promise.resolve(null),
                    ]),
                45000,
                2
            );

            // Normalize items so templates always get service_name, quantity, unit_price, total_price
            const items = Array.isArray(invoiceRecord.items)
                ? invoiceRecord.items.map((item) => ({
                    service_name: item.service_name || item.name || 'Item',
                    description: item.description || '',
                    quantity: Number(item.quantity ?? item.qty ?? 1),
                    unit_price: Number(item.unit_price ?? item.rate ?? item.price ?? 0),
                    total_price: Number(item.total_price ?? item.total ?? (Number(item.quantity ?? item.qty ?? 1) * Number(item.unit_price ?? item.rate ?? item.price ?? 0))),
                }))
                : [];
            setInvoice({ ...invoiceRecord, items });
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

    if (!invoice || !client) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-gray-600">
                    {isDraft ? 'No draft data found. Please try downloading from the Create Invoice page again.' : 'Document not found.'}
                </p>
                <Button variant="outline" onClick={() => navigate(-1)} className="rounded-lg">Back</Button>
            </div>
        );
    }

    // Fallback user so template always has logo/company/currency (e.g. when User.me() failed or for public view)
    const resolvedUser = user || {
        company_name: invoice.owner_company_name || 'Company',
        logo_url: invoice.company?.logo_url || invoice.owner_logo_url || null,
        company_address: invoice.owner_company_address || '',
        currency: invoice.owner_currency || 'ZAR',
        invoice_template: 'classic',
    };
    const templateKey = resolvedUser?.invoice_template || 'classic';
    const TemplateComponent = TEMPLATES[templateKey] || TEMPLATES.classic;
    const userCurrency = resolvedUser?.currency || invoice.owner_currency || 'ZAR';

    return (
        <>
            <style>{`
                .invoice-pdf-export {
                    width: 210mm !important;
                    max-width: 210mm !important;
                    box-sizing: border-box !important;
                }
                .print-container {
                    width: 800px;
                    margin: 0 auto;
                }
                @media print {
                    .no-print { display: none !important; }
                    body {
                        margin: 0;
                        background-color: white;
                        font-family: Arial, Helvetica, sans-serif;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .print-container { box-shadow: none !important; margin: 0 !important; border: none !important; }
                    .pdf-page { padding: 0 !important; }
                    .invoice-container {
                        width: 210mm !important;
                        height: 297mm !important;
                        padding: 20mm !important;
                        background: white !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    /* Gold standard: invoice line-items table uses real <table> for PDF/print */
                    .pdf-content .invoice-table {
                        display: table !important;
                        width: 100% !important;
                        border-collapse: collapse !important;
                        border: 1px solid #ddd;
                    }
                    .pdf-content .invoice-table thead { display: table-header-group !important; }
                    .pdf-content .invoice-table tbody { display: table-row-group !important; }
                    .pdf-content .invoice-table tr { display: table-row !important; page-break-inside: avoid !important; }
                    .pdf-content .invoice-table th,
                    .pdf-content .invoice-table td { display: table-cell !important; }
                    .pdf-content .invoice-table th { background: #f5e7df !important; }
                    .invoice-container tr,
                    .invoice-container td,
                    .invoice-container th {
                        page-break-inside: avoid !important;
                        white-space: normal !important;
                        word-wrap: break-word !important;
                    }
                    .invoice-container * {
                        text-rendering: optimizeLegibility !important;
                        -webkit-font-smoothing: antialiased !important;
                        -moz-osx-font-smoothing: grayscale !important;
                    }
                }
                @page {
                    margin: 0.5in;
                    size: A4;
                }
                @media screen {
                    .pdf-page { max-width: 8.27in; margin: 0 auto; }
                    .pdf-content table { width: 100%; border-collapse: collapse; }
                    .pdf-content th,
                    .pdf-content td { word-break: break-word; }
                    .invoice-container * {
                        text-rendering: optimizeLegibility !important;
                        -webkit-font-smoothing: antialiased !important;
                        -moz-osx-font-smoothing: grayscale !important;
                    }
                }
                /* Mobile: same structure as web, responsive spacing and stacking */
                @media (max-width: 640px) {
                    .pdf-wrapper { padding: 12px 8px !important; }
                    .pdf-page { padding: 12px 16px !important; border-radius: 12px !important; }
                    .pdf-content { font-size: 14px; }
                    .pdf-content h1 { font-size: 1.5rem; }
                    .pdf-content h2 { font-size: 1.25rem; }
                    .pdf-content h3 { font-size: 0.875rem; }
                    .pdf-content table { font-size: 13px; display: table; }
                    .pdf-content thead { display: table-header-group; }
                    .pdf-content tr { display: table-row; }
                    .pdf-content th, .pdf-content td { display: table-cell; padding: 0.5rem 0.375rem; }
                    .invoice-pdf-actions { flex-direction: row; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
                    .invoice-pdf-actions .btn-back { order: 1; }
                    .invoice-pdf-actions .btn-download { order: 2; flex: 1; min-width: 0; }
                }
            `}</style>

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
                        <div className="pdf-content invoice-container min-w-0 w-full max-w-full" style={{ maxWidth: '210mm' }}>
                            <TemplateComponent
                                invoice={invoice}
                                client={client}
                                user={resolvedUser}
                                bankingDetail={bankingDetail}
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