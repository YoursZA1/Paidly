import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { Quote, Client, User } from '@/api/entities';
import { format, isValid, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DocumentPageSkeleton } from '@/components/shared/PageSkeleton';
import generatePdfFromElement from '@/utils/generatePdfFromElement';
import { useRef } from 'react';

// Import templates
import ClassicTemplate from '@/components/invoice/templates/ClassicTemplate';
import ModernTemplate from '@/components/invoice/templates/ModernTemplate';
import MinimalTemplate from '@/components/invoice/templates/MinimalTemplate';
import BoldTemplate from '../components/invoice/templates/BoldTemplate';

const TEMPLATES = {
    classic: ClassicTemplate,
    modern: ModernTemplate,
    minimal: MinimalTemplate,
    bold: BoldTemplate
};

const DRAFT_STORAGE_KEY = 'quoteDraft';

export default function QuotePDF() {
    const location = useLocation();
    const navigate = useNavigate();
    const urlParams = new URLSearchParams(location.search);
    const quoteId = urlParams.get('id');
    const isDraft = urlParams.get('draft') === '1';
    const autoDownload = urlParams.get('download') === 'true';
    const [quote, setQuote] = useState(null);
    const [client, setClient] = useState(null);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const printRef = useRef(null);

    useEffect(() => {
        if (isDraft) {
            try {
                const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
                if (raw) {
                    const draft = JSON.parse(raw);
                    const { quoteData, client: draftClient, user: draftUser } = draft;
                    if (quoteData && draftClient && draftUser) {
                        const mappedQuote = {
                            quote_number: quoteData.quote_number || 'Draft',
                            created_date: quoteData.created_date || quoteData.invoice_date || quoteData.createdAt || new Date().toISOString(),
                            valid_until: quoteData.valid_until,
                            status: quoteData.status || 'draft',
                            items: (quoteData.items || []).map((item) => ({
                                service_name: item.name || item.service_name || 'Item',
                                description: item.description || '',
                                quantity: Number(item.quantity ?? item.qty ?? 1),
                                unit_price: Number(item.unit_price ?? item.rate ?? item.price ?? 0),
                                total_price: Number(item.total_price ?? item.total ?? 0),
                            })),
                            subtotal: Number(quoteData.subtotal ?? 0),
                            tax_rate: Number(quoteData.tax_rate ?? 0),
                            tax_amount: Number(quoteData.tax_amount ?? 0),
                            total_amount: Number(quoteData.total_amount ?? 0),
                            notes: quoteData.notes || '',
                            terms_conditions: quoteData.terms_conditions || '',
                            project_title: quoteData.project_title || '',
                            project_description: quoteData.project_description || '',
                        };
                        setQuote(mappedQuote);
                        setClient(draftClient);
                        setUser(draftUser);
                    }
                }
            } catch (e) {
                console.error('Failed to load draft quote:', e);
            }
            setIsLoading(false);
            return;
        }
        if (quoteId) {
            loadQuoteData();
        }
    }, [quoteId, isDraft]);

    useEffect(() => {
        if (!autoDownload || isLoading || !quote || !printRef.current) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            if (cancelled) return;
            try {
                setIsGeneratingPdf(true);
                const filename = `${quote.quote_number || 'quote'}.pdf`;
                await generatePdfFromElement(printRef.current, filename);
            } catch (e) {
                console.error('Auto-download quote PDF failed, falling back to print:', e);
                window.print();
            } finally {
                if (!cancelled) setIsGeneratingPdf(false);
            }
        }, 600);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [autoDownload, isLoading, quote]);

    const loadQuoteData = async () => {
        try {
            const quoteData = await Quote.get(quoteId);
            const [clientData, userData] = await Promise.all([
                Client.get(quoteData.client_id),
                User.me()
            ]);
            setQuote(quoteData);
            setClient(clientData);
            setUser(userData);
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setIsLoading(false);
    };

    const safeFormatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = parseISO(dateStr);
        return isValid(date) ? format(date, 'MMMM d, yyyy') : 'N/A';
    };

    if (isLoading) {
        return <DocumentPageSkeleton title="Loading quote…" />;
    }

    if (!quote || !client || !user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-gray-600">
                    {isDraft ? 'No draft data found. Please try downloading from the Create Quote page again.' : 'Document not found.'}
                </p>
                <Button variant="outline" onClick={() => (isDraft ? window.close() : navigate(-1))} className="rounded-lg">Close</Button>
            </div>
        );
    }

    const userCurrency = user?.currency || 'ZAR';
    const templateKey = user?.invoice_template || 'classic';
    const TemplateComponent = TEMPLATES[templateKey] || TEMPLATES.classic;

    // Map quote data to invoice structure for template compatibility
    const mappedInvoice = {
        ...quote,
        items: Array.isArray(quote?.items) ? quote.items : [],
        invoice_number: quote.quote_number, // Use quote number as invoice number
        status: quote.status,
        type: 'QUOTE', // Add type to distinguish in template if needed
        delivery_date: quote.valid_until, // Map valid until to due date
    };

    const handleDownloadPDF = async () => {
        if (!printRef.current || !quote) return;
        try {
            setIsGeneratingPdf(true);
            const filename = `${quote.quote_number || 'quote'}.pdf`;
            await generatePdfFromElement(printRef.current, filename);
        } catch (e) {
            console.error('Quote PDF generation failed, falling back to print:', e);
            window.print();
        } finally {
            setIsGeneratingPdf(false);
        }
    };

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
                            onClick={handleDownloadPDF}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 sm:px-6 py-2 rounded-lg text-sm"
                            disabled={isGeneratingPdf}
                        >
                            {isGeneratingPdf ? 'Generating…' : 'Download PDF'}
                        </Button>
                    </div>

                    <div className="print-container pdf-page bg-white shadow-lg rounded-lg p-4 sm:p-8 print:shadow-none print:rounded-none overflow-x-auto">
                        <div className="pdf-content">
                            <div ref={printRef}>
                                <TemplateComponent
                                    invoice={mappedInvoice}
                                    client={client}
                                    user={user}
                                    bankingDetail={null} // Quotes might not have banking details attached yet
                                    userCurrency={userCurrency}
                                    safeFormatDate={safeFormatDate}
                                    documentTitle="QUOTE" // Pass explicit title override
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}