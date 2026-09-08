import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { formatCurrency } from '@/components/CurrencySelector';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import DocumentLayout from '@/components/shared/DocumentLayout';
import { getPublicApiBase } from '@/api/backendClient';
import { decidePublicQuote, fetchPublicQuotePayload } from '@/api/publicQuoteApiClient';
import { createPageUrl } from '@/utils';
import { QUOTE_STATUS, normalizeQuoteStatus, quoteStatusLabel } from '@shared/commercial/documentStatuses.js';

// New component introduced in the outline
function PublicQuoteContent({ quote, client, user }) {
    if (!quote || !client || !user) {
        // This state should ideally be prevented by parent's isLoading/!quote checks.
        // If props are missing due to some error, we can render a placeholder or null.
        // For production, consider using Skeleton components here during loading,
        // but for now, we assume this component only renders when data is ready.
        return (
            <div className="p-6">
                <Skeleton className="h-6 w-1/4 mb-4" />
                <Skeleton className="h-4 w-1/2 mb-8" />
                <Skeleton className="h-40 w-full mb-8" />
                <Skeleton className="h-4 w-3/4" />
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 mb-8">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Bill To:</h3>
                    <p className="text-gray-600 font-medium">{client.name}</p>
                    {client.address && <p className="text-gray-600">{client.address}</p>}
                    {client.city && <p className="text-gray-600">{client.city}, {client.state} {client.zip}</p>}
                    {client.email && <p className="text-gray-600">{client.email}</p>}
                </div>
                <div className="md:text-right">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Quote Details:</h3>
                    <p className="text-gray-600">Quote Date: {format(new Date(quote.created_date), 'MMMM d, yyyy')}</p>
                    {(quote.valid_until || quote.due_date) && (
                      <p className="text-gray-600">
                        Valid until: {format(new Date(quote.valid_until || quote.due_date), 'MMMM d, yyyy')}
                      </p>
                    )}
                    <p className="text-gray-600">
                      Status: <span className="capitalize">{quoteStatusLabel(quote.status)}</span>
                    </p>
                </div>
            </div>

            <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Items:</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200">
                        <thead>
                            <tr>
                                <th className="py-2 px-4 border-b text-left text-gray-700">Description</th>
                                <th className="py-2 px-4 border-b text-right text-gray-700">Quantity</th>
                                <th className="py-2 px-4 border-b text-right text-gray-700">Rate</th>
                                <th className="py-2 px-4 border-b text-right text-gray-700">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {quote.items && quote.items.length > 0 ? (
                                quote.items.map((item, index) => (
                                    <tr key={index}>
                                        <td className="py-2 px-4 border-b text-gray-800">{item.description}</td>
                                        <td className="py-2 px-4 border-b text-right text-gray-800">{item.quantity}</td>
                                        <td className="py-2 px-4 border-b text-right text-gray-800">{formatCurrency(item.rate, quote.currency)}</td>
                                        <td className="py-2 px-4 border-b text-right text-gray-800">{formatCurrency(item.quantity * item.rate, quote.currency)}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="4" className="py-4 px-4 text-center text-gray-500">No items on this quote.</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan="3" className="py-2 px-4 text-right font-semibold text-gray-800">Subtotal:</td>
                                <td className="py-2 px-4 text-right font-semibold text-gray-800">{formatCurrency(quote.subtotal, quote.currency)}</td>
                            </tr>
                            {quote.tax_rate > 0 && (
                                <tr>
                                    <td colSpan="3" className="py-2 px-4 text-right font-semibold text-gray-800">Tax ({quote.tax_rate}%):</td>
                                    <td className="py-2 px-4 text-right font-semibold text-gray-800">{formatCurrency(quote.tax_amount, quote.currency)}</td>
                                </tr>
                            )}
                            {quote.discount_amount > 0 && (
                                <tr>
                                    <td colSpan="3" className="py-2 px-4 text-right font-semibold text-gray-800">Discount:</td>
                                    <td className="py-2 px-4 text-right font-semibold text-gray-800">-{formatCurrency(quote.discount_amount, quote.currency)}</td>
                                </tr>
                            )}
                            <tr>
                                <td colSpan="3" className="py-2 px-4 text-right text-xl font-bold text-gray-900">Total:</td>
                                <td className="py-2 px-4 text-right text-xl font-bold text-gray-900">{formatCurrency(quote.total, quote.currency)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {quote.notes && (
                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Notes:</h3>
                    <p className="text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
                </div>
            )}

            {quote.terms && (
                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Terms & Conditions:</h3>
                    <p className="text-gray-600 whitespace-pre-wrap">{quote.terms}</p>
                </div>
            )}

            {quote.canDecide ? (
                <div className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-5 text-center">
                    <p className="mb-4 text-sm text-gray-700">Please let us know if you would like to proceed.</p>
                    <div className="flex flex-col justify-center gap-3 sm:flex-row">
                        <Button onClick={() => quote.onDecide("accept")} disabled={quote.deciding}>
                            {quote.deciding === "accept" ? "Accepting…" : "Accept quote"}
                        </Button>
                        <Button variant="outline" onClick={() => quote.onDecide("reject")} disabled={quote.deciding}>
                            {quote.deciding === "reject" ? "Rejecting…" : "Reject quote"}
                        </Button>
                    </div>
                    {quote.decideError ? <p className="mt-3 text-sm text-red-600">{quote.decideError}</p> : null}
                </div>
            ) : null}
            {quote.decisionMessage ? (
                <p className="mb-8 text-center text-sm font-medium text-gray-800">{quote.decisionMessage}</p>
            ) : null}

            <div className="text-center text-gray-500 text-sm mt-12">
                <p>Generated by {user.name} from {user.company_name}</p>
                {user.email && <p>{user.email}</p>}
                {user.phone && <p>{user.phone}</p>}
            </div>
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
        } catch (error) {
            console.error('Error loading public quote:', error);
            // Optionally set quote/client/user to null on error to display error message
            setQuote(null);
            setClient(null);
            setUser(null);
        } finally {
            setIsLoading(false); // Set loading false after data is fetched or an error occurs
        }
    }, [shareToken]);

    useEffect(() => {
        if (shareToken) {
            loadQuoteData();
        }
    }, [loadQuoteData, shareToken]);

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

    // Render using DocumentLayout and PublicQuoteContent
    return (
        <DocumentLayout
            user={user} // Pass user data for company logo and info in header
            title="QUOTE" // Title for the document header
            documentNumber={quote.quote_number} // Quote number for the header
            date={format(new Date(quote.created_date), 'MMMM d, yyyy')} // Date for the header
            downloadUrl={createPageUrl(`QuotePDF?id=${quote.id}`)}
        >
            <PublicQuoteContent
                quote={{
                    ...quote,
                    canDecide: [QUOTE_STATUS.sent, QUOTE_STATUS.viewed].includes(normalizeQuoteStatus(quote.status)),
                    deciding,
                    decideError,
                    decisionMessage:
                        normalizeQuoteStatus(quote.status) === QUOTE_STATUS.accepted
                            ? "Thank you. This quote has been accepted."
                            : normalizeQuoteStatus(quote.status) === QUOTE_STATUS.declined
                              ? "This quote has been rejected."
                              : normalizeQuoteStatus(quote.status) === QUOTE_STATUS.expired
                                ? "This quote has expired."
                                : normalizeQuoteStatus(quote.status) === QUOTE_STATUS.converted
                                  ? "This quote has been converted to an invoice."
                                  : "",
                    onDecide: async (action) => {
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
                    },
                }}
                client={client}
                user={user}
            />
        </DocumentLayout>
    );
}
