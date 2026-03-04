import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, User, CreditCard, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import PropTypes from "prop-types";
import RecurringSaveActions from "./RecurringSaveActions";

export default function RecurringInvoicePreview({
    invoiceData,
    clients,
    bankingDetails,
    onPrevious,
    onCreate,
    isEditing = false,
    isLoading = false,
}) {
    const client = clients?.find((c) => c.id === invoiceData.client_id);
    const bankingDetail = bankingDetails?.find((b) => b.id === invoiceData.banking_detail_id);

    const calculateTotals = () => {
        const subtotal = invoiceData.line_items?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
        const tax = subtotal * (invoiceData.tax_rate / 100);
        const total = subtotal + tax;
        return { subtotal, tax, total };
    };

    const { subtotal, tax, total } = calculateTotals();

    const frequencyLabels = {
        weekly: "Every Week",
        biweekly: "Every 2 Weeks",
        monthly: "Monthly",
        quarterly: "Every 3 Months",
        semiannual: "Every 6 Months",
        annual: "Annually",
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-slate-100 pb-6">
                    <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Template Preview
                    </CardTitle>
                    <p className="text-slate-600 mt-2">
                        Review all details before saving your recurring invoice template
                    </p>
                </CardHeader>

                <CardContent className="p-8">
                    <div className="space-y-8">
                        {/* Client Information */}
                        <div className="bg-slate-50 rounded-2xl p-6">
                            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <User className="w-4 h-4" />
                                Client Information
                            </h3>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-slate-600">Client Name</p>
                                    <p className="font-semibold text-slate-900">{client?.name || "N/A"}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Email</p>
                                    <p className="font-semibold text-slate-900">{client?.email || "N/A"}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Contact Person</p>
                                    <p className="font-semibold text-slate-900">{client?.contact_person || "N/A"}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Phone</p>
                                    <p className="font-semibold text-slate-900">{client?.phone || "N/A"}</p>
                                </div>
                            </div>
                        </div>

                        {/* Billing Details */}
                        {bankingDetail && (
                            <div className="bg-slate-50 rounded-2xl p-6">
                                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <CreditCard className="w-4 h-4" />
                                    Billing Details
                                </h3>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-slate-600">Bank Name</p>
                                        <p className="font-semibold text-slate-900">{bankingDetail.bank_name}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-600">Account Holder</p>
                                        <p className="font-semibold text-slate-900">{bankingDetail.account_holder_name}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-600">Account Number</p>
                                        <p className="font-semibold text-slate-900">****{bankingDetail.account_number?.slice(-4)}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-600">Branch Code</p>
                                        <p className="font-semibold text-slate-900">{bankingDetail.branch_code}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Line Items */}
                        <div className="bg-slate-50 rounded-2xl p-6">
                            <h3 className="font-bold text-slate-900 mb-4">Line Items</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-200">
                                            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Description</th>
                                            <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Qty</th>
                                            <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Unit Price</th>
                                            <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoiceData.line_items?.map((item, idx) => (
                                            <tr key={idx} className="border-b border-slate-100">
                                                <td className="py-3 px-4 text-sm text-slate-900">{item.description}</td>
                                                <td className="py-3 px-4 text-sm text-slate-900 text-right">{item.quantity}</td>
                                                <td className="py-3 px-4 text-sm text-slate-900 text-right">
                                                    {invoiceData.currency} {item.unit_price?.toFixed(2)}
                                                </td>
                                                <td className="py-3 px-4 text-sm font-semibold text-slate-900 text-right">
                                                    {invoiceData.currency} {item.amount?.toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Totals */}
                        <div className="grid md:grid-cols-3 gap-4">
                            <div className="bg-slate-50 rounded-xl p-4">
                                <p className="text-sm text-slate-600 mb-1">Subtotal</p>
                                <p className="text-2xl font-bold text-slate-900">
                                    {invoiceData.currency} {subtotal.toFixed(2)}
                                </p>
                            </div>
                            <div className="bg-primary/10 rounded-xl p-4">
                                <p className="text-sm text-primary mb-1">Tax ({invoiceData.tax_rate}%)</p>
                                <p className="text-2xl font-bold text-foreground">
                                    {invoiceData.currency} {tax.toFixed(2)}
                                </p>
                            </div>
                            <div className="bg-emerald-50 rounded-xl p-4">
                                <p className="text-sm text-emerald-600 mb-1">Total Amount</p>
                                <p className="text-2xl font-bold text-emerald-900">
                                    {invoiceData.currency} {total.toFixed(2)}
                                </p>
                            </div>
                        </div>

                        {/* Recurrence Information */}
                        <div className="bg-slate-50 rounded-2xl p-6">
                            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <Zap className="w-4 h-4" />
                                Recurrence Settings
                            </h3>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-slate-600">Frequency</p>
                                    <p className="font-semibold text-slate-900">
                                        {frequencyLabels[invoiceData.frequency] || invoiceData.frequency}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Start Date</p>
                                    <p className="font-semibold text-slate-900">
                                        {invoiceData.start_date
                                            ? format(new Date(invoiceData.start_date), "MMM dd, yyyy")
                                            : "Not set"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">End Date (Optional)</p>
                                    <p className="font-semibold text-slate-900">
                                        {invoiceData.end_date
                                            ? format(new Date(invoiceData.end_date), "MMM dd, yyyy")
                                            : "No end date"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Currency</p>
                                    <p className="font-semibold text-slate-900">{invoiceData.currency}</p>
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        {invoiceData.notes && (
                            <div className="bg-slate-50 rounded-2xl p-6">
                                <h3 className="font-bold text-slate-900 mb-4">Notes</h3>
                                <p className="text-slate-700 whitespace-pre-wrap">{invoiceData.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-between mt-8">
                        <Button
                            onClick={onPrevious}
                            variant="outline"
                            disabled={isLoading}
                            className="px-8 py-3 rounded-xl border-slate-200 hover:bg-slate-50"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>

                        {isEditing ? (
                            <RecurringSaveActions
                                onSaveDraft={async () => await onCreate(true)}
                                onActivateNow={async () => await onCreate(false)}
                                loading={isLoading}
                                disabled={false}
                                buttonText={{
                                    draft: "Update Draft",
                                    activate: "Update & Activate",
                                }}
                            />
                        ) : (
                            <RecurringSaveActions
                                onSaveDraft={async () => await onCreate(true)}
                                onActivateNow={async () => await onCreate(false)}
                                loading={isLoading}
                                disabled={false}
                            />
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}

RecurringInvoicePreview.propTypes = {
    invoiceData: PropTypes.shape({
        client_id: PropTypes.string,
        line_items: PropTypes.array,
        banking_detail_id: PropTypes.string,
        tax_rate: PropTypes.number,
        currency: PropTypes.string,
        notes: PropTypes.string,
        frequency: PropTypes.string,
        start_date: PropTypes.string,
        end_date: PropTypes.string,
    }).isRequired,
    clients: PropTypes.array,
    bankingDetails: PropTypes.array,
    onPrevious: PropTypes.func.isRequired,
    onCreate: PropTypes.func.isRequired,
    isEditing: PropTypes.bool,
    isLoading: PropTypes.bool,
};
