import React from "react";
import { Badge } from "@/components/ui/badge";
import { 
    Monitor, 
    Heart, 
    Banknote, 
    ShoppingBag, 
    Factory, 
    GraduationCap, 
    Building2, 
    UtensilsCrossed, 
    Briefcase, 
    Palette, 
    Scale,
    MoreHorizontal 
} from "lucide-react";

const industryConfig = {
    technology: { label: "Technology", icon: Monitor, color: "bg-blue-50 text-blue-700" },
    healthcare: { label: "Healthcare", icon: Heart, color: "bg-red-50 text-red-700" },
    finance: { label: "Finance", icon: Banknote, color: "bg-green-50 text-green-700" },
    retail: { label: "Retail", icon: ShoppingBag, color: "bg-purple-50 text-purple-700" },
    manufacturing: { label: "Manufacturing", icon: Factory, color: "bg-gray-50 text-gray-700" },
    education: { label: "Education", icon: GraduationCap, color: "bg-yellow-50 text-yellow-700" },
    real_estate: { label: "Real Estate", icon: Building2, color: "bg-teal-50 text-teal-700" },
    hospitality: { label: "Hospitality", icon: UtensilsCrossed, color: "bg-orange-50 text-orange-700" },
    consulting: { label: "Consulting", icon: Briefcase, color: "bg-indigo-50 text-indigo-700" },
    creative: { label: "Creative", icon: Palette, color: "bg-pink-50 text-pink-700" },
    legal: { label: "Legal", icon: Scale, color: "bg-slate-50 text-slate-700" },
    other: { label: "Other", icon: MoreHorizontal, color: "bg-gray-50 text-gray-700" }
};

export default function IndustryBadge({ industry }) {
    if (!industry) return null;
    
    const config = industryConfig[industry] || industryConfig.other;
    const Icon = config.icon;

    return (
        <Badge variant="secondary" className={`${config.color} gap-1 text-xs`}>
            <Icon className="w-3 h-3" />
            {config.label}
        </Badge>
    );
}

export const industries = Object.entries(industryConfig).map(([value, { label }]) => ({
    value,
    label
}));