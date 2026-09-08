
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Invoice } from '@/api/entities';
import {
  fetchPublicInvoicePayload,
  verifyPublicInvoiceEmail,
} from '@/api/publicInvoiceApiClient';
import {
  clearLegacyInvoiceVerificationSessionKeys,
  getPublicInvoiceViewerToken,
  setPublicInvoiceViewerToken,
} from '@/lib/publicInvoiceViewerStorage';
import { formatCurrency } from '../components/CurrencySelector';
import { DocumentPageSkeleton } from '../components/shared/PageSkeleton';
import { AlertCircle, Download, Mail, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getAutoStatusUpdate } from '@/utils/invoiceStatus';
import InvoicePreview from '@/components/invoice/InvoicePreview';
import DocumentPaymentActionBar from '@/components/invoice/DocumentPaymentActionBar';
import InvoicePaymentHistory from '@/components/invoice/InvoicePaymentHistory';
import { fetchDocumentPaymentHistory } from '@/api/documentPaymentApi';
import { normalizeInvoiceTemplateKey, DEFAULT_INVOICE_TEMPLATE } from '@/utils/invoiceTemplateData';
import { parseDocumentBrandHex } from '@/utils/documentBrandColors';
import { resolveIssuerBrand } from '@/lib/documentIssuerBrand';

export default function PublicInvoice() {
    const location = useLocation();
    const [invoice, setInvoice] = useState(null);
    const [client, setClient] = useState(null);
    const [bankingDetail, setBankingDetail] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [emailVerification, setEmailVerification] = useState('');
    const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationError, setVerificationError] = useState('');
    const [sentToEmailHint, setSentToEmailHint] = useState('');
    const [shareToken, setShareToken] = useState('');
    const [paymentHistory, setPaymentHistory] = useState([]);

    useEffect(() => {
        clearLegacyInvoiceVerificationSessionKeys();
    }, []);

    useEffect(() => {
        const fetchInvoiceData = async () => {
            setIsLoading(true);
            try {
                const params = new URLSearchParams(location.search);
                const token = params.get('token');

                if (!token) {
                    setError("Invalid invoice link. No token provided.");
                    return;
                }

                setShareToken(token);
                const viewerToken = getPublicInvoiceViewerToken(token);
                const payload = await fetchPublicInvoicePayload(token, viewerToken);
                const currentInvoice = payload.invoice;
                if (!currentInvoice) {
                    setError("Invoice not found or link has expired.");
                    return;
                }

                if (payload.requiresEmailVerification) {
                    setSentToEmailHint(payload.sentToEmailHint || '');
                    setNeedsEmailVerification(true);
                    setInvoice(currentInvoice);
                    return;
                }

                setNeedsEmailVerification(false);
                setSentToEmailHint('');
                setInvoice(currentInvoice);

                if (payload.client) {
                    setClient(payload.client);
                } else {
                    setClient({ name: "Client", email: "", address: "", phone: "" });
                }

                setBankingDetail(payload.bankingDetail || null);
                const autoUpdate = getAutoStatusUpdate(currentInvoice, { markViewed: true });
                if (autoUpdate) {
                    try {
                        await Invoice.update(currentInvoice.id, autoUpdate);
                        setInvoice(prev => ({ ...prev, ...autoUpdate }));
                    } catch (viewErr) {
                        console.warn("Could not update invoice viewed status:", viewErr);
                    }
                }
                
            } catch (e) {
                console.error("Error fetching public invoice:", e);
                setError(e?.message || "Could not load the invoice. Please check the link and try again.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchInvoiceData();
    }, [location]);

    useEffect(() => {
        if (!invoice?.id || !shareToken || needsEmailVerification) return undefined;
        let cancelled = false;
        fetchDocumentPaymentHistory({ invoiceId: invoice.id, shareToken })
            .then((snap) => {
                if (!cancelled) setPaymentHistory(snap.history || []);
            })
            .catch(() => {
                if (!cancelled) setPaymentHistory([]);
            });
        return () => {
            cancelled = true;
        };
    }, [invoice?.id, shareToken, needsEmailVerification]);

    const handleEmailVerification = async () => {
        if (!emailVerification.trim()) {
            setVerificationError('Please enter your email address');
            return;
        }
        if (!shareToken) {
            setVerificationError('Invalid link.');
            return;
        }

        setIsVerifying(true);
        setVerificationError('');

        try {
            const viewerToken = await verifyPublicInvoiceEmail(shareToken, emailVerification);
            setPublicInvoiceViewerToken(shareToken, viewerToken);
            const payload = await fetchPublicInvoicePayload(shareToken, viewerToken);
            const currentInvoice = payload.invoice;
            if (!currentInvoice || payload.requiresEmailVerification) {
                setVerificationError('Verification failed. Please try again.');
                return;
            }
            setNeedsEmailVerification(false);
            setSentToEmailHint('');
            setInvoice(currentInvoice);
            if (payload.client) {
                setClient(payload.client);
            } else {
                setClient({ name: "Client", email: "", address: "", phone: "" });
            }
            setBankingDetail(payload.bankingDetail || null);
            const autoUpdate = getAutoStatusUpdate(currentInvoice, { markViewed: true });
            if (autoUpdate) {
                try {
                    await Invoice.update(currentInvoice.id, autoUpdate);
                    setInvoice(prev => ({ ...prev, ...autoUpdate }));
                } catch (viewErr) {
                    console.warn("Could not update invoice viewed status:", viewErr);
                }
            }

        } catch (error) {
            setVerificationError(
                error?.message ||
                    'The email address does not match our records. Please enter the email address this invoice was sent to.'
            );
        } finally {
            setIsVerifying(false);
        }
    };

    if (isLoading) {
        return <DocumentPageSkeleton title="Loading invoice…" />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-4">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h1 className="text-xl font-bold text-foreground">Oops! Something went wrong.</h1>
                <p className="text-muted-foreground mt-2">{error}</p>
            </div>
        );
    }

    if (needsEmailVerification) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
                <div className="bg-card rounded-lg shadow-xl border border-border p-8 max-w-md w-full">
                    <div className="text-center mb-6">
                        <Mail className="w-12 h-12 text-primary mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-foreground mb-2">Email Verification Required</h1>
                        <p className="text-muted-foreground">
                            To view this invoice, please enter the email address it was sent to
                            {sentToEmailHint ? (
                                <>
                                    {' '}
                                    <span className="text-foreground font-medium">(hint: {sentToEmailHint})</span>
                                </>
                            ) : null}
                            .
                        </p>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <Input
                                type="email"
                                placeholder="your.email@example.com"
                                value={emailVerification}
                                onChange={(e) => {
                                    setEmailVerification(e.target.value);
                                    setVerificationError('');
                                }}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        handleEmailVerification();
                                    }
                                }}
                                className="w-full"
                            />
                            {verificationError && (
                                <p className="text-red-500 text-sm mt-2">{verificationError}</p>
                            )}
                        </div>
                        
                        <Button
                            onClick={handleEmailVerification}
                            disabled={isVerifying || !emailVerification.trim()}
                            className="w-full bg-primary hover:bg-primary/90"
                        >
                            {isVerifying ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                'Verify & View Invoice'
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (!invoice) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <p className="text-muted-foreground">Invoice not found.</p>
            </div>
        );
    }
    
    const ownerCurrency = invoice.owner_currency || invoice.currency || 'ZAR';
    const templateKey =
      normalizeInvoiceTemplateKey(invoice.invoice_template) || DEFAULT_INVOICE_TEMPLATE;
    const issuerBrand = resolveIssuerBrand({
        document: invoice,
        company: invoice.company,
        profile: null,
    });
    const publicUser = {
        logo_url: issuerBrand.logo || '',
        company_name: issuerBrand.name || '',
        company_address: invoice.owner_company_address || '',
        email: invoice.owner_email || '',
        currency: ownerCurrency,
        invoice_template: templateKey,
        invoice_header: '',
        document_brand_primary: parseDocumentBrandHex(invoice.document_brand_primary),
        document_brand_secondary: parseDocumentBrandHex(invoice.document_brand_secondary),
    };

    const shareTokenForPdf =
        invoice.public_share_token || new URLSearchParams(location.search).get('token') || '';
    const pdfDownloadHref = shareTokenForPdf
        ? `${createPageUrl('InvoicePDF')}?token=${encodeURIComponent(shareTokenForPdf)}&download=true`
        : `${createPageUrl('InvoicePDF')}?id=${encodeURIComponent(invoice.id)}&download=true`;

    return (
        <div className="min-h-screen bg-background p-4 sm:p-8 pb-28">
            <div className="max-w-4xl mx-auto">
                <div className="mb-4 rounded-xl border border-border bg-card p-4">
                    <p className="text-sm text-muted-foreground">{issuerBrand.name || invoice.owner_company_name || 'Invoice'}</p>
                    <p className="text-lg font-semibold text-foreground">{invoice.invoice_number}</p>
                    <p className="text-sm text-muted-foreground">{invoice.project_title || invoice.project_description || 'Payment request'}</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{formatCurrency(invoice.total_amount, ownerCurrency)}</p>
                    {invoice.delivery_date ? (
                        <p className="text-xs text-muted-foreground">Due {invoice.delivery_date}</p>
                    ) : null}
                </div>
                <DocumentPaymentActionBar
                    invoice={invoice}
                    client={client}
                    shareToken={shareTokenForPdf}
                    publicMode
                    onDownloadReceipt={() => window.open(pdfDownloadHref, '_blank', 'noopener,noreferrer')}
                />
                <div className="mb-6 flex justify-end">
                    <a
                        href={pdfDownloadHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-grow sm:flex-grow-0 w-full bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg shadow-sm flex items-center justify-center gap-2"
                    >
                        <Download className="w-5 h-5" />
                        Download as PDF
                    </a>
                </div>
                <InvoicePaymentHistory history={paymentHistory} currency={ownerCurrency} />

                <div className="bg-card border border-border shadow-xl rounded-lg p-4 sm:p-6 overflow-x-auto">
                    <InvoicePreview
                        embedded
                        invoiceData={{ ...invoice, issuerBrand }}
                        client={client}
                        clients={[]}
                        user={publicUser}
                        bankingDetail={bankingDetail}
                        previewOnly={false}
                        showBack={false}
                        loading={false}
                    />
                </div>
            </div>
        </div>
    );
}
