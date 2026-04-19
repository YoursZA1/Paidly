import { lazy, Suspense } from "react";
import Layout from "./Layout.jsx";

/**
 * Lazy load all page components so the initial bundle only loads the current route.
 * Each page is loaded on demand when the user navigates (major performance gain).
 * Suspense shows this fallback while the chunk loads.
 */
const RouteFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center" aria-label="Loading page">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const Dashboard = lazy(() => import("./Dashboard"));
const Login = lazy(() => import("./Login"));
const Signup = lazy(() => import("./Signup"));
const Home = lazy(() => import("./Home"));
const CreateInvoice = lazy(() => import("./CreateInvoice"));
const CreateDocument = lazy(() => import("./CreateDocument"));
const Documents = lazy(() => import("./Documents"));
const DocumentDetail = lazy(() => import("./DocumentDetail"));
const ViewDocument = lazy(() => import("./ViewDocument"));
const Clients = lazy(() => import("./Clients"));
const Invoices = lazy(() => import("./Invoices"));
const InvoicePDF = lazy(() => import("./InvoicePDF"));
const Settings = lazy(() => import("./Settings"));
const BillingAndInvoices = lazy(() => import("./BillingAndInvoices"));
const Notes = lazy(() => import("./Notes"));
const Services = lazy(() => import("./Services"));
const ViewInvoice = lazy(() => import("./ViewInvoice"));
const PublicInvoice = lazy(() => import("./PublicInvoice"));
const InvoiceView = lazy(() => import("./InvoiceView"));
const EditInvoice = lazy(() => import("./EditInvoice"));
const Quotes = lazy(() => import("./Quotes"));
const CreateQuote = lazy(() => import("./CreateQuote"));
const ViewQuote = lazy(() => import("./ViewQuote"));
const EditQuote = lazy(() => import("./EditQuote"));
const QuotePDF = lazy(() => import("./QuotePDF"));
const PublicQuote = lazy(() => import("./PublicQuote"));
const ClientPortal = lazy(() => import("./ClientPortal"));
const RecurringInvoices = lazy(() => import("./RecurringInvoices"));
const CreateRecurringInvoice = lazy(() => import("./CreateRecurringInvoice"));
const Reports = lazy(() => import("./Reports"));
const Payslips = lazy(() => import("./Payslips"));
const CreatePayslip = lazy(() => import("./CreatePayslip"));
const EditPayslip = lazy(() => import("./EditPayslip"));
const PayslipPDF = lazy(() => import("./PayslipPDF"));
const ViewPayslip = lazy(() => import("./ViewPayslip"));
const PublicPayslip = lazy(() => import("./PublicPayslip"));
const ReportPDF = lazy(() => import("./ReportPDF"));
const CashFlow = lazy(() => import("./CashFlow"));
const CashFlowPDF = lazy(() => import("./CashFlowPDF"));
const Calendar = lazy(() => import("./Calendar"));
const Messages = lazy(() => import("./Messages"));
const ClientDetail = lazy(() => import("./ClientDetail"));
const EditClient = lazy(() => import("./EditClient"));
const EditCatalogItem = lazy(() => import("./EditCatalogItem"));
const QuoteTemplates = lazy(() => import("./QuoteTemplates"));
const Vendors = lazy(() => import("./Vendors"));
const Budgets = lazy(() => import("./Budgets"));
const Accounting = lazy(() => import("./Accounting"));
const AdminV2Dashboard = lazy(() => import("./AdminV2Dashboard"));
const UsersPage = lazy(() => import("./UsersPage"));
const AdminPlatformMessages = lazy(() => import("./AdminPlatformMessages"));
const SubscriptionsPage = lazy(() => import("./SubscriptionsPage"));
const AffiliatesPage = lazy(() => import("./AffiliatesPage"));
const WaitlistPage = lazy(() => import("./WaitlistPage"));
const SettingsPage = lazy(() => import("./SettingsPage"));
const AuditLogPage = lazy(() => import("./AuditLogPage"));
const ForgotPassword = lazy(() => import("./ForgotPassword"));
const ResetPassword = lazy(() => import("./ResetPassword"));
const AcceptInvite = lazy(() => import("./AcceptInvite"));
const About = lazy(() => import("./About"));
const PrivacyPolicy = lazy(() => import("./PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("./TermsAndConditions"));
const BentoDemoPage = lazy(() => import("./BentoDemo"));
const AnimatedIconsDemoPage = lazy(() => import("./AnimatedIconsDemo"));
const AffiliateLanding = lazy(() => import("./AffiliateLanding"));
const AffiliateApply = lazy(() => import("./AffiliateApply"));
const AffiliateDashboard = lazy(() => import("./AffiliateDashboard"));
const PayfastReturn = lazy(() => import("./PayfastReturn"));
const PayfastCancel = lazy(() => import("./PayfastCancel"));
const AdminLayout = lazy(() => import("@/components/layout/AdminLayout"));
const NotFoundPage = lazy(() =>
  import("./ApplicationErrorPage").then((m) => ({ default: m.NotFoundPage }))
);

import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import RequireAuth from "@/components/auth/RequireAuth";
import AuthProtectedRouteInvariant from "@/components/auth/AuthProtectedRouteInvariant";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUserId } from "@/lib/authUserId";
import { isSupabaseConfigured } from "@/lib/supabaseClient";


// --- Auth & Public Pages ---
// /Auth and /Auth.html allow sign-in from the marketing site (paidly.co.za/Auth.html) using the same Supabase DB; post-login redirect to app when VITE_APP_URL is set.
const AUTH_ROUTES = [
    { path: "/Home", element: <Home /> },
    { path: "/home", element: <Home /> },
    { path: "/Auth", element: <Login /> },
    { path: "/Auth.html", element: <Login /> },
    { path: "/Login", element: <Login /> },
    { path: "/login", element: <Login /> },
    { path: "/Signup", element: <Signup /> },
    { path: "/signup", element: <Signup /> },
    { path: "/ForgotPassword", element: <ForgotPassword /> },
    { path: "/ResetPassword", element: <ResetPassword /> },
    { path: "/AcceptInvite", element: <AcceptInvite /> },
    { path: "/PublicInvoice", element: <PublicInvoice /> },
    { path: "/view/:token", element: <InvoiceView /> },
    /** Guest-safe PDF + download; uses ?token= (public API) or ?id= when logged in */
    { path: "/InvoicePDF", element: <InvoicePDF /> },
    { path: "/PublicQuote", element: <PublicQuote /> },
    { path: "/PublicPayslip", element: <PublicPayslip /> },
    { path: "/ClientPortal", element: <ClientPortal /> },
    { path: "/PrivacyPolicy", element: <PrivacyPolicy /> },
    { path: "/privacy-policy", element: <PrivacyPolicy /> },
    { path: "/TermsAndConditions", element: <TermsAndConditions /> },
    { path: "/terms-and-conditions", element: <TermsAndConditions /> },
    { path: "/terms", element: <TermsAndConditions /> },
    { path: "/affiliate", element: <AffiliateLanding /> },
    { path: "/Affiliate", element: <AffiliateLanding /> },
    { path: "/affiliate/apply", element: <AffiliateApply /> },
    { path: "/Affiliate/apply", element: <AffiliateApply /> },
    { path: "/return", element: <PayfastReturn /> },
    { path: "/success", element: <PayfastReturn /> },
    { path: "/cancel", element: <PayfastCancel /> },
];

// --- Main App Pages ---
const MAIN_ROUTES = [
    { path: "/", element: <Home /> },
    { path: "/Dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
    { path: "/dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
    { path: "/Clients", element: <RequireAuth><Clients /></RequireAuth> },
    { path: "/clients", element: <RequireAuth><Clients /></RequireAuth> },
    { path: "/Settings", element: <RequireAuth><Settings /></RequireAuth> },
    { path: "/settings", element: <RequireAuth><Settings /></RequireAuth> },
    { path: "/BillingAndInvoices", element: <RequireAuth><BillingAndInvoices /></RequireAuth> },
    { path: "/billingandinvoices", element: <RequireAuth><BillingAndInvoices /></RequireAuth> },
    { path: "/Notes", element: <RequireAuth><Notes /></RequireAuth> },
    { path: "/notes", element: <RequireAuth><Notes /></RequireAuth> },
    { path: "/Services", element: <RequireAuth><Services /></RequireAuth> },
    { path: "/services", element: <RequireAuth><Services /></RequireAuth> },
    { path: "/Calendar", element: <RequireAuth><Calendar /></RequireAuth> },
    { path: "/Messages", element: <RequireAuth><Messages /></RequireAuth> },
    { path: "/Budgets", element: <RequireAuth><Budgets /></RequireAuth> },
    { path: "/Accounting", element: <RequireAuth><Accounting /></RequireAuth> },
    { path: "/ClientDetail", element: <RequireAuth><ClientDetail /></RequireAuth> },
    { path: "/EditClient", element: <RequireAuth><EditClient /></RequireAuth> },
    { path: "/editclient", element: <RequireAuth><EditClient /></RequireAuth> },
    { path: "/EditCatalogItem", element: <RequireAuth><EditCatalogItem /></RequireAuth> },
    { path: "/editcatalogitem", element: <RequireAuth><EditCatalogItem /></RequireAuth> },
    { path: "/Vendors", element: <RequireAuth roles={["admin"]}><Vendors /></RequireAuth> },
    { path: "/About", element: <RequireAuth><About /></RequireAuth> },
    { path: "/about", element: <RequireAuth><About /></RequireAuth> },
    { path: "/PrivacyPolicy", element: <RequireAuth><PrivacyPolicy /></RequireAuth> },
    { path: "/privacy-policy", element: <RequireAuth><PrivacyPolicy /></RequireAuth> },
    { path: "/TermsAndConditions", element: <RequireAuth><TermsAndConditions /></RequireAuth> },
    { path: "/terms-and-conditions", element: <RequireAuth><TermsAndConditions /></RequireAuth> },
    { path: "/BentoDemo", element: <RequireAuth><BentoDemoPage /></RequireAuth> },
    { path: "/bento-demo", element: <RequireAuth><BentoDemoPage /></RequireAuth> },
    { path: "/AnimatedIconsDemo", element: <RequireAuth><AnimatedIconsDemoPage /></RequireAuth> },
    { path: "/animated-icons-demo", element: <RequireAuth><AnimatedIconsDemoPage /></RequireAuth> },
    { path: "/dashboard/affiliate", element: <RequireAuth><AffiliateDashboard /></RequireAuth> },
];

// --- Invoice Pages ---
const INVOICE_ROUTES = [
    { path: "/Invoices", element: <RequireAuth><Invoices /></RequireAuth> },
    { path: "/invoices", element: <RequireAuth><Invoices /></RequireAuth> },
    { path: "/CreateInvoice", element: <RequireAuth><CreateInvoice /></RequireAuth> },
    { path: "/createinvoice", element: <RequireAuth><CreateInvoice /></RequireAuth> },
    { path: "/CreateDocument", element: <RequireAuth><Navigate to="/CreateDocument/invoice" replace /></RequireAuth> },
    { path: "/CreateDocument/:type", element: <RequireAuth><CreateDocument /></RequireAuth> },
    { path: "/createdocument", element: <RequireAuth><Navigate to="/CreateDocument/invoice" replace /></RequireAuth> },
    { path: "/createdocument/:type", element: <RequireAuth><CreateDocument /></RequireAuth> },
    { path: "/ViewDocument/:docType/:id", element: <RequireAuth><ViewDocument /></RequireAuth> },
    { path: "/viewdocument/:docType/:id", element: <RequireAuth><ViewDocument /></RequireAuth> },
    { path: "/Documents/:documentId", element: <RequireAuth><DocumentDetail /></RequireAuth> },
    { path: "/documents/:documentId", element: <RequireAuth><DocumentDetail /></RequireAuth> },
    { path: "/Documents", element: <RequireAuth><Documents /></RequireAuth> },
    { path: "/documents", element: <RequireAuth><Documents /></RequireAuth> },
    { path: "/ViewInvoice", element: <RequireAuth><ViewInvoice /></RequireAuth> },
    { path: "/EditInvoice", element: <RequireAuth><EditInvoice /></RequireAuth> },
    { path: "/RecurringInvoices", element: <RequireAuth><RecurringInvoices /></RequireAuth> },
    { path: "/CreateRecurringInvoice", element: <RequireAuth><CreateRecurringInvoice /></RequireAuth> },
];

// --- Quote Pages ---
const QUOTE_ROUTES = [
    { path: "/Quotes", element: <RequireAuth><Quotes /></RequireAuth> },
    { path: "/quotes", element: <RequireAuth><Quotes /></RequireAuth> },
    { path: "/CreateQuote", element: <RequireAuth><CreateQuote /></RequireAuth> },
    { path: "/ViewQuote", element: <RequireAuth><ViewQuote /></RequireAuth> },
    { path: "/EditQuote", element: <RequireAuth><EditQuote /></RequireAuth> },
    { path: "/QuotePDF", element: <RequireAuth><QuotePDF /></RequireAuth> },
    { path: "/QuoteTemplates", element: <RequireAuth><QuoteTemplates /></RequireAuth> },
];

// --- Payslip & Report Pages ---
const PAYSLIP_REPORT_ROUTES = [
    { path: "/Payslips", element: <RequireAuth><Payslips /></RequireAuth> },
    { path: "/CreatePayslip", element: <RequireAuth><CreatePayslip /></RequireAuth> },
    { path: "/EditPayslip", element: <RequireAuth><EditPayslip /></RequireAuth> },
    { path: "/PayslipPDF", element: <RequireAuth><PayslipPDF /></RequireAuth> },
    { path: "/ViewPayslip", element: <RequireAuth><ViewPayslip /></RequireAuth> },
    { path: "/ReportPDF", element: <RequireAuth><ReportPDF /></RequireAuth> },
    { path: "/reportpdf", element: <RequireAuth><ReportPDF /></RequireAuth> },
    { path: "/Reports", element: <RequireAuth><Reports /></RequireAuth> },
    { path: "/CashFlow", element: <RequireAuth><CashFlow /></RequireAuth> },
    { path: "/CashFlowPDF", element: <RequireAuth><CashFlowPDF /></RequireAuth> },
    // Lowercase aliases for nav/bookmarks
    { path: "/reports", element: <RequireAuth><Reports /></RequireAuth> },
    { path: "/cashflow", element: <RequireAuth><CashFlow /></RequireAuth> },
];

// --- Admin & Support Pages ---
const ADMIN_ROUTES = [
    { path: "/AdminFinancials", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/AdminBusinesses", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/TaskSettings", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/UserManagement", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/UserAccessControl", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/AdminControl", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/AdminDashboard", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/dashboard", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/LogsAuditTrail", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/ExcelDataCapture", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/SubscriptionsManagement", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/DocumentActivity", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/AdminUsers", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/AdminAffiliates", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/affiliates" replace /></RequireAuth> },
    { path: "/AdminAccounts", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/AdminDocumentOversight", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/AdminSubscriptions", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/AdminPlans", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/PlatformSettings", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/SupportAdminTools", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/SecurityCompliance", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/AdminRolesManagement", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    // --- Admin Nested Routes ---
    { path: "/admin", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/users", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/admin/admin-control", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/access-control", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/logs-audit-trail", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/excel-data-capture", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/subscriptions", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/admin/plans-management", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/admin/subscriptions-management", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/admin/document-activity", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/user-management", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/admin/affiliates", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/affiliates" replace /></RequireAuth> },
    { path: "/admin/accounts-management", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/admin/document-oversight", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/platform-settings", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/support-tools", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/support-admin-tools", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/security-compliance", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/roles-management", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/system-status", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/background-jobs", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/BuildLogs", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/build-logs", element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    {
        path: "/admin/transactions",
        element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth>,
        label: "Transactions",
        showInNav: true,
        admin: true,
    },
    {
        path: "/admin/payouts",
        element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/affiliates" replace /></RequireAuth>,
        label: "Payouts",
        showInNav: true,
        admin: true,
    },
    {
        path: "/admin/fees",
        element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth>,
        label: "Fees",
        showInNav: true,
        admin: true,
    },
    {
        path: "/admin/billing",
        element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth>,
        label: "Billing",
        showInNav: true,
        admin: true,
    },
    {
        path: "/admin/invoices-quotes",
        element: <RequireAuth roles={["admin"]}><Navigate to="/admin-v2" replace /></RequireAuth>,
        label: "Invoices & Quotes",
        showInNav: true,
        admin: true,
    },
    {
        path: "/admin-v2",
        element: <RequireAuth roles={["admin", "management", "sales", "support"]}><AdminLayout><AdminV2Dashboard /></AdminLayout></RequireAuth>,
    },
    {
        path: "/admin-v2/users",
        element: <RequireAuth roles={["admin", "management", "sales", "support"]}><AdminLayout><UsersPage /></AdminLayout></RequireAuth>,
    },
    {
        path: "/admin-v2/messages",
        element: <RequireAuth roles={["admin", "management", "sales", "support"]}><AdminLayout><AdminPlatformMessages /></AdminLayout></RequireAuth>,
    },
    {
        path: "/admin-v2/subscriptions",
        element: <RequireAuth roles={["admin", "management", "sales"]}><AdminLayout><SubscriptionsPage /></AdminLayout></RequireAuth>,
    },
    {
        path: "/admin-v2/affiliates",
        element: <RequireAuth roles={["admin", "management", "support"]}><AdminLayout><AffiliatesPage /></AdminLayout></RequireAuth>,
    },
    {
        path: "/admin-v2/waitlist",
        element: <RequireAuth roles={["admin", "management", "sales", "support"]}><AdminLayout><WaitlistPage /></AdminLayout></RequireAuth>,
    },
    {
        path: "/admin-v2/settings",
        element: <RequireAuth roles={["admin", "management"]}><AdminLayout><SettingsPage /></AdminLayout></RequireAuth>,
    },
    {
        path: "/admin-v2/audit-log",
        element: <RequireAuth roles={["admin", "management"]}><AdminLayout><AuditLogPage /></AdminLayout></RequireAuth>,
    },
];




import { useLocation, Navigate } from "react-router-dom";

function getPageName(pathname) {
  // Remove leading slash and query params
  const clean = pathname.replace(/^\//, "").split("?")[0];
  // Capitalize first letter
  return clean.charAt(0).toUpperCase() + clean.slice(1) || "Dashboard";
}

const PUBLIC_LAYOUT_BYPASS_PATTERNS = [
    /^\/$/i,
    /^\/home$/i,
    /^\/auth/i,
    /^\/login$/i,
    /^\/signup$/i,
    /^\/forgotpassword$/i,
    /^\/resetpassword$/i,
    /^\/acceptinvite$/i,
    /^\/publicinvoice$/i,
    /^\/publicquote$/i,
    /^\/publicpayslip$/i,
    /^\/view\//i,
    /^\/clientportal$/i,
    /^\/invoicepdf$/i,
    /^\/privacy-policy$/i,
    /^\/privacypolicy$/i,
    /^\/terms/i,
    /^\/affiliate(\/|$)/i,
    /^\/return$/i,
    /^\/success$/i,
    /^\/cancel$/i,
];

function shouldBypassAppLayout(pathname) {
    const p = pathname || "";
    return PUBLIC_LAYOUT_BYPASS_PATTERNS.some((re) => re.test(p));
}

function PagesContent() {
    const location = useLocation();
    const { loading, user } = useAuth();
    const authUserId = getAuthUserId(user);
    const needsAppShell = !shouldBypassAppLayout(location.pathname);

    // Avoid mounting the main shell (nav, store hydration) until session bootstrap knows if there is a user.
    if (needsAppShell && loading && !authUserId) {
        return <AuthBootstrapShell />;
    }

    const currentPageName = getPageName(location.pathname);
    const routes = (
        <Suspense fallback={<RouteFallback />}>
        <Routes>
            {/* Auth & Public */}
            {AUTH_ROUTES.map((route, i) => <Route key={"auth-"+i} {...route} />)}
            {/* Main App */}
            {MAIN_ROUTES.map((route, i) => <Route key={"main-"+i} {...route} />)}
            {/* Invoices */}
            {INVOICE_ROUTES.map((route, i) => <Route key={"inv-"+i} {...route} />)}
            {/* Quotes */}
            {QUOTE_ROUTES.map((route, i) => <Route key={"quote-"+i} {...route} />)}
            {/* Payslips & Reports */}
            {PAYSLIP_REPORT_ROUTES.map((route, i) => <Route key={"pay-"+i} {...route} />)}
            {/* Admin & Support */}
            {ADMIN_ROUTES.map((route, i) => <Route key={"admin-"+i} {...route} />)}
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
    );

    const content = (
        <>
            <AuthProtectedRouteInvariant />
            {routes}
        </>
    );

    if (shouldBypassAppLayout(location.pathname)) {
        return content;
    }

    return (
        <Layout currentPageName={currentPageName}>
            {content}
        </Layout>
    );
}

function SupabaseSetupRequired() {
    const isVercel = typeof window !== "undefined" && /\.vercel\.app$/i.test(window.location?.hostname || "");

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
            <div className="max-w-lg text-center">
                <h1 className="text-xl font-semibold text-slate-800 mb-2">Supabase not configured</h1>
                <p className="text-sm text-slate-600 mb-4">
                    The app needs Supabase to run. Add your project URL and anon key to environment variables.
                </p>
                {isVercel ? (
                    <>
                        <p className="text-left text-sm text-slate-600 mb-2 font-medium">Deployed on Vercel:</p>
                        <ol className="text-left text-sm text-slate-600 list-decimal list-inside space-y-2 mb-4">
                            <li>Open your project on <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary underline">Vercel Dashboard</a>.</li>
                            <li>Go to <strong>Settings → Environment Variables</strong>.</li>
                            <li>Add <code className="bg-slate-200 px-1 rounded">VITE_SUPABASE_URL</code> (your Supabase project URL, e.g. <code className="bg-slate-200 px-1 rounded text-xs">https://xxxx.supabase.co</code>).</li>
                            <li>Add <code className="bg-slate-200 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> (your Supabase anon/public key from Project → Settings → API).</li>
                            <li>Redeploy the project (Deployments → ⋮ → Redeploy) so the new variables are used at build time.</li>
                        </ol>
                    </>
                ) : (
                    <ol className="text-left text-sm text-slate-600 list-decimal list-inside space-y-2 mb-4">
                        <li>Copy <code className="bg-slate-200 px-1 rounded">.env.development.example</code> to <code className="bg-slate-200 px-1 rounded">.env.development</code> (or <code className="bg-slate-200 px-1 rounded">.env</code>).</li>
                        <li>Set <code className="bg-slate-200 px-1 rounded">VITE_SUPABASE_URL</code> and <code className="bg-slate-200 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> with your Supabase project values.</li>
                        <li>Restart the dev server (<code className="bg-slate-200 px-1 rounded">npm run dev</code>).</li>
                    </ol>
                )}
                <p className="text-xs text-slate-500">See <code className="bg-slate-200 px-1 rounded">docs/SUPABASE_SETUP_AND_MAINTENANCE.md</code> for details.</p>
            </div>
        </div>
    );
}

export default function Pages() {
    if (!isSupabaseConfigured) {
        return <SupabaseSetupRequired />;
    }
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}