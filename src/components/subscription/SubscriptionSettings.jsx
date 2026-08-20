import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Star, Rocket, Globe, ChevronRight } from "lucide-react";
import PayFastSubscriptionForm from "@/components/subscription/PayFastSubscriptionForm";
import DashboardSubscriptionBanner from "@/components/dashboard/DashboardSubscriptionBanner";
import { useCurrentSubscriptionQuery } from "@/hooks/useCurrentSubscriptionQuery";
import { createPageUrl, getBillingPortalUrl } from "@/utils";
import { describeSubscriptionState, normalizePaidPackageKey } from "@/lib/subscriptionPlan";
import { describeDashboardSubscriptionBanner } from "../../../shared/subscriptionDashboardCopy.js";

const CONTACT_SALES_EMAIL = (
  import.meta.env.VITE_CONTACT_SALES_EMAIL ||
  import.meta.env.VITE_SUPPORT_EMAIL ||
  "support@paidly.co.za"
).trim();

const TIERS = [
    {
        id: "starter_monthly",
        name: "Starter",
        price: "R 50",
        normalPrice: "R 50",
        savingsLabel: "Annual: R 500 (2 months free)",
        description: "Freelancers & individuals.",
        features: [
            "Unlimited quotes & invoices",
            "Client management",
            "Basic reporting",
            "Email invoices",
            "1 user",
            "Basic support",
        ],
        buttonText: "Choose Plan",
        recommended: false,
    },
    {
        id: "business_monthly",
        name: "Business",
        price: "R 150",
        normalPrice: "R 150",
        savingsLabel: "Annual: R 1,500 (2 months free)",
        description: "SMEs that need inventory, payroll docs, and team seats.",
        features: [
            "Everything in Starter",
            "Up to 5 users",
            "Inventory, expenses & purchase orders",
            "Payslips & VAT reports",
            "Recurring invoices",
            "Priority support",
        ],
        buttonText: "Choose Plan",
        recommended: true,
    },
    {
        id: "growth_monthly",
        name: "Growth",
        price: "R 350",
        normalPrice: "R 350",
        savingsLabel: "Annual: R 3,500 (2 months free)",
        description: "Growing businesses — unlimited team and integrations.",
        features: [
            "Everything in Business",
            "Unlimited team members",
            "Departments & approval workflows",
            "Advanced reports & API access",
            "Integrations & multi-company",
            "Affiliate system",
        ],
        buttonText: "Choose Plan",
        recommended: false,
    },
];

export default function SubscriptionSettings() {
    const navigate = useNavigate();
    const { user: authUser } = useAuth();
    const { profile: profileFromQuery, refetch: refetchProfile } = useUserProfileQuery();
    const { data: billingStatus, refetch: refetchBilling } = useCurrentSubscriptionQuery();
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        void refetchProfile();
        void refetchBilling();
    }, [refetchProfile, refetchBilling]);

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === "visible") {
                void refetchProfile();
                void refetchBilling();
            }
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [refetchProfile, refetchBilling]);

    useEffect(() => {
        setIsLoading(false);
    }, [
        authUser?.id,
        authUser?.subscription_plan,
        authUser?.plan,
        profileFromQuery?.id,
    ]);

    const billingProfile = useMemo(
        () => ({
            ...(authUser || {}),
            ...(profileFromQuery || {}),
        }),
        [authUser, profileFromQuery]
    );

    const accountState = describeSubscriptionState(billingProfile);
    const bannerCopy = describeDashboardSubscriptionBanner(billingStatus || billingProfile);
    const showActivePlanHeader =
        bannerCopy.kind === "active" || bannerCopy.kind === "admin_granted" || bannerCopy.kind === "past_due";
    const currentPlanId = normalizePaidPackageKey(billingProfile);

    const handleContactSales = () => {
        window.location.href = `mailto:${CONTACT_SALES_EMAIL}`;
    };

    const handleTierAction = (tier) => {
        if (tier.id !== currentPlanId) {
            navigate(createPageUrl("BillingAndInvoices"));
        }
    };

    const externalBillingUrl = (() => {
        const url = (getBillingPortalUrl() || "").trim();
        if (!url || !/^https?:\/\//i.test(url)) return "";
        const origin = typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";
        if (origin && url.replace(/\/$/, "") === origin) return "";
        return url;
    })();

    if (isLoading) {
        return (
            <div className="space-y-10">
                <Skeleton className="h-32 rounded-3xl" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-80 rounded-[32px]" />
                    ))}
                </div>
                <Skeleton className="h-48 rounded-[32px]" />
            </div>
        );
    }

    return (
        <div className="space-y-10">
            <DashboardSubscriptionBanner
                serverStatus={billingStatus || null}
                profileFallback={billingProfile}
                className="mb-0"
            />

            {showActivePlanHeader ? (
            <div className="bg-gradient-to-r from-orange-50 to-transparent dark:from-orange-950/30 dark:to-transparent border border-orange-100 dark:border-orange-900/50 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4">
                    <div className="bg-orange-500 p-3 rounded-2xl">
                        <Star className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest">Active Plan</p>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">
                            {accountState.packageLabel}
                            {accountState.packageLabel !== "Free" ? " Tier" : ""}
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {accountState.statusLabel}
                            {accountState.rawSlug && accountState.rawSlug !== accountState.packageKey ? (
                                <span className="text-slate-400 dark:text-slate-500"> · Plan: {accountState.rawSlug}</span>
                            ) : null}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                    <Button
                        asChild
                        variant="outline"
                        className="px-8 py-3 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-700 dark:text-slate-300 hover:shadow-md transition-all"
                    >
                        <Link to={createPageUrl("BillingAndInvoices")} className="inline-flex items-center justify-center">
                            <ChevronRight className="w-4 h-4 mr-2 shrink-0" aria-hidden />
                            Manage Billing &amp; Invoices
                        </Link>
                    </Button>
                    {externalBillingUrl ? (
                        <Button
                            type="button"
                            variant="ghost"
                            className="rounded-2xl font-semibold text-slate-600 dark:text-slate-400"
                            onClick={() => window.open(externalBillingUrl, "_blank", "noopener,noreferrer")}
                        >
                            External billing portal
                        </Button>
                    ) : null}
                </div>
            </div>
            ) : null}

            {/* 2. Plan Selection Grid */}
            <div>
                <div className="mb-8">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Change your plan</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Select the plan that best fits your current team size.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {TIERS.map((tier) => {
                        const isCurrent = tier.id === currentPlanId;
                        return (
                            <div
                                key={tier.id}
                                className={`relative p-6 rounded-[32px] border-2 flex flex-col transition-all ${
                                    tier.recommended
                                        ? "border-primary shadow-xl shadow-primary/10 ring-2 ring-primary/20"
                                        : isCurrent
                                        ? "border-orange-500 bg-white dark:bg-slate-900 shadow-xl shadow-orange-100 dark:shadow-orange-900/20 ring-4 ring-orange-50 dark:ring-orange-900/30"
                                        : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:hover:border-slate-700"
                                }`}
                            >
                                {tier.recommended && (
                                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                                        <Star className="w-3 h-3" />
                                        Recommended
                                    </span>
                                )}
                                {isCurrent && !tier.recommended && (
                                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-widest">
                                        Current
                                    </span>
                                )}

                                <div className="mb-8">
                                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">{tier.name}</h4>
                                    <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
                                        {tier.price}
                                        <span className="text-sm font-normal text-slate-400 ml-1">/ month</span>
                                    </p>
                                    {tier.normalPrice && tier.savingsLabel && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                            Normally {tier.normalPrice}/mo — {tier.savingsLabel}
                                        </p>
                                    )}
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

                                {!isCurrent &&
                                (tier.id === "starter_monthly" ||
                                  tier.id === "business_monthly" ||
                                  tier.id === "growth_monthly") ? (
                                    <PayFastSubscriptionForm
                                        planSlug={tier.id}
                                        planName={tier.name}
                                        itemDescription={tier.description}
                                        ctaLabel={`Continue — ${tier.name}`}
                                        submitVariant="image"
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
                                        {isCurrent ? "Current Plan" : tier.buttonText}
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 3. Corporate / Contact Card */}
            <div className="bg-slate-900 dark:bg-slate-950 rounded-[32px] p-8 md:p-10 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-10">
                    <Globe className="w-40 h-40 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Need a custom solution?</h3>
                <p className="text-slate-400 mb-8 max-w-md mx-auto">
                    Enterprise plans offer custom contracts, SSO, and dedicated support. Contact sales for a personalized quote.
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
