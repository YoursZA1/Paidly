import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPublicApiBase } from '@/api/backendClient';
import { decidePublicQuote, fetchPublicQuotePayload } from '@/api/publicQuoteApiClient';
import { profileForQuotePreview } from '@/utils/documentPreviewData';
import { downloadQuotePdfBlob, generateQuotePDF } from '@/components/pdf/generateQuotePDF';
import { formatCurrency } from '@/components/CurrencySelector';
import { QUOTE_STATUS, normalizeQuoteStatus } from '@shared/commercial/documentStatuses.js';
import PublicDocumentPortal, {
    PublicDocumentSheet,
    PublicPortalMessage,
    formatPortalDate,
} from '@/components/documents/PublicDocumentPortal';

function quoteDecisionCopy(status) {
    if (status === QUOTE_STATUS.accepted) return "Thank you. This quote has been accepted.";
    if (status === QUOTE_STATUS.declined) return "This quote has been declined.";
    if (status === QUOTE_STATUS.expired) return "This quote has expired.";
    if (status === QUOTE_STATUS.converted) return "This quote has been converted to an invoice.";
    return "";
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
            <PublicPortalMessage title="Loading quote">
                <p className="text-center text-sm text-slate-500">Fetching the document…</p>
            </PublicPortalMessage>
        );
    }

    if (!quote) {
        return (
            <PublicPortalMessage title="Quote not found">
                <p className="text-center text-sm text-slate-500">This link does not match a quote.</p>
            </PublicPortalMessage>
        );
    }

    const downloadPdf = () => {
        if (!pdfBlob || !quote) return;
        downloadQuotePdfBlob(pdfBlob, `${quote.quote_number || "quote"}.pdf`);
    };

    const status = normalizeQuoteStatus(quote.status);
    const canDecide = [QUOTE_STATUS.sent, QUOTE_STATUS.viewed].includes(status);
    const decisionMessage = quoteDecisionCopy(status);
    const currency = quote.currency || quote.owner_currency || "ZAR";
    const validUntil = formatPortalDate(quote.valid_until || quote.due_date);
    const companyName = quote.owner_company_name || user?.company_name || user?.name || "Quote";

    const decide = async (action) => {
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
    };

    return (
        <PublicDocumentPortal
            companyName={companyName}
            documentLabel="Quote"
            documentNumber={quote.quote_number}
            summary={quote.project_title || ""}
            amountLabel="Total"
            amount={formatCurrency(quote.total_amount, currency)}
            meta={validUntil ? `Valid until ${validUntil}` : ""}
            actions={
                <>
                    <Button
                        variant="outline"
                        className="gap-2 border-slate-200 bg-white"
                        onClick={downloadPdf}
                        disabled={!pdfBlob}
                    >
                        <Download className="h-4 w-4" />
                        <span className="sm:hidden">{pdfBlob ? "PDF" : "…"}</span>
                        <span className="hidden sm:inline">{pdfBlob ? "Download PDF" : "Preparing PDF…"}</span>
                    </Button>
                    {canDecide ? (
                        <Button variant="outline" className="border-slate-200 bg-white" onClick={() => decide("reject")} disabled={Boolean(deciding)}>
                            {deciding === "reject" ? "Declining…" : "Decline"}
                        </Button>
                    ) : null}
                    {canDecide ? (
                        <Button onClick={() => decide("accept")} disabled={Boolean(deciding)}>
                            {deciding === "accept" ? "Accepting…" : "Accept"}
                        </Button>
                    ) : null}
                </>
            }
        >
            {decisionMessage ? (
                <p className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{decisionMessage}</p>
            ) : null}
            {decideError ? <p className="mb-4 text-sm text-red-600">{decideError}</p> : null}
            <PublicDocumentSheet>
                {pdfUrl ? (
                    <iframe
                        title={`${quote.quote_number || "Quote"} PDF`}
                        src={pdfUrl}
                        className="h-[1123px] w-full bg-white"
                    />
                ) : (
                    <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                        {pdfError || "Preparing the quote…"}
                    </div>
                )}
            </PublicDocumentSheet>
        </PublicDocumentPortal>
    );
}
