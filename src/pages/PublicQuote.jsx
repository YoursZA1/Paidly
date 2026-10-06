import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getPublicApiBase } from '@/api/backendClient';
import { decidePublicQuote, fetchPublicQuotePayload } from '@/api/publicQuoteApiClient';
import { profileForQuotePreview } from '@/utils/documentPreviewData';
import { downloadQuotePdfBlob, generateQuotePDF } from '@/components/pdf/generateQuotePDF';
import { QUOTE_STATUS, normalizeQuoteStatus } from '@shared/commercial/documentStatuses.js';

function PublicQuoteDecision({ quote, deciding, decideError, onDecide }) {
    const status = normalizeQuoteStatus(quote?.status);
    const canDecide = [QUOTE_STATUS.sent, QUOTE_STATUS.viewed].includes(status);
    const decisionMessage =
        status === QUOTE_STATUS.accepted
            ? "Thank you. This quote has been accepted."
            : status === QUOTE_STATUS.declined
              ? "This quote has been rejected."
              : status === QUOTE_STATUS.expired
                ? "This quote has expired."
                : status === QUOTE_STATUS.converted
                  ? "This quote has been converted to an invoice."
                  : "";
    if (!canDecide && !decisionMessage) return null;
    return (
        <div className="mx-auto mb-6 max-w-3xl rounded-lg border border-gray-200 bg-white p-5 text-center">
            {decisionMessage ? <p className="text-sm font-medium text-gray-800">{decisionMessage}</p> : null}
            {canDecide ? (
                <>
                    <p className="mb-4 text-sm text-gray-700">Please let us know if you would like to proceed.</p>
                    <div className="flex flex-col justify-center gap-3 sm:flex-row">
                        <Button onClick={() => onDecide("accept")} disabled={Boolean(deciding)}>
                            {deciding === "accept" ? "Accepting…" : "Accept quote"}
                        </Button>
                        <Button variant="outline" onClick={() => onDecide("reject")} disabled={Boolean(deciding)}>
                            {deciding === "reject" ? "Rejecting…" : "Reject quote"}
                        </Button>
                    </div>
                    {decideError ? <p className="mt-3 text-sm text-red-600">{decideError}</p> : null}
                </>
            ) : null}
        </div>
    );
}

export default function PublicQuote() {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const shareToken = searchParams.get('token');
    const trackingParam = searchParams.get('tracking');
    const [quote, setQuote] = useState(null);
    const [client, setClient] = useState(null); // New state for client
    const [user, setUser] = useState(null);
    const [banking, setBanking] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [deciding, setDeciding] = useState(null);
    const [decideError, setDecideError] = useState("");

    useEffect(() => {
        if (!trackingParam) return;
        const apiBase = getPublicApiBase();
        fetch(`${apiBase}/api/track-open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: trackingParam }),
        }).catch(() => {});
    }, [trackingParam]);

    const loadQuoteData = useCallback(async () => {
        setIsLoading(true); // Set loading true at the start
        try {
            const payload = await fetchPublicQuotePayload(shareToken);
            const quoteData = payload?.quote || null;
            if (!quoteData) {
                return;
            }

            setQuote(quoteData);
            setClient(payload?.client || null);
            setUser(payload?.owner || null);
            setBanking(payload?.banking || null);
        } catch (error) {
            console.error('Error loading public quote:', error);
            // Optionally set quote/client/user to null on error to display error message
            setQuote(null);
            setClient(null);
            setUser(null);
            setBanking(null);
        } finally {
            setIsLoading(false); // Set loading false after data is fetched or an error occurs
        }
    }, [shareToken]);

    useEffect(() => {
        if (shareToken) {
            loadQuoteData();
        } else {
            setIsLoading(false);
        }
    }, [loadQuoteData, shareToken]);

    const previewUser = useMemo(() => {
        if (!quote) return null;
        return profileForQuotePreview(quote, {
            ...(user || {}),
            company_name: quote.owner_company_name || user?.company_name || user?.name || "",
            company_address: quote.owner_company_address || user?.company_address || "",
            email: quote.owner_email || user?.email || "",
            phone: quote.owner_phone || user?.phone || "",
            logo_url: quote.owner_logo_url || user?.logo_url || "",
            vat_number: quote.owner_vat_number || "",
            currency: quote.currency || quote.owner_currency || user?.currency || "ZAR",
            document_brand_primary: quote.document_brand_primary || user?.document_brand_primary || null,
            document_brand_secondary: quote.document_brand_secondary || user?.document_brand_secondary || null,
        });
    }, [quote, user]);

    const previewClient = useMemo(() => {
        if (!client && !quote) return null;
        return {
            ...(client || {}),
            id: quote?.client_id,
            name: client?.name || quote?.client_name || "",
            email: client?.email || quote?.client_email || "",
            phone: client?.phone || quote?.client_phone || "",
            address: client?.address || "",
            contact_person: client?.contact_person || "",
        };
    }, [client, quote]);

    const [pdfBlob, setPdfBlob] = useState(null);
    const [pdfUrl, setPdfUrl] = useState("");
    const [pdfError, setPdfError] = useState("");

    useEffect(() => {
        if (!quote || !previewUser) return undefined;
        let cancelled = false;
        let objectUrl = "";
        setPdfBlob(null);
        setPdfUrl("");
        setPdfError("");
        (async () => {
            try {
                const blob = await generateQuotePDF({
                    quote,
                    client: previewClient,
                    user: previewUser,
                    bankingDetail: banking,
                });
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                setPdfBlob(blob);
                setPdfUrl(objectUrl);
            } catch (error) {
                console.error("Public quote PDF failed", error);
                if (!cancelled) setPdfError("This quote could not be prepared.");
            }
        })();
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [quote, previewClient, previewUser, banking]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!quote) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900">Quote not found</h2>
                    <p className="text-gray-600 mt-2">The quote you are looking for does not exist or has been removed.</p>
                </div>
            </div>
        );
    }

    const downloadPdf = () => {
        if (!pdfBlob || !quote) return;
        downloadQuotePdfBlob(pdfBlob, `${quote.quote_number || "quote"}.pdf`);
    };

    return (
        <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
            <div className="mx-auto max-w-4xl px-3">
                <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-gray-600">Shared quote preview. No Paidly account is required.</p>
                    <Button onClick={downloadPdf} disabled={!pdfBlob}>
                        {pdfBlob ? "Download PDF" : "Preparing PDF…"}
                    </Button>
                </div>
                <PublicQuoteDecision
                    quote={quote}
                    deciding={deciding}
                    decideError={decideError}
                    onDecide={async (action) => {
                        setDecideError("");
                        setDeciding(action);
                        try {
                            const result = await decidePublicQuote({ shareToken, action });
                            if (result?.quote?.status) {
                                setQuote((prev) => (prev ? { ...prev, status: result.quote.status } : prev));
                            }
                        } catch (error) {
                            setDecideError(error?.message || "Could not update this quote.");
                        } finally {
                            setDeciding(null);
                        }
                    }}
                />
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    {pdfUrl ? (
                        <iframe
                            title={`${quote.quote_number || "Quote"} PDF`}
                            src={pdfUrl}
                            className="h-[1123px] w-full bg-white"
                        />
                    ) : (
                        <div className="flex h-64 items-center justify-center text-sm text-gray-600">
                            {pdfError || "Preparing the quote…"}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
