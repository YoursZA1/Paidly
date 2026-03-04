import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
    Edit, 
    Star, 
    CreditCard, 
    Building2, 
    Smartphone,
    Bitcoin,
    FileText
} from "lucide-react";
import { motion } from "framer-motion";

const paymentIcons = {
    bank_transfer: Building2,
    paypal: Smartphone,
    stripe: CreditCard,
    crypto: Bitcoin,
    check: FileText
};

const paymentGradients = {
    bank_transfer: "from-primary to-[#ff7c00]",
    paypal: "from-primary to-[#ff7c00]",
    stripe: "from-purple-500 to-purple-600",
    crypto: "from-orange-500 to-yellow-500",
    check: "from-gray-500 to-gray-600"
};

export default function BankingCard({ detail, onEdit, onSetDefault, delay = 0 }) {
    const IconComponent = paymentIcons[detail.payment_method] || CreditCard;
    const gradient = paymentGradients[detail.payment_method] || "from-primary to-[#ff7c00]";

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
        >
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 group relative">
                {detail.is_default && (
                    <div className="absolute -top-2 -right-2 z-10">
                        <div className="bg-gradient-to-r from-amber-400 to-yellow-500 rounded-full p-2 shadow-lg">
                            <Star className="w-4 h-4 text-white fill-current" />
                        </div>
                    </div>
                )}
                
                <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                            <div className={`w-12 h-12 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center shadow-lg`}>
                                <IconComponent className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground text-lg group-hover:text-primary transition-colors duration-200">
                                    {detail.bank_name}
                                </h3>
                                <p className="text-sm text-muted-foreground capitalize">
                                    {detail.payment_method.replace('_', ' ')}
                                </p>
                            </div>
                        </div>
                        
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit(detail)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-primary/10"
                        >
                            <Edit className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                Account Holder
                            </p>
                            <p className="font-semibold text-foreground">{detail.account_name}</p>
                        </div>
                        
                        {detail.account_number && (
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                    Account Number
                                </p>
                                <p className="font-mono text-foreground">
                                    ****{detail.account_number.slice(-4)}
                                </p>
                            </div>
                        )}
                        
                        {detail.routing_number && (
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                    Routing Number
                                </p>
                                <p className="font-mono text-foreground">{detail.routing_number}</p>
                            </div>
                        )}
                        
                        {detail.swift_code && (
                            <div>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                    SWIFT Code
                                </p>
                                <p className="font-mono text-foreground">{detail.swift_code}</p>
                            </div>
                        )}
                        
                        {detail.additional_info && (
                            <div className="mt-4 p-3 bg-muted rounded-lg">
                                <p className="text-sm text-muted-foreground">{detail.additional_info}</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">
                            Added {new Date(detail.created_date).toLocaleDateString()}
                        </Badge>
                        
                        {!detail.is_default && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onSetDefault(detail.id)}
                                className="text-xs hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700"
                            >
                                Set as Default
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}