import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Invoice, Client, User, BankingDetail } from '@/api/entities';
import { format, isValid, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import generatePdfFromElement from '@/utils/generatePdfFromElement';

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

    const pdfRef = useRef(null);

    useEffect(() => {
        if (!autoDownload || isLoading || !invoice) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            if (cancelled || !pdfRef.current) return;
            try {
                setIsGeneratingPdf(true);
                const filename = `${invoice.invoice_number || 'invoice'}.pdf`;
                await generatePdfFromElement(pdfRef.current, filename);
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
        try {
            const invoiceRecord = await Invoice.get(invoiceId);
            if (!invoiceRecord) {
                setIsLoading(false);
                return;
            }
            
            const [clientData, userData, bankingData] = await Promise.all([
                Client.get(invoiceRecord.client_id),
                User.me(),
                invoiceRecord.banking_detail_id 
                    ? BankingDetail.get(invoiceRecord.banking_detail_id).catch(() => null)
                    : Promise.resolve(null)
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

    if (!invoice || !client || !user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-gray-600">
                    {isDraft ? 'No draft data found. Please try downloading from the Create Invoice page again.' : 'Document not found.'}
                </p>
                <Button variant="outline" onClick={() => navigate(-1)} className="rounded-lg">Back</Button>
            </div>
        );
    }
    
    const userCurrency = user?.currency || 'ZAR';
    const templateKey = user?.invoice_template || 'classic';
    const TemplateComponent = TEMPLATES[templateKey] || TEMPLATES.classic;

    return (
        <>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { margin: 0; background-color: white; }
                    .print-container { box-shadow: none !important; margin: 0 !important; border: none !important; }
                    .pdf-page { padding: 0 !important; }
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
                }
                @media (max-width: 640px) {
                    .pdf-wrapper { padding: 12px !important; }
                    .pdf-page { padding: 16px !important; border-radius: 12px !important; }
                    .pdf-content { font-size: 12px; }
                    .pdf-content h1 { font-size: 20px; }
                    .pdf-content h2 { font-size: 18px; }
                    .pdf-content h3 { font-size: 14px; }
                    .pdf-content table { font-size: 12px; }
                }
            `}</style>

            <div className="min-h-screen bg-gray-100 py-4 sm:py-8 print:bg-white print:py-0">
                <div className="pdf-wrapper w-full max-w-4xl mx-auto px-2 sm:px-4">
                    <div className="no-print mb-4 flex justify-end gap-2">
                        <Button
                            onClick={() => (isDraft ? window.close() : navigate(-1))}
                            variant="outline"
                            className="px-4 sm:px-6 py-2 rounded-lg text-sm"
                        >
                            {isDraft ? 'Close' : 'Back'}
                        </Button>
                        <Button
                            onClick={async () => {
                                if (!pdfRef.current || isGeneratingPdf) return;
                                setIsGeneratingPdf(true);
                                try {
                                    const filename = `${invoice.invoice_number || 'invoice'}.pdf`;
                                    await generatePdfFromElement(pdfRef.current, filename);
                                } catch (e) {
                                    console.error('PDF generation failed, falling back to print:', e);
                                    window.print();
                                } finally {
                                    setIsGeneratingPdf(false);
                                }
                            }}
                            disabled={isGeneratingPdf}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 sm:px-6 py-2 rounded-lg text-sm"
                        >
                            {isGeneratingPdf ? 'Generating PDF…' : 'Download PDF'}
                        </Button>
                    </div>

                    <div className="print-container pdf-page bg-white shadow-lg rounded-lg p-4 sm:p-8 print:shadow-none print:rounded-none overflow-x-auto">
                        <div className="pdf-content" ref={pdfRef}>
                            <TemplateComponent
                                invoice={invoice}
                                client={client}
                                user={user}
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