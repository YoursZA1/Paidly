import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, DollarSign, Clock, Archive, CheckCircle, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { formatCurrency } from "../CurrencySelector";
import { ITEM_TYPES } from "@/components/invoice/itemTypeHelpers";
import { getPriceLockStatus } from "@/services/ItemPermissionsService";
import { getUsageBadge } from "@/services/ItemUsageService";
import { renderIcon } from "@/utils/renderIcon";

const serviceTypeLabels = {
    hourly: "Per Hour",
    fixed: "Fixed Price", 
    per_item: "Per Item",
    daily: "Per Day",
    weekly: "Per Week",
    monthly: "Per Month"
};

export default function ServiceCard({ service, onEdit, onToggleActive, delay = 0, userCurrency = 'USD' }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
        >
            <Card className={`bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 group ${!service.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-bold text-slate-900 text-lg group-hover:text-blue-600 transition-colors duration-200">
                                    {service.name}
                                </h3>
                                {!service.is_active && <Archive className="w-4 h-4 text-gray-400" />}
                            </div>
                            
                            <div className="flex flex-wrap gap-2 mb-3">
                                {service.category && (
                                    <Badge variant="outline" className="text-xs">
                                        {service.category}
                                    </Badge>
                                )}
                                {(() => {
                                    const itemType = ITEM_TYPES.find(t => t.value === (service.item_type || 'service'));
                                    return itemType ? (
                                        <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-300">
                                            {renderIcon(itemType.icon, {style: {width: 16, height: 16}, className: "inline-block align-middle mr-1"})} {itemType.label}
                                        </Badge>
                                    ) : null;
                                })()}
                                <Badge variant="secondary" className="text-xs">
                                    {serviceTypeLabels[service.service_type] || 'Fixed Price'}
                                </Badge>
                                
                                {/* Price Lock Status Badge */}
                                {service.price_locked && (
                                    <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-300">
                                        <Lock className="w-3 h-3 mr-1" />
                                        Pricing Locked
                                    </Badge>
                                )}
                                
                                {/* Usage Badge */}
                                {service.usage_count !== undefined && service.usage_count > 0 && (
                                    <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-300">
                                        📊 Used {service.usage_count}x
                                    </Badge>
                                )}
                                
                                {service.is_active && (
                                    <Badge variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Active
                                    </Badge>
                                )}
                            </div>
                        </div>
                        
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit(service)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-blue-50"
                        >
                            <Edit className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {service.description && (
                            <p className="text-sm text-slate-600 line-clamp-2">{service.description}</p>
                        )}
                        
                        <div className="flex justify-between items-center">
                            <div className={service.price_locked ? 'p-2 rounded bg-orange-50 border border-orange-200 flex-1' : ''}>
                                <p className="text-sm font-medium text-slate-500">Default Rate</p>
                                <p className="font-semibold text-slate-800 text-xl">
                                    {formatCurrency(service.default_rate || service.unit_price, userCurrency)}
                                    <span className="text-sm text-slate-500 ml-1">
                                        / {service.default_unit || service.unit_of_measure || 'unit'}
                                    </span>
                                    {service.price_locked && (
                                        <span className="text-xs text-orange-600 ml-2">🔒</span>
                                    )}
                                </p>
                            </div>
                            
                            {service.tax_category && (
                                <div className="text-right">
                                    <p className="text-sm font-medium text-slate-500">Tax</p>
                                    <p className="text-sm text-slate-600 font-medium">{service.tax_category}</p>
                                </div>
                            )}
                        </div>

                        {/* Type-Specific Fields Display */}
                        {service.item_type === 'product' && (
                            <div className="pt-2 border-t border-slate-100">
                                {service.sku && <p className="text-xs text-slate-600"><span className="font-semibold">SKU:</span> {service.sku}</p>}
                                {service.unit && <p className="text-xs text-slate-600"><span className="font-semibold">Unit:</span> {service.unit}</p>}
                            </div>
                        )}

                        {service.item_type === 'service' && (
                            <div className="pt-2 border-t border-slate-100">
                                {service.billing_unit && <p className="text-xs text-slate-600"><span className="font-semibold">Billing:</span> {service.billing_unit}</p>}
                            </div>
                        )}

                        {service.item_type === 'labor' && (
                            <div className="pt-2 border-t border-slate-100">
                                {service.role && <p className="text-xs text-slate-600"><span className="font-semibold">Role:</span> {service.role}</p>}
                            </div>
                        )}

                        {service.item_type === 'material' && (
                            <div className="pt-2 border-t border-slate-100">
                                {service.unit_type && <p className="text-xs text-slate-600"><span className="font-semibold">Unit:</span> {service.unit_type}</p>}
                            </div>
                        )}

                        {service.item_type === 'expense' && (
                            <div className="pt-2 border-t border-slate-100">
                                {service.cost_type && <p className="text-xs text-slate-600"><span className="font-semibold">Type:</span> {service.cost_type}</p>}
                            </div>
                        )}

                        {service.tags && service.tags.length > 0 && (
                            <div className="pt-2 border-t border-slate-100">
                                <div className="flex flex-wrap gap-1">
                                    {service.tags.slice(0, 3).map((tag, index) => (
                                        <Badge key={index} variant="outline" className="text-xs px-2 py-1">
                                            {tag}
                                        </Badge>
                                    ))}
                                    {service.tags.length > 3 && (
                                        <Badge variant="outline" className="text-xs px-2 py-1">
                                            +{service.tags.length - 3} more
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        )}

                        {service.min_quantity > 1 && (
                            <p className="text-xs text-slate-500">
                                Minimum quantity: {service.min_quantity}
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}