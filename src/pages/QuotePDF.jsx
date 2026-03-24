import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Quote, Client, User } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { DocumentPageSkeleton } from '@/components/shared/PageSkeleton';
import generatePdfFromElement from '@/utils/generatePdfFromElement';
import DocumentPreview from '@/components/DocumentPreview';
import { recordToStyledPreviewDoc, profileForQuotePreview } from '@/utils/documentPreviewData';
import { readQuoteDraftRaw } from '@/utils/invoiceDraftStorage';

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
                const raw = readQuoteDraftRaw();
                if (raw) {
                    const draft = JSON.parse(raw);
                    const { quoteData, client: draftClient, user: draftUser } = draft;
                    if (quoteData && draftClient && draftUser) {
                        const mappedQuote = {
                            quote_number: quoteData.quote_number || 'Draft',
                            created_date: quoteData.created_date || quoteData.invoice_date || quoteData.createdAt || new Date().toISOString(),
                            valid_until: quoteData.valid_until,
                            status: quoteData.status || 'draft',
                            client_id: quoteData.client_id,
                            items: (quoteData.items || []).map((item) => ({
                                service_name: item.name || item.service_name || 'Item',
                                description: item.description || '',
                                quantity: Number(item.quantity ?? item.qty ?? 1),
                                unit_price: Number(item.unit_price ?? item.rate ?? item.price ?? 0),
                                total_price: Number(item.total_price ?? item.total ?? 0),
                                item_type: item.item_type || 'service',
                            })),
                            subtotal: Number(quoteData.subtotal ?? 0),
                            tax_rate: Number(quoteData.tax_rate ?? 0),
                            tax_amount: Number(quoteData.tax_amount ?? 0),
                            total_amount: Number(quoteData.total_amount ?? 0),
                            notes: quoteData.notes || '',
                            terms_conditions: quoteData.terms_conditions || '',
                            project_title: quoteData.project_title || '',
                            project_description: quoteData.project_description || '',
                            owner_company_name: quoteData.owner_company_name,
                            owner_company_address: quoteData.owner_company_address,
                            owner_email: quoteData.owner_email,
                            owner_logo_url: quoteData.owner_logo_url,
                            currency: quoteData.currency,
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

    const clientResolved = useMemo(
        () => client || { name: quote?.client_name || 'Client', id: quote?.client_id },
        [client, quote?.client_name, quote?.client_id]
    );

    const profile = useMemo(() => profileForQuotePreview(quote, user), [quote, user]);

    const previewDoc = useMemo(
        () => (quote ? recordToStyledPreviewDoc(quote, clientResolved, 'quote', profile) : null),
        [quote, clientResolved, profile]
    );

    const clientsForPreview = useMemo(() => {
        if (!clientResolved || typeof clientResolved !== 'object') return [];
        const c = clientResolved;
        const withId = c.id ? c : { ...c, id: quote?.client_id };
        return [withId];
    }, [clientResolved, quote?.client_id]);

    if (isLoading) {
        return <DocumentPageSkeleton title="Loading quote…" />;
    }

    if (!quote || !user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-gray-600">
                    {isDraft ? 'No draft data found. Please try downloading from the Create Quote page again.' : 'Document not found.'}
                </p>
                <Button variant="outline" onClick={() => (isDraft ? window.close() : navigate(-1))} className="rounded-lg">Close</Button>
            </div>
        );
    }

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

            <div className="min-h-[100dvh] w-full bg-gray-100 py-2 sm:py-4 print:bg-white print:min-h-0 print:py-0">
                <div className="pdf-wrapper w-full max-w-none mx-auto px-2 sm:px-4">
                    <div className="no-print quote-pdf-actions mb-4 flex flex-col sm:flex-row justify-end gap-2">
                        <Button
                            onClick={() => (isDraft ? window.close() : navigate(-1))}
                            variant="outline"
                            className="px-4 sm:px-6 py-2.5 sm:py-2 rounded-lg text-sm border-slate-200"
                        >
                            {isDraft ? 'Close' : 'Back'}
                        </Button>
                        <Button
                            onClick={handleDownloadPDF}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 sm:px-6 py-2.5 sm:py-2 rounded-lg text-sm font-medium"
                            disabled={isGeneratingPdf}
                        >
                            {isGeneratingPdf ? 'Generating PDF…' : 'Download PDF'}
                        </Button>
                    </div>

                    <div className="print-container pdf-page bg-white shadow-lg rounded-lg p-4 sm:p-8 print:shadow-none print:rounded-none overflow-x-auto max-w-[210mm] mx-auto">
                        <div className="pdf-content">
                            <div ref={printRef}>
                                {previewDoc ? (
                                    <DocumentPreview
                                        doc={previewDoc}
                                        docType="quote"
                                        clients={clientsForPreview}
                                        user={profile}
                                        hideStatus
                                    />
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
