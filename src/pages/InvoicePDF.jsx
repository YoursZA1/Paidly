import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Invoice, Client, User, BankingDetail } from '@/api/entities';
import { fetchPublicInvoicePayload } from '@/api/publicInvoiceApiClient';
import { getPublicInvoiceViewerToken } from '@/lib/publicInvoiceViewerStorage';
import { withTimeoutRetry, ENTITY_GET_TIMEOUT_MS } from '@/utils/fetchWithTimeout';
import { Button } from '@/components/ui/button';
import generatePdfFromElement from '@/utils/generatePdfFromElement';
import { buildInvoiceTemplatePdfCaptureProps } from '@/components/pdf/InvoiceTemplatePdfCapture';
import { mapInvoiceDataForTemplate } from '@/utils/invoiceTemplateData';
import DocumentPreview from '@/components/DocumentPreview';
import { recordToStyledPreviewDoc } from '@/utils/documentPreviewData';
import { readInvoiceDraftRaw } from '@/utils/invoiceDraftStorage';
import { isAbortError } from '@/utils/retryOnAbort';
const OPTIONAL_FETCH_TIMEOUT_MS = 30000;
const OPTIONAL_FETCH_RETRIES = 2;

function clientsArrayForPreview(clientForTemplate, clientId) {
    if (!clientForTemplate || typeof clientForTemplate !== 'object') return [];
    const withId = clientForTemplate.id ? clientForTemplate : { ...clientForTemplate, id: clientId };
    return [withId];
}

export default function InvoicePDF() {
    const location = useLocation();
    const navigate = useNavigate();
    const urlParams = new URLSearchParams(location.search);
    const invoiceId = urlParams.get('id');
    const shareToken = urlParams.get('token');
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
                const raw = readInvoiceDraftRaw();
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
            } finally {
                setIsLoading(false);
            }
            return;
        }
        if (shareToken) {
            loadInvoiceByShareToken(shareToken);
            return;
        }
        if (invoiceId) {
            loadInvoiceData();
            return;
        }
        setIsLoading(false);
        setLoadError('Invalid PDF link. Use your invoice link or open Download from the app.');
    }, [invoiceId, shareToken, isDraft]);

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
                if (isAbortError(e) || cancelled) return;
                console.error('Auto-download PDF failed, falling back to print:', e);
                window.print();
            } finally {
                setIsGeneratingPdf(false);
            }
        }, 600);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [autoDownload, isLoading, invoice]);

    /** Public /view/:token and email links: no login; same API as InvoiceView. */
    const loadInvoiceByShareToken = async (token) => {
        setLoadError(null);
        setIsLoading(true);
        try {
            const viewerToken = getPublicInvoiceViewerToken(token);
            const payload = await fetchPublicInvoicePayload(token, viewerToken);
            if (payload.requiresEmailVerification) {
                setLoadError(
                    'This invoice requires email verification. Open the invoice link in your browser, confirm your email, then try downloading the PDF again from that page.'
                );
                return;
            }
            const currentInvoice = payload.invoice;
            if (!currentInvoice) {
                setLoadError('Invoice not found or link has expired.');
                return;
            }
            setInvoice({
                ...currentInvoice,
                ...mapInvoiceDataForTemplate(currentInvoice),
            });
            if (payload.client) {
                setClient(payload.client);
            } else {
                setClient(
                    currentInvoice.client_name
                        ? { name: currentInvoice.client_name, email: currentInvoice.client_email || '', address: '', phone: '' }
                        : { name: 'Client', email: '', address: '', phone: '' }
                );
            }
            setUser(null);
            setBankingDetail(payload.bankingDetail || null);
        } catch (error) {
            console.error('Error loading public invoice for PDF:', error);
            setLoadError(error?.message || 'Failed to load invoice. Please check the link and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const loadInvoiceData = async () => {
        setLoadError(null);
        setIsLoading(true);
        try {
            const invoiceRecord = await withTimeoutRetry(() => Invoice.get(invoiceId), ENTITY_GET_TIMEOUT_MS, 2);
            if (!invoiceRecord) {
                return;
            }

            const optionalFetch = async (fn, fallback = null) => {
                try {
                    return await withTimeoutRetry(fn, OPTIONAL_FETCH_TIMEOUT_MS, OPTIONAL_FETCH_RETRIES);
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
        } finally {
            setIsLoading(false);
        }
    };

    const clientFallback = useMemo(
        () => client || { name: invoice?.client_name || 'Client' },
        [client, invoice?.client_name]
    );

    const pdfPack = useMemo(
        () =>
            invoice
                ? buildInvoiceTemplatePdfCaptureProps(invoice, clientFallback, user, bankingDetail)
                : null,
        [invoice, clientFallback, user, bankingDetail]
    );

    const previewDoc = useMemo(
        () =>
            invoice && pdfPack
                ? recordToStyledPreviewDoc(invoice, pdfPack.clientForTemplate, 'invoice', pdfPack.resolvedUser)
                : null,
        [invoice, pdfPack]
    );

    const clientsForPreview = useMemo(
        () => clientsArrayForPreview(pdfPack?.clientForTemplate, invoice?.client_id),
        [pdfPack?.clientForTemplate, invoice?.client_id]
    );

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
                    <Button
                        variant="outline"
                        onClick={() => (shareToken ? loadInvoiceByShareToken(shareToken) : loadInvoiceData())}
                        className="rounded-lg"
                    >
                        Try again
                    </Button>
                    <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-lg">Back</Button>
                </div>
            </div>
        );
    }

    if (!invoice || !pdfPack) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-gray-600">
                    {isDraft ? 'No draft data found. Please try downloading from the Create Invoice page again.' : 'Document not found.'}
                </p>
                <Button variant="outline" onClick={() => navigate(-1)} className="rounded-lg">Back</Button>
            </div>
        );
    }

    const handleDownloadPDF = async () => {
        if (!printRef.current || isGeneratingPdf) return;
        setIsGeneratingPdf(true);
        try {
            const filename = `${invoice.invoice_number || 'invoice'}.pdf`;
            await generatePdfFromElement(printRef.current, filename);
        } catch (e) {
            if (isAbortError(e)) return;
            console.error('PDF generation failed, falling back to print:', e);
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
                <div className="pdf-wrapper w-full max-w-none mx-auto px-page sm:px-6">
                    <div className="no-print invoice-pdf-actions mb-4 flex flex-col sm:flex-row justify-end gap-2">
                        <Button
                            onClick={() => (isDraft ? window.close() : navigate(-1))}
                            variant="outline"
                            className="btn-back px-4 sm:px-6 py-2.5 sm:py-2 rounded-lg text-sm border-slate-200"
                        >
                            {isDraft ? 'Close' : 'Back'}
                        </Button>
                        <Button
                            onClick={handleDownloadPDF}
                            disabled={isGeneratingPdf}
                            className="btn-download bg-primary text-primary-foreground hover:bg-primary/90 px-4 sm:px-6 py-2.5 sm:py-2 rounded-lg text-sm font-medium"
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
                                        docType="invoice"
                                        clients={clientsForPreview}
                                        user={pdfPack.resolvedUser}
                                        bankingDetail={bankingDetail}
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
