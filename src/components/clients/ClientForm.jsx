import { useState } from 'react';
import PropTypes from 'prop-types';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, Save, User, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { industries } from "./IndustryBadge";

export default function ClientForm({ client, onSave, onCancel }) {
    const [formData, setFormData] = useState({
        name: client?.name || "",
        email: client?.email || "",
        phone: client?.phone || "",
        address: client?.address || "",
        contact_person: client?.contact_person || "",
        website: client?.website || "",
        tax_id: client?.tax_id || "",
        fax: client?.fax || "",
        alternate_email: client?.alternate_email || "",
        notes: client?.notes || "",
        internal_notes: client?.internal_notes || "",
        industry: client?.industry || "",
        payment_terms: client?.payment_terms || "net_30",
        payment_terms_days: client?.payment_terms_days || 30,
        follow_up_enabled: client?.follow_up_enabled !== false
    });

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const isValid = formData.name.trim() && formData.email.trim();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
        >
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-slate-100 pb-6">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <User className="w-5 h-5" />
                            {client ? "Edit Client" : "Add New Client"}
                        </CardTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onCancel}
                            className="hover:bg-slate-100"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </CardHeader>
                
                <CardContent className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-semibold text-slate-700">
                                    Client Name *
                                </Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    placeholder="Enter client name"
                                    className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-sm font-semibold text-slate-700">
                                    Email Address *
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => handleInputChange('email', e.target.value)}
                                    placeholder="client@example.com"
                                    className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone" className="text-sm font-semibold text-slate-700">
                                    Phone Number
                                </Label>
                                <Input
                                    id="phone"
                                    value={formData.phone}
                                    onChange={(e) => handleInputChange('phone', e.target.value)}
                                    placeholder="+1 (555) 000-0000"
                                    className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="contact_person" className="text-sm font-semibold text-slate-700">
                                    Contact Person
                                </Label>
                                <Input
                                    id="contact_person"
                                    value={formData.contact_person}
                                    onChange={(e) => handleInputChange('contact_person', e.target.value)}
                                    placeholder="Primary contact name"
                                    className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="website" className="text-sm font-semibold text-slate-700">
                                    Website
                                </Label>
                                <Input
                                    id="website"
                                    type="url"
                                    value={formData.website}
                                    onChange={(e) => handleInputChange('website', e.target.value)}
                                    placeholder="https://example.com"
                                    className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="tax_id" className="text-sm font-semibold text-slate-700">
                                    Tax ID / VAT Number
                                </Label>
                                <Input
                                    id="tax_id"
                                    value={formData.tax_id}
                                    onChange={(e) => handleInputChange('tax_id', e.target.value)}
                                    placeholder="Tax ID or VAT number"
                                    className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="alternate_email" className="text-sm font-semibold text-slate-700">
                                    Alternate Email
                                </Label>
                                <Input
                                    id="alternate_email"
                                    type="email"
                                    value={formData.alternate_email}
                                    onChange={(e) => handleInputChange('alternate_email', e.target.value)}
                                    placeholder="alternate@example.com"
                                    className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="fax" className="text-sm font-semibold text-slate-700">
                                    Fax
                                </Label>
                                <Input
                                    id="fax"
                                    value={formData.fax}
                                    onChange={(e) => handleInputChange('fax', e.target.value)}
                                    placeholder="+1 (555) 000-0001"
                                    className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="industry" className="text-sm font-semibold text-slate-700">
                                    Industry
                                </Label>
                                <Select
                                    value={formData.industry}
                                    onValueChange={(value) => handleInputChange('industry', value)}
                                >
                                    <SelectTrigger className="h-12 rounded-xl">
                                        <SelectValue placeholder="Select industry" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {industries.map(ind => (
                                            <SelectItem key={ind.value} value={ind.value}>
                                                {ind.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Payment Terms Section */}
                        <div className="bg-primary/10 border border-primary/20 rounded-xl p-6 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-sm font-bold text-foreground uppercase">Default Payment Terms</h3>
                                <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30">
                                    Auto-applies to invoices
                                </Badge>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="payment_terms" className="text-sm font-semibold text-slate-700">
                                        Payment Terms
                                    </Label>
                                    <Select
                                        value={formData.payment_terms}
                                        onValueChange={(value) => {
                                            handleInputChange('payment_terms', value);
                                            // Update days based on selection
                                            if (value === 'due_on_receipt') handleInputChange('payment_terms_days', 0);
                                            else if (value === 'net_15') handleInputChange('payment_terms_days', 15);
                                            else if (value === 'net_30') handleInputChange('payment_terms_days', 30);
                                            else if (value === 'net_45') handleInputChange('payment_terms_days', 45);
                                            else if (value === 'net_60') handleInputChange('payment_terms_days', 60);
                                            else if (value === 'net_90') handleInputChange('payment_terms_days', 90);
                                        }}
                                    >
                                        <SelectTrigger className="h-12 rounded-xl">
                                            <SelectValue placeholder="Select payment terms" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                                            <SelectItem value="net_15">Net 15 Days</SelectItem>
                                            <SelectItem value="net_30">Net 30 Days</SelectItem>
                                            <SelectItem value="net_45">Net 45 Days</SelectItem>
                                            <SelectItem value="net_60">Net 60 Days</SelectItem>
                                            <SelectItem value="net_90">Net 90 Days</SelectItem>
                                            <SelectItem value="custom">Custom</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {formData.payment_terms === 'custom' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="payment_terms_days" className="text-sm font-semibold text-slate-700">
                                            Custom Days
                                        </Label>
                                        <Input
                                            id="payment_terms_days"
                                            type="number"
                                            min="0"
                                            value={formData.payment_terms_days}
                                            onChange={(e) => handleInputChange('payment_terms_days', parseInt(e.target.value) || 0)}
                                            placeholder="Number of days"
                                            className="h-12 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20"
                                        />
                                    </div>
                                )}
                            </div>
                            
                            <p className="text-xs text-slate-600 italic">
                                These terms will automatically apply to new invoices created for this client.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="address" className="text-sm font-semibold text-slate-700">
                                Address
                            </Label>
                            <Textarea
                                id="address"
                                value={formData.address}
                                onChange={(e) => handleInputChange('address', e.target.value)}
                                placeholder="Client's business address"
                                className="min-h-24 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20 resize-none"
                            />
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="notes" className="text-sm font-semibold text-slate-700">
                                    Client Notes
                                </Label>
                                <p className="text-xs text-slate-500">Visible to client (shown on portal/emails)</p>
                                <Textarea
                                    id="notes"
                                    value={formData.notes}
                                    onChange={(e) => handleInputChange('notes', e.target.value)}
                                    placeholder="Public notes about this client..."
                                    className="min-h-32 rounded-xl border-slate-200 focus:border-primary focus:ring-primary/20 resize-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="internal_notes" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                    <Lock className="w-4 h-4" />
                                    Internal Notes
                                </Label>
                                <p className="text-xs text-slate-500">Private - only visible to your team</p>
                                <Textarea
                                    id="internal_notes"
                                    value={formData.internal_notes}
                                    onChange={(e) => handleInputChange('internal_notes', e.target.value)}
                                    placeholder="Internal notes, reminders, special requirements..."
                                    className="min-h-32 rounded-xl border-amber-200 bg-amber-50/30 focus:border-amber-500 focus:ring-amber-500/20 resize-none"
                                />
                            </div>
                        </div>

                        {/* Follow-up Settings */}
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                            <div>
                                <Label className="text-sm font-semibold text-slate-700">
                                    Automated Follow-up Reminders
                                </Label>
                                <p className="text-xs text-slate-500 mt-1">
                                    Send automatic reminders for overdue invoices
                                </p>
                            </div>
                            <Switch
                                checked={formData.follow_up_enabled}
                                onCheckedChange={(checked) => handleInputChange('follow_up_enabled', checked)}
                            />
                        </div>

                        <div className="flex justify-end space-x-4 pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onCancel}
                                className="px-6 py-3 rounded-xl border-slate-200 hover:bg-slate-50"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={!isValid}
                                className="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {client ? "Update Client" : "Save Client"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </motion.div>
    );
}

ClientForm.propTypes = {
    client: PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        email: PropTypes.string,
        phone: PropTypes.string,
        address: PropTypes.string,
        contact_person: PropTypes.string,
        website: PropTypes.string,
        tax_id: PropTypes.string,
        fax: PropTypes.string,
        alternate_email: PropTypes.string,
        notes: PropTypes.string,
        internal_notes: PropTypes.string,
        industry: PropTypes.string,
        payment_terms: PropTypes.string,
        payment_terms_days: PropTypes.number,
        follow_up_enabled: PropTypes.bool
    }),
    onSave: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

ClientForm.defaultProps = {
    client: null
};