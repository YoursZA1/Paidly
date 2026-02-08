import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, User, DollarSign, Clock, AlertCircle, Zap } from "lucide-react";
import { format } from "date-fns";
import PropTypes from "prop-types";

export default function DraftRecurringInvoiceInfo({ template }) {
    const statusColor =
        template.status === "draft"
            ? "bg-yellow-100 text-yellow-800"
            : template.status === "active"
            ? "bg-green-100 text-green-800"
            : "bg-slate-100 text-slate-800";

    const frequencyLabels = {
        weekly: "Weekly",
        biweekly: "Bi-weekly",
        monthly: "Monthly",
        quarterly: "Quarterly",
        semiannual: "Semi-annual",
        annual: "Annual",
    };

    return (
        <Card className={`border-2 ${template.status === "draft" ? "border-blue-200" : "border-gray-200"}`}>
            <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-gray-600" />
                        <CardTitle className="text-lg">Template Information</CardTitle>
                    </div>
                    <Badge className={statusColor}>
                        {template.status?.toUpperCase() || "DRAFT"}
                    </Badge>
                </div>
            </CardHeader>

            <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Left Column */}
                    <div className="space-y-4">
                        {/* Client Name */}
                        <div className="flex items-start gap-3">
                            <User className="w-4 h-4 text-gray-600 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-600">Client</p>
                                <p className="text-base font-semibold text-gray-900">
                                    {typeof template.client_id === 'object' ? template.client_id.name : template.client_id || "N/A"}
                                </p>
                            </div>
                        </div>

                        {/* Frequency */}
                        <div className="flex items-start gap-3">
                            <Zap className="w-4 h-4 text-blue-600 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-600">Frequency</p>
                                <p className="text-base font-semibold text-gray-900">
                                    {frequencyLabels[template.frequency] || template.frequency}
                                </p>
                            </div>
                        </div>

                        {/* Total Amount */}
                        <div className="flex items-start gap-3">
                            <DollarSign className="w-4 h-4 text-emerald-600 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-600">Total Amount</p>
                                <p className="text-base font-semibold text-gray-900">
                                    {template.currency || "ZAR"}{" "}
                                    {template.total_amount ? template.total_amount.toFixed(2) : "0.00"}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-4">
                        {/* Created Date */}
                        <div className="flex items-start gap-3">
                            <Clock className="w-4 h-4 text-gray-600 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-600">Created</p>
                                <p className="text-base font-semibold text-gray-900">
                                    {template.created_date
                                        ? format(new Date(template.created_date), "MMM dd, yyyy")
                                        : "N/A"}
                                </p>
                            </div>
                        </div>

                        {/* Last Modified */}
                        <div className="flex items-start gap-3">
                            <Clock className="w-4 h-4 text-gray-600 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-600">Last Modified</p>
                                <p className="text-base font-semibold text-gray-900">
                                    {template.last_modified_date
                                        ? format(new Date(template.last_modified_date), "MMM dd, yyyy h:mm a")
                                        : "Not modified"}
                                </p>
                            </div>
                        </div>

                        {/* Start Date */}
                        <div className="flex items-start gap-3">
                            <Clock className="w-4 h-4 text-gray-600 mt-1" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-600">Start Date</p>
                                <p className="text-base font-semibold text-gray-900">
                                    {template.start_date
                                        ? format(new Date(template.start_date), "MMM dd, yyyy")
                                        : "Not set"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Status Message */}
                {template.status === "draft" && (
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-blue-900">Draft Status</p>
                            <p className="text-sm text-blue-800 mt-1">
                                This template is in draft status and won&apos;t generate automatic invoices. Activate it
                                when you&apos;re ready to start the recurring cycle.
                            </p>
                        </div>
                    </div>
                )}

                {template.status === "active" && (
                    <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-green-900">Active Template</p>
                            <p className="text-sm text-green-800 mt-1">
                                This template is active and will automatically generate invoices based on the
                                configured frequency.
                            </p>
                        </div>
                    </div>
                )}

                {template.status === "paused" && (
                    <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-amber-900">Paused Template</p>
                            <p className="text-sm text-amber-800 mt-1">
                                This template is currently paused. No invoices will be generated until it&apos;s resumed.
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

DraftRecurringInvoiceInfo.propTypes = {
    template: PropTypes.shape({
        client_id: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
        status: PropTypes.string,
        frequency: PropTypes.string,
        total_amount: PropTypes.number,
        currency: PropTypes.string,
        created_date: PropTypes.string,
        last_modified_date: PropTypes.string,
        start_date: PropTypes.string,
    }).isRequired,
};
