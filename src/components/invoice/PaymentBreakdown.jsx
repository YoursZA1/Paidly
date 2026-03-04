import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, DollarSign, Calendar, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { format, addDays } from "date-fns";
import { formatCurrency } from "../CurrencySelector";

export default function PaymentBreakdown({ 
    invoiceData, 
    setInvoiceData, 
    onNext, 
    onPrevious 
}) {
    const totalAmount = invoiceData.total_amount || 0;
    const upfrontAmount = totalAmount * 0.5;
    const milestoneAmount = (totalAmount - upfrontAmount) * 0.5;
    const finalAmount = (totalAmount - upfrontAmount) * 0.5;

    const deliveryDate = invoiceData.delivery_date ? new Date(invoiceData.delivery_date) : new Date();
    const milestoneDate = addDays(deliveryDate, -30);
    const finalDate = addDays(deliveryDate, 30);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-slate-100 pb-6">
                    <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        Payment Breakdown
                    </CardTitle>
                    <p className="text-slate-600 mt-2">
                        Your project will be divided into three payment milestones
                    </p>
                </CardHeader>
                
                <CardContent className="p-8">
                    <div className="space-y-8">
                        {/* Project Summary */}
                        <div className="bg-primary/10 rounded-2xl p-6">
                            <h3 className="font-bold text-slate-900 mb-4">Project Summary</h3>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-slate-600">Project Title</p>
                                    <p className="font-semibold text-slate-900">{invoiceData.project_title}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Total Project Value</p>
                                    <p className="font-bold text-slate-900 text-xl">
                                        {formatCurrency(totalAmount)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Delivery Date</p>
                                    <p className="font-semibold text-slate-900">
                                        {format(deliveryDate, "MMMM d, yyyy")}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Total Items</p>
                                    <p className="font-semibold text-slate-900">
                                        {invoiceData.items?.length || 0} services
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Payment Schedule */}
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <Calendar className="w-5 h-5" />
                                Payment Schedule
                            </h3>
                            
                            {/* Upfront Payment */}
                            <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-200">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                                            <span className="text-white font-bold">1</span>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-900">Upfront Payment</h4>
                                            <p className="text-sm text-slate-600">Due upon contract signing</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-slate-600">50% of total</p>
                                        <p className="font-bold text-slate-900 text-xl">
                                            {formatCurrency(upfrontAmount)}
                                        </p>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-600">
                                    This payment secures your project slot and covers initial setup costs.
                                </p>
                            </div>

                            {/* Milestone Payment */}
                            <div className="bg-primary/10 rounded-2xl p-6 border border-primary/20">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-primary/100 rounded-full flex items-center justify-center">
                                            <span className="text-white font-bold">2</span>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-900">Milestone Payment</h4>
                                            <p className="text-sm text-slate-600">
                                                Due {format(milestoneDate, "MMMM d, yyyy")}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-slate-600">25% of total</p>
                                        <p className="font-bold text-slate-900 text-xl">
                                            {formatCurrency(milestoneAmount)}
                                        </p>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-600">
                                    Payment due at project milestone, typically 30 days before delivery.
                                </p>
                            </div>

                            {/* Final Payment */}
                            <div className="bg-purple-50 rounded-2xl p-6 border border-purple-200">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                                            <CheckCircle className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-900">Final Payment</h4>
                                            <p className="text-sm text-slate-600">
                                                Due {format(finalDate, "MMMM d, yyyy")}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-slate-600">25% of total</p>
                                        <p className="font-bold text-slate-900 text-xl">
                                            {formatCurrency(finalAmount)}
                                        </p>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-600">
                                    Final payment due upon project completion and delivery.
                                </p>
                            </div>
                        </div>

                        {/* Payment Terms */}
                        <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200">
                            <h4 className="font-bold text-slate-900 mb-3">Payment Terms & Conditions</h4>
                            <ul className="text-sm text-slate-600 space-y-2">
                                <li>• All payments are due within 30 days of invoice date</li>
                                <li>• Late payments may incur a 1.5% monthly service charge</li>
                                <li>• Project timeline may be adjusted based on payment schedule</li>
                                <li>• Final deliverables will be provided upon receipt of final payment</li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex justify-between mt-8">
                        <Button
                            onClick={onPrevious}
                            variant="outline"
                            className="px-8 py-3 rounded-xl border-slate-200 hover:bg-slate-50"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Project Details
                        </Button>
                        
                        <Button
                            onClick={onNext}
                            className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                        >
                            Continue to Preview
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}