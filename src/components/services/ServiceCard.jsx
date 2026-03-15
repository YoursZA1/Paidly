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

function ServiceCard({ service, onEdit, onToggleActive, delay = 0, userCurrency = 'USD' }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
        >
            <Card className={`bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm border-0 dark:border dark:border-slate-700 shadow-lg hover:shadow-xl transition-all duration-300 group ${!service.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg group-hover:text-primary transition-colors duration-200">
                                    {service.name}
                                </h3>
                                {!service.is_active && <Archive className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
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
                                        <Badge className="text-xs bg-primary/15 text-primary border-primary/30">
                                            {renderIcon(itemType.icon, {style: {width: 16, height: 16}, className: "inline-block align-middle mr-1"})} {itemType.label}
                                        </Badge>
                                    ) : null;
                                })()}
                                <Badge variant="secondary" className="text-xs">
                                    {serviceTypeLabels[service.service_type] || 'Fixed Price'}
                                </Badge>
                                
                                {/* Price Lock Status Badge */}
                                {service.price_locked && (
                                    <Badge className="text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700">
                                        <Lock className="w-3 h-3 mr-1" />
                                        Pricing Locked
                                    </Badge>
                                )}
                                
                                {/* Usage Badge */}
                                {service.usage_count !== undefined && service.usage_count > 0 && (
                                    <Badge className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700">
                                        📊 Used {service.usage_count}x
                                    </Badge>
                                )}
                                
                                {service.is_active && (
                                    <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300">
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
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-primary/10"
                        >
                            <Edit className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {service.description && (
                            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{service.description}</p>
                        )}
                        
                        <div className="flex justify-between items-center">
                            <div className={service.price_locked ? 'p-2 rounded bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 flex-1' : ''}>
                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Default Rate</p>
                                <p className="font-semibold text-slate-800 dark:text-slate-100 text-xl">
                                    {formatCurrency(service.default_rate || service.unit_price, userCurrency)}
                                    <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">
                                        / {service.default_unit || service.unit_of_measure || 'unit'}
                                    </span>
                                    {service.price_locked && (
                                        <span className="text-xs text-orange-600 dark:text-orange-400 ml-2">🔒</span>
                                    )}
                                </p>
                            </div>
                            
                            {service.tax_category && (
                                <div className="text-right">
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Tax</p>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">{service.tax_category}</p>
                                </div>
                            )}
                        </div>

                        {/* Type-Specific Fields Display */}
                        {service.item_type === 'product' && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                                {service.sku && <p className="text-xs text-slate-600 dark:text-slate-400"><span className="font-semibold">SKU:</span> {service.sku}</p>}
                                {service.unit && <p className="text-xs text-slate-600 dark:text-slate-400"><span className="font-semibold">Unit:</span> {service.unit}</p>}
                            </div>
                        )}

                        {service.item_type === 'service' && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                                {service.billing_unit && <p className="text-xs text-slate-600 dark:text-slate-400"><span className="font-semibold">Billing:</span> {service.billing_unit}</p>}
                            </div>
                        )}

                        {service.item_type === 'labor' && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                                {service.role && <p className="text-xs text-slate-600 dark:text-slate-400"><span className="font-semibold">Role:</span> {service.role}</p>}
                            </div>
                        )}

                        {service.item_type === 'material' && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                                {service.unit_type && <p className="text-xs text-slate-600 dark:text-slate-400"><span className="font-semibold">Unit:</span> {service.unit_type}</p>}
                            </div>
                        )}

                        {service.item_type === 'expense' && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                                {service.cost_type && <p className="text-xs text-slate-600 dark:text-slate-400"><span className="font-semibold">Type:</span> {service.cost_type}</p>}
                            </div>
                        )}

                        {service.tags && service.tags.length > 0 && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
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
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Minimum quantity: {service.min_quantity}
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}

export default React.memo(ServiceCard);