import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, Save, CreditCard, Link as LinkIcon } from "lucide-react";
import { motion } from "framer-motion";

export default function BankingForm({ detail, onSave, onCancel }) {
    const [formData, setFormData] = useState({
        bank_name: detail?.bank_name || "",
        account_name: detail?.account_name || "",
        account_number: detail?.account_number || "",
        routing_number: detail?.routing_number || "",
        swift_code: detail?.swift_code || "",
        payment_method: detail?.payment_method || "bank_transfer",
        payment_gateway_url: detail?.payment_gateway_url || "",
        additional_info: detail?.additional_info || "",
        is_default: detail?.is_default || false,
    });

    const isOnlinePayment = ['paypal', 'stripe', 'crypto'].includes(formData.payment_method);
    const isBankTransfer = formData.payment_method === 'bank_transfer';
    const isValid = formData.bank_name && formData.account_name;

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-8"
        >
            <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <CreditCard className="w-5 h-5" />
                            {detail ? "Edit Payment Method" : "Add Payment Method"}
                        </CardTitle>
                        <Button variant="ghost" size="icon" onClick={onCancel}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="payment_method">Payment Method *</Label>
                                <Select value={formData.payment_method} onValueChange={(value) => handleInputChange('payment_method', value)}>
                                    <SelectTrigger className="h-12 rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                        <SelectItem value="paypal">PayPal</SelectItem>
                                        <SelectItem value="stripe">Stripe</SelectItem>
                                        <SelectItem value="crypto">Cryptocurrency</SelectItem>
                                        <SelectItem value="check">Check</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bank_name">
                                    {isBankTransfer ? "Bank Name *" : "Platform Name *"}
                                </Label>
                                <Input
                                    id="bank_name"
                                    value={formData.bank_name}
                                    onChange={(e) => handleInputChange('bank_name', e.target.value)}
                                    placeholder={isBankTransfer ? "e.g., FNB, Standard Bank" : "e.g., PayPal, Stripe"}
                                    className="h-12 rounded-xl"
                                />
                            </div>
                        </div>

                        {isOnlinePayment && (
                            <div className="space-y-2">
                                <Label htmlFor="payment_gateway_url">Payment Gateway URL</Label>
                                <div className="relative">
                                     <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        id="payment_gateway_url"
                                        value={formData.payment_gateway_url}
                                        onChange={(e) => handleInputChange('payment_gateway_url', e.target.value)}
                                        placeholder="https://paypal.me/yourprofile or https://buy.stripe.com/..."
                                        className="h-12 rounded-xl pl-10"
                                    />
                                </div>
                            </div>
                        )}
                        
                        <div className="grid md:grid-cols-2 gap-6">
                             <div className="space-y-2">
                                <Label htmlFor="account_name">Account/Holder Name *</Label>
                                <Input
                                    id="account_name"
                                    value={formData.account_name}
                                    onChange={(e) => handleInputChange('account_name', e.target.value)}
                                    placeholder="e.g., John Doe or Company Name"
                                    className="h-12 rounded-xl"
                                />
                            </div>
                            {isBankTransfer && (
                                <div className="space-y-2">
                                    <Label htmlFor="account_number">Account Number</Label>
                                    <Input
                                        id="account_number"
                                        value={formData.account_number}
                                        onChange={(e) => handleInputChange('account_number', e.target.value)}
                                        className="h-12 rounded-xl"
                                    />
                                </div>
                            )}
                        </div>

                        {isBankTransfer && (
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="routing_number">Branch/Routing Number</Label>
                                    <Input
                                        id="routing_number"
                                        value={formData.routing_number}
                                        onChange={(e) => handleInputChange('routing_number', e.target.value)}
                                        className="h-12 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="swift_code">SWIFT/BIC Code</Label>
                                    <Input
                                        id="swift_code"
                                        value={formData.swift_code}
                                        onChange={(e) => handleInputChange('swift_code', e.target.value)}
                                        className="h-12 rounded-xl"
                                    />
                                </div>
                            </div>
                        )}
                        
                        <div className="space-y-2">
                            <Label htmlFor="additional_info">Additional Info / Instructions</Label>
                            <Textarea
                                id="additional_info"
                                value={formData.additional_info}
                                onChange={(e) => handleInputChange('additional_info', e.target.value)}
                                placeholder={
                                    formData.payment_method === 'crypto' 
                                    ? "e.g., Wallet Address: 0xAbCd... Network: Ethereum (ERC20)" 
                                    : "e.g., Use invoice number as reference"
                                }
                                className="min-h-20 rounded-xl"
                            />
                        </div>
                        
                        <div className="flex items-center space-x-3">
                            <Switch
                                id="is_default"
                                checked={formData.is_default}
                                onCheckedChange={(checked) => handleInputChange('is_default', checked)}
                            />
                            <Label htmlFor="is_default" className="font-medium">Set as default payment method</Label>
                        </div>
                        
                        <div className="flex justify-end space-x-4 pt-4">
                            <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl">
                                Cancel
                            </Button>
                            <Button type="submit" disabled={!isValid} className="bg-primary hover:bg-primary/90 text-white rounded-xl disabled:opacity-50">
                                <Save className="w-4 h-4 mr-2" />
                                {detail ? "Update Method" : "Save Method"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </motion.div>
    );
}