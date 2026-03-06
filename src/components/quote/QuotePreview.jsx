import PropTypes from "prop-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, FileText, Download } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import { clientPropType, quoteDataPropType } from "../invoice/propTypes";
import LogoImage from "@/components/shared/LogoImage";
import { createPageUrl } from "@/utils";

export default function QuotePreview({ 
    quoteData, 
    clients, 
    onPrevious, 
    onCreate,
    onClose,
    showBack = true,
    user, // Pass user/company object with logo_url, currency if available
    loading = false,
    previewOnly = false,
    onTotalClick,
}) {
    const clientList = Array.isArray(clients) ? clients : [];
    const client = clientList.find(c => c.id === quoteData?.client_id) ?? null;
    const items = Array.isArray(quoteData?.items) ? quoteData.items : [];
    const validUntil = quoteData?.valid_until ? new Date(quoteData.valid_until) : null;
    const currency = user?.currency || "ZAR";
    const subtotal = Number(quoteData?.subtotal ?? 0);
    const taxRate = Number(quoteData?.tax_rate ?? 0);
    const taxAmount = Number(quoteData?.tax_amount ?? 0);
    const totalAmount = Number(quoteData?.total_amount ?? 0);
    const showTax = taxAmount > 0;

    const handleDownloadPDF = () => {
        try {
            sessionStorage.setItem(
                "quoteDraft",
                JSON.stringify({
                    quoteData: {
                        ...quoteData,
                        quote_number: quoteData.quote_number || "Draft",
                    },
                    client: client || {},
                    user: user || {},
                })
            );
            window.open(createPageUrl("QuotePDF") + "?draft=1", "_blank", "noopener,noreferrer");
        } catch (e) {
            console.error("Failed to open PDF preview:", e);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-border pb-6">
                    {/* Logo Display */}
                    {user?.logo_url && (
                        <div className="mb-4 flex justify-center">
                            <LogoImage src={user.logo_url} alt="Company Logo" className="h-16 w-auto max-w-xs object-contain rounded shadow" style={{ maxHeight: '64px' }} />
                        </div>
                    )}
                    <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        {previewOnly ? "Quote" : "Quote Preview"}
                    </CardTitle>
                    {!previewOnly && (
                        <p className="text-muted-foreground mt-2">
                            Review all details before creating your professional quote
                        </p>
                    )}
                    {previewOnly && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadPDF}
                            className="mt-3 rounded-xl border-border bg-card text-foreground hover:bg-muted"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Download PDF
                        </Button>
                    )}
                </CardHeader>

                <CardContent className="p-8">
                    <div className="bg-card rounded-lg text-foreground">
                        {/* Header: QUOTE left, Company logo-aligned accent box right + Quote No, Valid Until */}
                        <div className="flex flex-wrap justify-between items-start gap-6 mb-8">
                            <h1 className="text-2xl sm:text-3xl font-bold text-foreground uppercase tracking-tight">Quote</h1>
                            <div className="text-right">
                                <div className="inline-block rounded-lg px-4 py-3 bg-primary/10 border border-primary/20">
                                    {user?.logo_url ? (
                                        <div className="flex items-center gap-3">
                                            <LogoImage src={user.logo_url} alt="" className="h-10 w-auto" style={{ maxHeight: "40px" }} />
                                            <span className="font-semibold text-foreground">{user?.company_name || "Your Company"}</span>
                                        </div>
                                    ) : (
                                        <span className="font-semibold text-foreground">{user?.company_name || "Your Company"}</span>
                                    )}
                                </div>
                                <div className="mt-3 text-sm text-muted-foreground">
                                    <p>Quote No: {quoteData?.quote_number || "Draft"}</p>
                                    <p>Valid Until: {validUntil ? format(validUntil, "dd/MM/yyyy") : "—"}</p>
                                </div>
                            </div>
                        </div>

                        {/* Payable To | Bank Details */}
                        <div className="grid md:grid-cols-2 gap-8 mb-8">
                            <div>
                                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Payable To</h3>
                                <p className="font-medium text-foreground">{client?.name || "—"}</p>
                                {client?.address && <p className="text-sm text-muted-foreground mt-0.5">{client.address}</p>}
                                {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
                            </div>
                            <div className="text-right md:text-right">
                                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Bank Details</h3>
                                <p className="text-sm text-muted-foreground">—</p>
                            </div>
                        </div>

                        {/* Itemized table: logo-aligned accent header, 4 columns */}
                        <div className="overflow-x-auto rounded-t-lg overflow-hidden mb-6">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-primary/10 border border-primary/20">
                                        <th className="px-4 py-3.5 text-left text-xs font-bold text-foreground uppercase tracking-wider">Item Description</th>
                                        <th className="px-4 py-3.5 text-right text-xs font-bold text-foreground uppercase tracking-wider w-20">Qty</th>
                                        <th className="px-4 py-3.5 text-right text-xs font-bold text-foreground uppercase tracking-wider w-28">Price</th>
                                        <th className="px-4 py-3.5 text-right text-xs font-bold text-foreground uppercase tracking-wider w-28">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No items added</td>
                                        </tr>
                                    ) : (
                                        items.map((item, index) => {
                                            const qty = Number(item.quantity ?? item.qty ?? 1);
                                            const unitPrice = Number(item.unit_price ?? item.rate ?? item.price ?? 0);
                                            const total = Number(item.total_price ?? item.total ?? qty * unitPrice);
                                            const name = item.service_name || item.name || "Item";
                                            return (
                                                <tr key={index} className="border-b border-border">
                                                    <td className="px-4 py-4 text-foreground">{name}</td>
                                                    <td className="px-4 py-4 text-right text-foreground tabular-nums">{qty}</td>
                                                    <td className="px-4 py-4 text-right text-foreground tabular-nums">{formatCurrency(unitPrice, currency)}</td>
                                                    <td className="px-4 py-4 text-right font-medium text-foreground tabular-nums">{formatCurrency(total, currency)}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Notes */}
                        {(quoteData?.notes || quoteData?.terms_conditions) && (
                            <div className="mb-8">
                                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Notes</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                    {[quoteData?.notes, quoteData?.terms_conditions].filter(Boolean).join("\n\n")}
                                </p>
                            </div>
                        )}

                        {/* Totals: right-aligned logo-aligned accent box */}
                        <div className="flex justify-end">
                            <div className="w-full max-w-xs rounded-lg border border-primary/20 bg-primary/10 px-5 py-4">
                                <div className="flex justify-between py-2 text-sm text-foreground">
                                    <span>Sub Total</span>
                                    <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
                                </div>
                                {showTax && (
                                    <div className="flex justify-between py-2 text-sm text-foreground">
                                        <span>Tax ({taxRate}%)</span>
                                        <span className="tabular-nums">{formatCurrency(taxAmount, currency)}</span>
                                    </div>
                                )}
                                <div
                                    className={`border-t border-border mt-2 pt-3 flex justify-between text-base font-bold text-foreground ${onTotalClick ? "cursor-pointer hover:bg-primary/5 -mx-1 px-1 rounded transition-colors" : ""}`}
                                    onClick={() => onTotalClick?.()}
                                    onKeyDown={(e) => { if (onTotalClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onTotalClick(); } }}
                                    role={onTotalClick ? "button" : undefined}
                                    tabIndex={onTotalClick ? 0 : undefined}
                                >
                                    <span>Grand Total</span>
                                    <span className="tabular-nums">{formatCurrency(totalAmount, currency)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={`flex ${showBack && !previewOnly ? "justify-between" : "justify-end"} mt-8 gap-3`}>
                        {showBack && !previewOnly && (
                            <Button
                                onClick={onPrevious}
                                variant="outline"
                                className="px-8 py-3 rounded-xl border-border hover:bg-muted"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                        )}
                        {previewOnly && onClose && (
                            <Button
                                onClick={onClose}
                                variant="outline"
                                className="px-8 py-3 rounded-xl border-border hover:bg-muted"
                            >
                                Close Preview
                            </Button>
                        )}
                        {!previewOnly && (
                            <Button
                                onClick={onCreate}
                                disabled={loading}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <motion.div
                                            className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full"
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                        />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Create Quote
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}

QuotePreview.propTypes = {
    quoteData: quoteDataPropType.isRequired,
    clients: PropTypes.arrayOf(clientPropType),
    onPrevious: PropTypes.func,
    onCreate: PropTypes.func,
    onClose: PropTypes.func,
    showBack: PropTypes.bool,
    user: PropTypes.object,
    loading: PropTypes.bool,
    previewOnly: PropTypes.bool,
    onTotalClick: PropTypes.func,
};