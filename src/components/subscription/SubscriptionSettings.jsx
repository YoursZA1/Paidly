import { useState, useEffect } from "react";
import { User } from "@/api/entities";
import { useAuth } from "@/components/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Star, Rocket, Globe, ExternalLink } from "lucide-react";
import PayFastSubscriptionForm from "@/components/subscription/PayFastSubscriptionForm";

const BILLING_PORTAL_URL = import.meta.env.VITE_STRIPE_BILLING_PORTAL || "https://paidly.com";
const CONTACT_SALES_URL = "https://paidly.com/contact";

const TIERS = [
    {
        id: "free",
        name: "Free",
        price: "R 0",
        description: "Perfect for freelancers just starting out.",
        features: ["1 User", "Unlimited Invoices", "Standard Templates"],
        buttonText: "Downgrade",
    },
    {
        id: "starter",
        name: "Starter",
        price: "R 199",
        description: "For small teams needing more power.",
        features: ["3 Users", "Custom Branding", "CSV Exports", "Basic Analytics"],
        buttonText: "Current Plan",
    },
    {
        id: "professional",
        name: "Professional",
        price: "R 499",
        description: "Automate your business workflows.",
        features: ["10 Users", "Recurring Invoices", "Payment Reminders", "Multi-currency"],
        buttonText: "Upgrade",
    },
    {
        id: "enterprise",
        name: "Enterprise",
        price: "Custom",
        description: "Scale without limits.",
        features: ["Unlimited Users", "API Access", "White-labeling", "24/7 Priority Support"],
        buttonText: "Contact Sales",
    },
];

function getTierFromPlan(plan) {
    const normalized = (plan || "free").toLowerCase();
    if (["starter", "professional", "enterprise"].includes(normalized)) return normalized;
    return "free";
}

export default function SubscriptionSettings() {
    const { user: authUser } = useAuth();
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await User.me();
                if (!cancelled) setUserData(data);
            } catch (e) {
                if (!cancelled) setUserData(authUser || null);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [authUser?.id]);

    const currentPlanId = getTierFromPlan(userData?.subscription_plan || userData?.plan || authUser?.plan);
    const currentTier = TIERS.find((t) => t.id === currentPlanId) || TIERS[0];

    const handleManageBilling = () => {
        window.open(BILLING_PORTAL_URL, "_blank", "noopener,noreferrer");
    };

    const handleContactSales = () => {
        window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer");
    };

    const handleTierAction = (tier) => {
        if (tier.id === "enterprise") {
            handleContactSales();
        } else if (tier.id !== currentPlanId) {
            handleManageBilling();
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-10">
                <Skeleton className="h-32 rounded-3xl" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-80 rounded-[32px]" />
                    ))}
                </div>
                <Skeleton className="h-48 rounded-[32px]" />
            </div>
        );
    }

    return (
        <div className="space-y-10">
            {/* 1. Active Plan Header — Manage Billing at top */}
            <div className="bg-gradient-to-r from-orange-50 to-transparent dark:from-orange-950/30 dark:to-transparent border border-orange-100 dark:border-orange-900/50 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4">
                    <div className="bg-orange-500 p-3 rounded-2xl">
                        <Star className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest">Active Plan</p>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">{currentTier.name} Tier</h2>
                    </div>
                </div>
                <Button
                    onClick={handleManageBilling}
                    variant="outline"
                    className="px-8 py-3 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-700 dark:text-slate-300 hover:shadow-md transition-all"
                >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Manage Billing & Invoices
                </Button>
            </div>

            {/* 2. Plan Selection Grid */}
            <div>
                <div className="mb-8">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Change your plan</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Select the plan that best fits your current team size.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {TIERS.map((tier) => {
                        const isCurrent = tier.id === currentPlanId;
                        return (
                            <div
                                key={tier.id}
                                className={`relative p-6 rounded-[32px] border-2 flex flex-col transition-all ${
                                    isCurrent
                                        ? "border-orange-500 bg-white dark:bg-slate-900 shadow-xl shadow-orange-100 dark:shadow-orange-900/20 ring-4 ring-orange-50 dark:ring-orange-900/30"
                                        : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:hover:border-slate-700"
                                }`}
                            >
                                {isCurrent && (
                                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-widest">
                                        Current
                                    </span>
                                )}

                                <div className="mb-8">
                                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">{tier.name}</h4>
                                    <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
                                        {tier.price}
                                        {tier.price !== "Custom" && <span className="text-sm font-normal text-slate-400 ml-1">/mo</span>}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{tier.description}</p>
                                </div>

                                <ul className="flex-1 space-y-4 mb-8">
                                    {tier.features.map((feature) => (
                                        <li key={feature} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 font-medium">
                                            <Check className="w-4 h-4 text-orange-500 shrink-0" />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>

                                {tier.id === "starter" && !isCurrent ? (
                                    <PayFastSubscriptionForm
                                        amountZar="199.00"
                                        planName="Paidly Pro Monthly"
                                        className="mt-0"
                                    />
                                ) : (
                                    <Button
                                        onClick={() => handleTierAction(tier)}
                                        disabled={isCurrent}
                                        className={`w-full py-4 rounded-2xl font-bold transition-all ${
                                            isCurrent
                                                ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-default"
                                                : "bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-100 dark:shadow-orange-900/30 active:scale-[0.98]"
                                        }`}
                                    >
                                        {tier.buttonText}
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 3. Enterprise Contact Card */}
            <div className="bg-slate-900 dark:bg-slate-950 rounded-[32px] p-8 md:p-10 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-10">
                    <Globe className="w-40 h-40 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Need a custom solution?</h3>
                <p className="text-slate-400 mb-8 max-w-md mx-auto">
                    Enterprise plans offer unlimited users and custom features. Contact sales for a personalized quote.
                </p>
                <Button
                    onClick={handleContactSales}
                    className="px-10 py-4 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-2xl transition-all"
                >
                    <Rocket className="w-4 h-4 mr-2" />
                    Speak to our Sales Team
                </Button>
            </div>
        </div>
    );
}
