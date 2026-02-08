import PropTypes from "prop-types";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, FileText, User, CreditCard, Truck, Save } from "lucide-react";
import { motion } from "framer-motion";
import { format, addDays } from "date-fns";
import InvoiceSaveActions from "./InvoiceSaveActions";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Repeat } from "lucide-react";
import { bankingDetailPropType, clientPropType, invoiceDataPropType } from "./propTypes";

export default function InvoicePreview({ 
    invoiceData, 
    clients, 
    bankingDetails, 
    onPrevious, 
    onCreate,
    isEditing = false,
    showBack = true,
    ...props
}) {
    const [loading, setLoading] = useState(false);
    
    const client = clients.find(c => c.id === invoiceData.client_id);
    const bankingDetail = bankingDetails.find(b => b.id === invoiceData.banking_detail_id);
    
    const totalAmount = invoiceData.total_amount || 0;
    const upfrontAmount = totalAmount * 0.5;
    const milestoneAmount = (totalAmount - upfrontAmount) * 0.5;
    const finalAmount = (totalAmount - upfrontAmount) * 0.5;

    const deliveryDate = new Date(invoiceData.delivery_date);
    const milestoneDate = addDays(deliveryDate, -30);
    const finalDate = addDays(deliveryDate, 30);

    // Recurring state from props
    const { 
        isRecurring, setIsRecurring, 
        frequency, setFrequency, 
        startDate, setStartDate, 
        endDate, setEndDate,
        profileName, setProfileName
    } = props;

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
                        Invoice Preview
                    </CardTitle>
                    <p className="text-slate-600 mt-2">
                        Review all details before creating your professional invoice
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
                                    <p className="font-semibold text-slate-900">{client?.name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Email</p>
                                    <p className="font-semibold text-slate-900">{client?.email}</p>
                                </div>
                                {client?.phone && (
                                    <div>
                                        <p className="text-sm text-slate-600">Phone</p>
                                        <p className="font-semibold text-slate-900">{client.phone}</p>
                                    </div>
                                )}
                                {client?.address && (
                                    <div>
                                        <p className="text-sm text-slate-600">Address</p>
                                        <p className="font-semibold text-slate-900">{client.address}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Project Details */}
                        <div className="bg-blue-50 rounded-2xl p-6">
                            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Project Details
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-sm text-slate-600">Project Title</p>
                                    <p className="font-semibold text-slate-900 text-lg">{invoiceData.project_title}</p>
                                </div>
                                {invoiceData.project_description && (
                                    <div>
                                        <p className="text-sm text-slate-600">Description</p>
                                        <p className="text-slate-800">{invoiceData.project_description}</p>
                                    </div>
                                )}
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-slate-600">Total Amount</p>
                                        <p className="font-bold text-slate-900 text-2xl">
                                            ${totalAmount.toLocaleString()}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-600">Delivery Date</p>
                                        <p className="font-semibold text-slate-900">
                                            {format(deliveryDate, "MMMM d, yyyy")}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {invoiceData.delivery_address && (
                            <div className="bg-slate-50 rounded-2xl p-6">
                                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <Truck className="w-4 h-4" />
                                    Deliver To
                                </h3>
                                <p className="text-slate-800 whitespace-pre-wrap">{invoiceData.delivery_address}</p>
                            </div>
                        )}

                        {/* Payment Schedule */}
                        <div className="bg-emerald-50 rounded-2xl p-6">
                            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                Payment Schedule
                            </h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-4 bg-white rounded-xl">
                                    <div>
                                        <p className="font-semibold text-slate-900">Upfront Payment (50%)</p>
                                        <p className="text-sm text-slate-600">Due upon contract signing</p>
                                    </div>
                                    <p className="font-bold text-slate-900 text-lg">
                                        ${upfrontAmount.toLocaleString()}
                                    </p>
                                </div>
                                <div className="flex justify-between items-center p-4 bg-white rounded-xl">
                                    <div>
                                        <p className="font-semibold text-slate-900">Milestone Payment (25%)</p>
                                        <p className="text-sm text-slate-600">
                                            Due {format(milestoneDate, "MMM d, yyyy")}
                                        </p>
                                    </div>
                                    <p className="font-bold text-slate-900 text-lg">
                                        ${milestoneAmount.toLocaleString()}
                                    </p>
                                </div>
                                <div className="flex justify-between items-center p-4 bg-white rounded-xl">
                                    <div>
                                        <p className="font-semibold text-slate-900">Final Payment (25%)</p>
                                        <p className="text-sm text-slate-600">
                                            Due {format(finalDate, "MMM d, yyyy")}
                                        </p>
                                    </div>
                                    <p className="font-bold text-slate-900 text-lg">
                                        ${finalAmount.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Payment Method */}
                        <div className="bg-purple-50 rounded-2xl p-6">
                            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <CreditCard className="w-4 h-4" />
                                Payment Method
                            </h3>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-slate-600">Bank Name</p>
                                    <p className="font-semibold text-slate-900">{bankingDetail?.bank_name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Account Holder</p>
                                    <p className="font-semibold text-slate-900">{bankingDetail?.account_name}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Payment Type</p>
                                    <p className="font-semibold text-slate-900 capitalize">
                                        {bankingDetail?.payment_method.replace('_', ' ')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {invoiceData.notes && (
                            <div className="bg-amber-50 rounded-2xl p-6">
                                <h3 className="font-bold text-slate-900 mb-4">Additional Notes</h3>
                                <p className="text-slate-800">{invoiceData.notes}</p>
                            </div>
                        )}

                        {invoiceData.terms_conditions && (
                            <div className="bg-slate-50 rounded-2xl p-6">
                                <h3 className="font-bold text-slate-900 mb-4">Terms &amp; Conditions</h3>
                                <p className="text-slate-800 whitespace-pre-wrap">{invoiceData.terms_conditions}</p>
                            </div>
                        )}

                        {/* Recurring Options */}
                        {!isEditing && props.setIsRecurring && (
                            <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-indigo-100 p-2 rounded-lg">
                                            <Repeat className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900">Recurring Schedule</h3>
                                            <p className="text-sm text-slate-600">Create a recurring profile from this invoice</p>
                                        </div>
                                    </div>
                                    <Switch 
                                        checked={isRecurring} 
                                        onCheckedChange={setIsRecurring} 
                                    />
                                </div>
                                
                                {isRecurring && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        className="grid md:grid-cols-2 gap-4 pt-4 border-t border-indigo-200/50"
                                    >
                                        <div className="space-y-2">
                                            <Label>Profile Name</Label>
                                            <Input 
                                                value={profileName} 
                                                onChange={(e) => setProfileName(e.target.value)} 
                                                placeholder="e.g. Monthly Retainer" 
                                                className="bg-white"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Frequency</Label>
                                            <Select value={frequency} onValueChange={setFrequency}>
                                                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="weekly">Weekly</SelectItem>
                                                    <SelectItem value="monthly">Monthly</SelectItem>
                                                    <SelectItem value="yearly">Yearly</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Start Date</Label>
                                            <Input 
                                                type="date" 
                                                value={startDate} 
                                                onChange={(e) => setStartDate(e.target.value)} 
                                                className="bg-white"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>End Date (Optional)</Label>
                                            <Input 
                                                type="date" 
                                                value={endDate} 
                                                onChange={(e) => setEndDate(e.target.value)} 
                                                className="bg-white"
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className={`flex ${showBack ? 'justify-between' : 'justify-end'} mt-8`}>
                        {showBack && (
                            <Button
                                onClick={onPrevious}
                                variant="outline"
                                disabled={loading}
                                className="px-8 py-3 rounded-xl border-slate-200 hover:bg-slate-50"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                        )}
                        
                        {isEditing ? (
                            <InvoiceSaveActions
                                onSaveDraft={async () => {
                                    setLoading(true);
                                    await onCreate(true); // true = save as draft
                                    setLoading(false);
                                }}
                                onSendNow={async () => {
                                    setLoading(true);
                                    await onCreate(false); // false = send immediately
                                    setLoading(false);
                                }}
                                loading={loading}
                                disabled={false}
                                buttonText={{
                                    draft: "Update Draft",
                                    send: "Update & Send"
                                }}
                            />
                        ) : (
                            <InvoiceSaveActions
                                onSaveDraft={async () => {
                                    setLoading(true);
                                    await onCreate(true); // true = save as draft
                                    setLoading(false);
                                }}
                                onSendNow={async () => {
                                    setLoading(true);
                                    await onCreate(false); // false = send immediately
                                    setLoading(false);
                                }}
                                loading={loading}
                                disabled={false}
                            />
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}

InvoicePreview.propTypes = {
    invoiceData: invoiceDataPropType.isRequired,
    clients: PropTypes.arrayOf(clientPropType).isRequired,
    bankingDetails: PropTypes.arrayOf(bankingDetailPropType).isRequired,
    onPrevious: PropTypes.func,
    onCreate: PropTypes.func.isRequired,
    isEditing: PropTypes.bool,
    showBack: PropTypes.bool,
    isRecurring: PropTypes.bool,
    setIsRecurring: PropTypes.func,
    frequency: PropTypes.string,
    setFrequency: PropTypes.func,
    startDate: PropTypes.string,
    setStartDate: PropTypes.func,
    endDate: PropTypes.string,
    setEndDate: PropTypes.func,
    profileName: PropTypes.string,
    setProfileName: PropTypes.func
};