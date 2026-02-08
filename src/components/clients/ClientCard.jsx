import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Mail, Phone, MapPin, User, Eye, ExternalLink, Trash2, Globe, Smartphone, Lock, CreditCard } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ClientSegmentBadge from "./ClientSegmentBadge";
import IndustryBadge from "./IndustryBadge";
import { formatCurrency } from "../CurrencySelector";

const getPaymentTermsText = (terms, days) => {
    if (!terms) return 'Net 30';
    if (terms === 'due_on_receipt') return 'Due on Receipt';
    if (terms === 'custom') return `Net ${days || 30}`;
    if (terms.startsWith('net_')) {
        const termDays = terms.split('_')[1];
        return `Net ${termDays}`;
    }
    return 'Net 30';
};

export default function ClientCard({ client, onEdit, onDelete, delay = 0, currency = 'ZAR' }) {
    const portalUrl = `${window.location.origin}${createPageUrl('ClientPortal')}`;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
        >
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 group cursor-pointer">
                <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                                <User className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 text-lg group-hover:text-blue-600 transition-colors duration-200">
                                    {client.name}
                                </h3>
                                {client.contact_person && (
                                    <p className="text-sm text-slate-600">
                                        Contact: {client.contact_person}
                                    </p>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex gap-1">
                            <Link to={createPageUrl("ClientDetail") + `?id=${client.id}`}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-blue-50"
                                >
                                    <Eye className="w-4 h-4" />
                                </Button>
                            </Link>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); onEdit(client); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-blue-50"
                            >
                                <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); onDelete?.(client); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-50 text-red-600"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Segment and Industry Badges */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        <ClientSegmentBadge segment={client.segment || 'new'} />
                        {client.industry && <IndustryBadge industry={client.industry} />}
                        {client.internal_notes && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                                <Lock className="w-3 h-3 mr-1" />
                                Has Notes
                            </Badge>
                        )}
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-300">
                            <CreditCard className="w-3 h-3 mr-1" />
                            {getPaymentTermsText(client.payment_terms, client.payment_terms_days)}
                        </Badge>
                    </div>

                    {/* Total Spent */}
                    {client.total_spent > 0 && (
                        <div className="mb-4 p-3 bg-emerald-50 rounded-lg">
                            <p className="text-xs text-emerald-600 font-medium">Total Spent</p>
                            <p className="text-lg font-bold text-emerald-700">
                                {formatCurrency(client.total_spent, currency)}
                            </p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex items-center space-x-2 text-sm">
                            <Mail className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-600">{client.email}</span>
                        </div>
                        
                        {client.phone && (
                            <div className="flex items-center space-x-2 text-sm">
                                <Phone className="w-4 h-4 text-slate-400" />
                                <span className="text-slate-600">{client.phone}</span>
                            </div>
                        )}

                        {client.alternate_email && (
                            <div className="flex items-center space-x-2 text-sm">
                                <Mail className="w-4 h-4 text-slate-400" />
                                <span className="text-slate-600">{client.alternate_email}</span>
                            </div>
                        )}

                        {client.fax && (
                            <div className="flex items-center space-x-2 text-sm">
                                <Smartphone className="w-4 h-4 text-slate-400" />
                                <span className="text-slate-600">Fax: {client.fax}</span>
                            </div>
                        )}
                        
                        {client.address && (
                            <div className="flex items-start space-x-2 text-sm">
                                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                                <span className="text-slate-600 flex-1">{client.address}</span>
                            </div>
                        )}

                        {client.website && (
                            <div className="flex items-center space-x-2 text-sm">
                                <Globe className="w-4 h-4 text-slate-400" />
                                <a 
                                    href={client.website} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-700 truncate"
                                >
                                    {client.website.replace(/^https?:\/\//, '')}
                                </a>
                            </div>
                        )}

                        {client.tax_id && (
                            <div className="text-xs text-slate-500 mt-2 p-2 bg-slate-50 rounded">
                                <p className="font-medium">Tax ID:</p>
                                <p>{client.tax_id}</p>
                            </div>
                        )}
                        
                        {client.notes && (
                            <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                                <p className="text-sm text-slate-600 line-clamp-2">{client.notes}</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">
                            Added {new Date(client.created_date).toLocaleDateString()}
                        </Badge>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-blue-600 hover:text-blue-700"
                            onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(portalUrl);
                            }}
                        >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Portal Link
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}