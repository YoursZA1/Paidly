import PropTypes from "prop-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import { clientPropType, quoteDataPropType } from "../invoice/propTypes";

export default function QuotePreview({ 
    quoteData, 
    clients, 
    onPrevious, 
    onCreate,
    showBack = true
}) {
    const client = clients.find(c => c.id === quoteData.client_id);
    const items = quoteData.items || [];
    const validUntil = quoteData.valid_until ? new Date(quoteData.valid_until) : null;
    
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
                        Quote Preview
                    </CardTitle>
                    <p className="text-slate-600 mt-2">
                        Review all details before creating your professional quote
                    </p>
                </CardHeader>
                
                <CardContent className="p-8">
                    <div className="space-y-8">
                        {/* Client & Project Information */}
                        <div className="bg-slate-50 rounded-2xl p-6">
                            <h3 className="font-bold text-slate-900 mb-4">Quote Information</h3>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-slate-600">Client Name</p>
                                    <p className="font-semibold text-slate-900">{client?.name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Project Title</p>
                                    <p className="font-semibold text-slate-900">{quoteData.project_title}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Valid Until</p>
                                    <p className="font-semibold text-slate-900">
                                        {validUntil ? format(validUntil, "MMMM d, yyyy") : "Not set"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Total Amount</p>
                                    <p className="font-bold text-slate-900 text-xl">
                                        {formatCurrency(quoteData.total_amount)}
                                    </p>
                                </div>
                            </div>
                            {quoteData.project_description && (
                                <div className="mt-4">
                                    <p className="text-sm text-slate-600">Description</p>
                                    <p className="text-slate-800">{quoteData.project_description}</p>
                                </div>
                            )}
                        </div>

                        {/* Items */}
                        <div className="bg-blue-50 rounded-2xl p-6">
                            <h3 className="font-bold text-slate-900 mb-4">Quote Items</h3>
                            <div className="space-y-3">
                                {items.map((item, index) => (
                                    <div key={index} className="bg-white rounded-lg p-4 flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold text-slate-900">{item.service_name}</p>
                                            {item.description && (
                                                <p className="text-sm text-slate-600">{item.description}</p>
                                            )}
                                            <p className="text-sm text-slate-500">
                                                {item.quantity} × {formatCurrency(item.unit_price)}
                                            </p>
                                        </div>
                                        <p className="font-bold text-slate-900">
                                            {formatCurrency(item.total_price)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-blue-200">
                                <div className="flex justify-between text-sm">
                                    <span>Subtotal:</span>
                                    <span>{formatCurrency(quoteData.subtotal)}</span>
                                </div>
                                {quoteData.tax_amount > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span>Tax ({quoteData.tax_rate}%):</span>
                                        <span>{formatCurrency(quoteData.tax_amount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-blue-200">
                                    <span>Total:</span>
                                    <span>{formatCurrency(quoteData.total_amount)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Notes & Terms */}
                        {(quoteData.notes || quoteData.terms_conditions) && (
                            <div className="grid md:grid-cols-2 gap-6">
                                {quoteData.notes && (
                                    <div className="bg-amber-50 rounded-2xl p-6">
                                        <h3 className="font-bold text-slate-900 mb-4">Additional Notes</h3>
                                        <p className="text-slate-800 whitespace-pre-wrap">{quoteData.notes}</p>
                                    </div>
                                )}
                                {quoteData.terms_conditions && (
                                    <div className="bg-purple-50 rounded-2xl p-6">
                                        <h3 className="font-bold text-slate-900 mb-4">Terms & Conditions</h3>
                                        <p className="text-slate-800 whitespace-pre-wrap">{quoteData.terms_conditions}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className={`flex ${showBack ? 'justify-between' : 'justify-end'} mt-8`}>
                        {showBack && (
                            <Button
                                onClick={onPrevious}
                                variant="outline"
                                className="px-8 py-3 rounded-xl border-slate-200 hover:bg-slate-50"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                        )}
                        
                        <Button
                            onClick={onCreate}
                            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Create Quote
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}

QuotePreview.propTypes = {
    quoteData: quoteDataPropType.isRequired,
    clients: PropTypes.arrayOf(clientPropType).isRequired,
    onPrevious: PropTypes.func,
    onCreate: PropTypes.func.isRequired,
    showBack: PropTypes.bool
};