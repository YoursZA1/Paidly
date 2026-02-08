import React from "react";
import { Badge } from "@/components/ui/badge";
import { Crown, Star, Sparkles, AlertTriangle } from "lucide-react";

const segmentConfig = {
    vip: {
        label: "VIP",
        icon: Crown,
        className: "bg-amber-100 text-amber-800 border-amber-200"
    },
    regular: {
        label: "Regular",
        icon: Star,
        className: "bg-blue-100 text-blue-800 border-blue-200"
    },
    new: {
        label: "New",
        icon: Sparkles,
        className: "bg-green-100 text-green-800 border-green-200"
    },
    at_risk: {
        label: "At Risk",
        icon: AlertTriangle,
        className: "bg-red-100 text-red-800 border-red-200"
    }
};

export default function ClientSegmentBadge({ segment }) {
    const config = segmentConfig[segment] || segmentConfig.new;
    const Icon = config.icon;

    return (
        <Badge variant="outline" className={`${config.className} border gap-1`}>
            <Icon className="w-3 h-3" />
            {config.label}
        </Badge>
    );
}

export function getSegmentFromSpending(totalSpent, lastInvoiceDate) {
    const daysSinceLastInvoice = lastInvoiceDate 
        ? Math.floor((new Date() - new Date(lastInvoiceDate)) / (1000 * 60 * 60 * 24))
        : Infinity;

    // At risk: no invoice in 90+ days and has previous spending
    if (totalSpent > 0 && daysSinceLastInvoice > 90) {
        return 'at_risk';
    }
    
    // VIP: spent more than 50,000
    if (totalSpent >= 50000) {
        return 'vip';
    }
    
    // Regular: spent between 5,000 and 50,000
    if (totalSpent >= 5000) {
        return 'regular';
    }
    
    // New: spent less than 5,000
    return 'new';
}