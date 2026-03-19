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
                .invoice-layout {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) 320px;
                    gap: 24px;
                    align-items: start;
                    margin-bottom: 32px;
                }
                .invoice > .header {
                    margin-bottom: 24px;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }
                .invoice-meta {
                    text-align: right;
                }
                .invoice-meta .invoice-number {
                    display: block;
                    font-weight: 700;
                    letter-spacing: 0.02em;
                    white-space: nowrap;
                }
                .invoice-number {
                    white-space: nowrap;
                }
                .currency-value {
                    text-align: right;
                    white-space: nowrap;
                    font-variant-numeric: tabular-nums lining-nums;
                    font-feature-settings: 'tnum' 1, 'lnum' 1;
                }
                .header,
                .client,
                .summary,
                .notes {
                    page-break-inside: avoid;
                }
                .invoice > .client {
                    margin-bottom: 24px;
                }
                .invoice .items {
                    width: 100%;
                }
                .items {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 24px;
                    table-layout: fixed;
                }
                .items th {
                    text-align: left;
                    font-size: 12px;
                    text-transform: uppercase;
                    padding: 10px;
                    border-bottom: 2px solid #e5e7eb;
                }
                .items td {
                    padding: 12px;
                    border-bottom: 1px solid #e5e7eb;
                    vertical-align: top;
                }
                .items th:nth-child(1),
                .items td:nth-child(1) { width: 50%; }
                .items th:nth-child(2),
                .items td:nth-child(2) { width: 10%; text-align: center; }
                .items th:nth-child(3),
                .items td:nth-child(3),
                .items th:nth-child(4),
                .items td:nth-child(4) { width: 20%; text-align: right; }
                .items tr {
                    page-break-inside: avoid;
                }
                .items thead {
                    display: table-header-group;
                }
                .invoice .summary {
                    align-self: start;
                }
                .summary {
                    width: 300px;
                    margin-left: auto;
                    margin-top: 24px;
                    page-break-inside: avoid;
                }
                .summary .row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .summary .total {
                    margin-top: 12px;
                    padding: 14px;
                    border: 2px solid #111;
                    background: #111;
                    color: #fff;
                    font-weight: bold;
                    font-size: 18px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .invoice .notes {
                    margin-top: 32px;
                    font-size: 12px;
                    color: #555;
                }
                .invoice-layout-main {
                    min-width: 0;
                }
                .invoice-layout-sidebar {
                    width: 320px;
                    justify-self: end;
                }
                .invoice-summary {
                    width: 320px;
                    margin-left: auto;
                    margin-top: 24px;
                }
                .invoice-layout .invoice-summary {
                    width: 320px;
                    max-width: 100%;
                    margin-top: 0;
                    margin-left: auto;
                }
                .invoice-summary .row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 12px;
                    color: #6b7280;
                }
                .total-box {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #fef3f2;
                    border: 1px solid #fca5a5;
                    padding: 16px;
                    border-radius: 12px;
                }
                .total-box strong {
                    font-size: 24px;
                    color: #ea580c;
                }
                .pdf-content .invoice-table tbody {
                    min-height: 200px;
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
                        font-family: 'Inter', sans-serif;
                        color: #111;
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
                        table-layout: fixed !important;
                        border: 1px solid #ddd;
                    }
                    .pdf-content .invoice-table thead { display: table-header-group !important; }
                    .pdf-content .invoice-table tbody { display: table-row-group !important; }
                    .pdf-content .invoice-table tr { display: table-row !important; page-break-inside: avoid !important; }
                    .pdf-content .invoice-table th,
                    .pdf-content .invoice-table td { display: table-cell !important; }
                    .pdf-content .invoice-table th { background: #f5e7df !important; }
                    .pdf-content .items {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        margin-top: 24px !important;
                        table-layout: fixed !important;
                    }
                    .pdf-content .items th {
                        text-align: left !important;
                        font-size: 12px !important;
                        text-transform: uppercase !important;
                        padding: 10px !important;
                        border-bottom: 2px solid #e5e7eb !important;
                    }
                    .pdf-content .items td {
                        padding: 12px !important;
                        border-bottom: 1px solid #e5e7eb !important;
                        vertical-align: top !important;
                    }
                    .pdf-content .items th:nth-child(1),
                    .pdf-content .items td:nth-child(1) { width: 50% !important; }
                    .pdf-content .items th:nth-child(2),
                    .pdf-content .items td:nth-child(2) { width: 10% !important; text-align: center !important; }
                    .pdf-content .items th:nth-child(3),
                    .pdf-content .items td:nth-child(3),
                    .pdf-content .items th:nth-child(4),
                    .pdf-content .items td:nth-child(4) { width: 20% !important; text-align: right !important; }
                    .pdf-content .items tr { page-break-inside: avoid !important; }
                    .pdf-content .summary {
                        width: 300px !important;
                        margin-left: auto !important;
                        margin-top: 24px !important;
                        page-break-inside: avoid !important;
                    }
                    .pdf-content .summary .row {
                        display: flex !important;
                        justify-content: space-between !important;
                        margin-bottom: 8px !important;
                    }
                    .pdf-content .summary .total {
                        margin-top: 12px !important;
                        padding: 14px !important;
                        border: 2px solid #111 !important;
                        background: #111 !important;
                        color: #fff !important;
                        font-weight: bold !important;
                        font-size: 18px !important;
                        display: flex !important;
                        justify-content: space-between !important;
                        align-items: center !important;
                    }
                    .pdf-content .invoice-table td {
                        padding: 16px !important;
                        vertical-align: top !important;
                    }
                    .pdf-content .invoice-table th:nth-child(1),
                    .pdf-content .invoice-table td:nth-child(1) {
                        width: 50% !important;
                        white-space: normal !important;
                        word-break: break-word !important;
                    }
                    .pdf-content .invoice-table th:nth-child(2),
                    .pdf-content .invoice-table td:nth-child(2) {
                        width: 10% !important;
                        text-align: center !important;
                    }
                    .pdf-content .invoice-table th:nth-child(3),
                    .pdf-content .invoice-table td:nth-child(3),
                    .pdf-content .invoice-table th:nth-child(4),
                    .pdf-content .invoice-table td:nth-child(4) {
                        width: 20% !important;
                        text-align: right !important;
                    }
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
                    size: A4;
                    margin: 20mm;
                }
                @media screen {
                    .pdf-page { max-width: 8.27in; margin: 0 auto; }
                    .pdf-content table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                    .pdf-content .invoice-table { table-layout: fixed; }
                    .pdf-content th,
                    .pdf-content td { word-break: break-word; overflow-wrap: anywhere; }
                    .pdf-content .invoice-table td {
                        padding: 16px;
                        vertical-align: top;
                    }
                    .pdf-content .invoice-table th:nth-child(1),
                    .pdf-content .invoice-table td:nth-child(1) {
                        width: 50%;
                        white-space: normal;
                        word-break: break-word;
                    }
                    .pdf-content .invoice-table th:nth-child(2),
                    .pdf-content .invoice-table td:nth-child(2) {
                        width: 10%;
                        text-align: center;
                    }
                    .pdf-content .invoice-table th:nth-child(3),
                    .pdf-content .invoice-table td:nth-child(3),
                    .pdf-content .invoice-table th:nth-child(4),
                    .pdf-content .invoice-table td:nth-child(4) {
                        width: 20%;
                        text-align: right;
                    }
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
                    .header {
                        flex-direction: column;
                        gap: 12px;
                    }
                    .invoice-meta {
                        text-align: left;
                    }
                    .invoice-layout {
                        grid-template-columns: minmax(0, 1fr);
                        gap: 16px;
                        margin-bottom: 24px;
                    }
                    .invoice-layout-sidebar {
                        width: 100%;
                        justify-self: stretch;
                    }
                    .invoice-summary { width: 100%; }
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
                                client={client || { name: invoice.client_name || 'Client' }}
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