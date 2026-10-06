
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
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
import InvoicePreview from '@/components/invoice/InvoicePreview';
import DocumentPaymentActionBar from '@/components/invoice/DocumentPaymentActionBar';
import InvoicePaymentHistory from '@/components/invoice/InvoicePaymentHistory';
import { fetchDocumentPaymentHistory } from '@/api/documentPaymentApi';
import { resolveInvoiceTemplateKey, DEFAULT_INVOICE_TEMPLATE } from '@/utils/invoiceTemplateData';
import { parseDocumentBrandHex } from '@/utils/documentBrandColors';
import { resolveIssuerBrand } from '@/lib/documentIssuerBrand';
import PublicDocumentPortal, {
    PublicDocumentSheet,
    PublicPortalMessage,
    formatPortalDate,
} from '@/components/documents/PublicDocumentPortal';

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
    const [paymentDue, setPaymentDue] = useState(null);
    const handlePaymentAmount = useCallback((next) => {
        setPaymentDue((prev) => {
            if (
                prev &&
                prev.amountDue === next.amountDue &&
                prev.currency === next.currency &&
                prev.label === next.label
            ) {
                return prev;
            }
            return next;
        });
    }, []);

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
            <PublicPortalMessage icon={<AlertCircle className="h-8 w-8 text-red-500" />} title="This invoice could not be opened">
                <p className="text-center text-sm text-slate-500">{error}</p>
            </PublicPortalMessage>
        );
    }

    if (needsEmailVerification) {
        return (
            <PublicPortalMessage icon={<Mail className="h-8 w-8" />} title="Confirm your email">
                <p className="text-center text-sm text-slate-500">
                    Enter the email address this invoice was sent to
                    {sentToEmailHint ? (
                        <>
                            {' '}
                            <span className="font-medium text-slate-800">(hint: {sentToEmailHint})</span>
                        </>
                    ) : null}
                    .
                </p>
                <div className="mt-5 space-y-3">
                    <Input
                        type="email"
                        placeholder="your.email@example.com"
                        value={emailVerification}
                        onChange={(e) => {
                            setEmailVerification(e.target.value);
                            setVerificationError('');
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEmailVerification();
                        }}
                        className="w-full"
                    />
                    {verificationError ? <p className="text-sm text-red-500">{verificationError}</p> : null}
                    <Button
                        onClick={handleEmailVerification}
                        disabled={isVerifying || !emailVerification.trim()}
                        className="h-10 w-full rounded-xl"
                    >
                        {isVerifying ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Verifying…
                            </>
                        ) : (
                            'View invoice'
                        )}
                    </Button>
                </div>
            </PublicPortalMessage>
        );
    }

    if (!invoice) {
        return (
            <PublicPortalMessage title="Invoice not found">
                <p className="text-center text-sm text-slate-500">This link does not match an invoice.</p>
            </PublicPortalMessage>
        );
    }
    
    const ownerCurrency = invoice.owner_currency || invoice.currency || 'ZAR';
    const templateKey =
      resolveInvoiceTemplateKey(invoice.invoice_template) || DEFAULT_INVOICE_TEMPLATE;
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

    const dueAmount = paymentDue?.amountDue ?? invoice.total_amount;
    const dueCurrency = paymentDue?.currency || ownerCurrency;
    const dueDateLabel = formatPortalDate(invoice.delivery_date);

    return (
        <PublicDocumentPortal
            companyName={issuerBrand.name || invoice.owner_company_name || 'Invoice'}
            documentLabel="Invoice"
            documentNumber={invoice.invoice_number}
            summary={invoice.project_title || invoice.project_description || ''}
            amountLabel={paymentDue?.label || 'Due'}
            amount={formatCurrency(dueAmount, dueCurrency)}
            meta={dueDateLabel ? `Due ${dueDateLabel}` : ''}
            actions={
                <>
                    <Button variant="outline" className="gap-2 border-slate-200 bg-white" asChild>
                        <a href={pdfDownloadHref} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" />
                            <span className="sm:hidden">PDF</span>
                            <span className="hidden sm:inline">Download PDF</span>
                        </a>
                    </Button>
                    <DocumentPaymentActionBar
                        invoice={invoice}
                        client={client}
                        shareToken={shareTokenForPdf}
                        publicMode
                        variant="inline"
                        onAmountChange={handlePaymentAmount}
                        onDownloadReceipt={() => window.open(pdfDownloadHref, '_blank', 'noopener,noreferrer')}
                    />
                </>
            }
        >
            <PublicDocumentSheet>
                <div className="overflow-x-auto p-3 sm:p-6">
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
            </PublicDocumentSheet>
            <div className="mt-4">
                <InvoicePaymentHistory history={paymentHistory} currency={ownerCurrency} />
            </div>
        </PublicDocumentPortal>
    );
}
