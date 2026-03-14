import React, { lazy, Suspense } from "react";
import Layout from "./Layout.jsx";

const RouteFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center" aria-label="Loading">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const AdminFinancials = lazy(() => import("./AdminFinancials"));
const AdminBusinesses = lazy(() => import("./AdminBusinesses"));
const Dashboard = lazy(() => import("./Dashboard"));
const Login = lazy(() => import("./Login"));
const Signup = lazy(() => import("./Signup"));
const CreateInvoice = lazy(() => import("./CreateInvoice"));
const Clients = lazy(() => import("./Clients"));
const Invoices = lazy(() => import("./Invoices"));
const InvoicePDF = lazy(() => import("./InvoicePDF"));
const Settings = lazy(() => import("./Settings"));
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
const TaskSettings = lazy(() => import("./TaskSettings"));
const ClientDetail = lazy(() => import("./ClientDetail"));
const QuoteTemplates = lazy(() => import("./QuoteTemplates"));
const Vendors = lazy(() => import("./Vendors"));
const Budgets = lazy(() => import("./Budgets"));
const Accounting = lazy(() => import("./Accounting"));
const UserManagement = lazy(() => import("./UserManagement"));
const UserAccessControl = lazy(() => import("./UserAccessControl"));
const AdminControl = lazy(() => import("./AdminControl"));
const LogsAuditTrail = lazy(() => import("./LogsAuditTrail"));
const ExcelDataCapture = lazy(() => import("./ExcelDataCapture"));
const SubscriptionsManagement = lazy(() => import("./SubscriptionsManagement"));
const DocumentActivity = lazy(() => import("./DocumentActivity"));
const AdminUsers = lazy(() => import("./AdminUsers"));
const AdminAccounts = lazy(() => import("./AdminAccounts"));
const AdminDocumentOversight = lazy(() => import("./AdminDocumentOversight"));
const AdminSubscriptions = lazy(() => import("./AdminSubscriptions"));
const AdminPlans = lazy(() => import("./AdminPlans"));
const PlatformSettings = lazy(() => import("./PlatformSettings"));
const SupportAdminTools = lazy(() => import("./SupportAdminTools"));
const SecurityCompliance = lazy(() => import("./SecurityCompliance"));
const AdminRolesManagement = lazy(() => import("./AdminRolesManagement"));
const ForgotPassword = lazy(() => import("./ForgotPassword"));
const ResetPassword = lazy(() => import("./ResetPassword"));
const AcceptInvite = lazy(() => import("./AcceptInvite"));
const AdminTransactions = lazy(() => import("./AdminTransactions"));
const AdminPayouts = lazy(() => import("./AdminPayouts"));
const AdminFees = lazy(() => import("./AdminFees"));
const AdminBilling = lazy(() => import("./AdminBilling"));
const AdminInvoicesQuotes = lazy(() => import("./AdminInvoicesQuotes"));
const SystemStatus = lazy(() => import("./SystemStatus"));
const BackgroundJobs = lazy(() => import("./BackgroundJobs"));
const BuildLogs = lazy(() => import("./BuildLogs"));
const About = lazy(() => import("./About"));
const PrivacyPolicy = lazy(() => import("./PrivacyPolicy"));
const BentoDemoPage = lazy(() => import("./BentoDemo"));
const AnimatedIconsDemoPage = lazy(() => import("./AnimatedIconsDemo"));

import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthContext";
import RequireAuth from "@/components/auth/RequireAuth";
import { isSupabaseConfigured } from "@/lib/supabaseClient";


// --- Auth & Public Pages ---
const AUTH_ROUTES = [
    { path: "/Login", element: <Login /> },
    { path: "/login", element: <Login /> },
    { path: "/Signup", element: <Signup /> },
    { path: "/signup", element: <Signup /> },
    { path: "/ForgotPassword", element: <ForgotPassword /> },
    { path: "/ResetPassword", element: <ResetPassword /> },
    { path: "/AcceptInvite", element: <AcceptInvite /> },
    { path: "/PublicInvoice", element: <PublicInvoice /> },
    { path: "/view/:token", element: <InvoiceView /> },
    { path: "/PublicQuote", element: <PublicQuote /> },
    { path: "/PublicPayslip", element: <PublicPayslip /> },
    { path: "/ClientPortal", element: <ClientPortal /> },
];

// --- Main App Pages ---
const MAIN_ROUTES = [
    { path: "/", element: <RequireAuth><Dashboard /></RequireAuth> },
    { path: "/Dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
    { path: "/dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
    { path: "/Clients", element: <RequireAuth><Clients /></RequireAuth> },
    { path: "/clients", element: <RequireAuth><Clients /></RequireAuth> },
    { path: "/Settings", element: <RequireAuth><Settings /></RequireAuth> },
    { path: "/settings", element: <RequireAuth><Settings /></RequireAuth> },
    { path: "/Notes", element: <RequireAuth><Notes /></RequireAuth> },
    { path: "/notes", element: <RequireAuth><Notes /></RequireAuth> },
    { path: "/Services", element: <RequireAuth><Services /></RequireAuth> },
    { path: "/services", element: <RequireAuth><Services /></RequireAuth> },
    { path: "/Calendar", element: <RequireAuth><Calendar /></RequireAuth> },
    { path: "/Messages", element: <RequireAuth><Messages /></RequireAuth> },
    { path: "/Budgets", element: <RequireAuth><Budgets /></RequireAuth> },
    { path: "/Accounting", element: <RequireAuth><Accounting /></RequireAuth> },
    { path: "/ClientDetail", element: <RequireAuth><ClientDetail /></RequireAuth> },
    { path: "/Vendors", element: <RequireAuth roles={["admin"]}><Vendors /></RequireAuth> },
    { path: "/About", element: <RequireAuth><About /></RequireAuth> },
    { path: "/about", element: <RequireAuth><About /></RequireAuth> },
    { path: "/PrivacyPolicy", element: <RequireAuth><PrivacyPolicy /></RequireAuth> },
    { path: "/privacy-policy", element: <RequireAuth><PrivacyPolicy /></RequireAuth> },
    { path: "/BentoDemo", element: <RequireAuth><BentoDemoPage /></RequireAuth> },
    { path: "/bento-demo", element: <RequireAuth><BentoDemoPage /></RequireAuth> },
    { path: "/AnimatedIconsDemo", element: <RequireAuth><AnimatedIconsDemoPage /></RequireAuth> },
    { path: "/animated-icons-demo", element: <RequireAuth><AnimatedIconsDemoPage /></RequireAuth> },
];

// --- Invoice Pages ---
const INVOICE_ROUTES = [
    { path: "/Invoices", element: <RequireAuth><Invoices /></RequireAuth> },
    { path: "/invoices", element: <RequireAuth><Invoices /></RequireAuth> },
    { path: "/CreateInvoice", element: <RequireAuth><CreateInvoice /></RequireAuth> },
    { path: "/createinvoice", element: <RequireAuth><CreateInvoice /></RequireAuth> },
    { path: "/ViewInvoice", element: <RequireAuth><ViewInvoice /></RequireAuth> },
    { path: "/EditInvoice", element: <RequireAuth><EditInvoice /></RequireAuth> },
    { path: "/InvoicePDF", element: <RequireAuth><InvoicePDF /></RequireAuth> },
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
    { path: "/AdminFinancials", element: <RequireAuth roles={["admin"]}><AdminFinancials /></RequireAuth> },
    { path: "/AdminBusinesses", element: <RequireAuth roles={["admin"]}><AdminBusinesses /></RequireAuth> },
    { path: "/TaskSettings", element: <RequireAuth roles={["admin"]}><TaskSettings /></RequireAuth> },
    { path: "/UserManagement", element: <RequireAuth roles={["admin"]}><UserManagement /></RequireAuth> },
    { path: "/UserAccessControl", element: <RequireAuth roles={["admin"]}><UserAccessControl /></RequireAuth> },
    { path: "/AdminControl", element: <RequireAuth roles={["admin"]}><AdminControl /></RequireAuth> },
    { path: "/LogsAuditTrail", element: <RequireAuth roles={["admin"]}><LogsAuditTrail /></RequireAuth> },
    { path: "/ExcelDataCapture", element: <RequireAuth roles={["admin"]}><ExcelDataCapture /></RequireAuth> },
    { path: "/SubscriptionsManagement", element: <RequireAuth roles={["admin"]}><SubscriptionsManagement /></RequireAuth> },
    { path: "/DocumentActivity", element: <RequireAuth roles={["admin"]}><DocumentActivity /></RequireAuth> },
    { path: "/AdminUsers", element: <RequireAuth roles={["admin"]}><AdminUsers /></RequireAuth> },
    { path: "/AdminAccounts", element: <RequireAuth roles={["admin"]}><AdminAccounts /></RequireAuth> },
    { path: "/AdminDocumentOversight", element: <RequireAuth roles={["admin"]}><AdminDocumentOversight /></RequireAuth> },
    { path: "/AdminSubscriptions", element: <RequireAuth roles={["admin"]}><AdminSubscriptions /></RequireAuth> },
    { path: "/AdminPlans", element: <RequireAuth roles={["admin"]}><AdminPlans /></RequireAuth> },
    { path: "/PlatformSettings", element: <RequireAuth roles={["admin"]}><PlatformSettings /></RequireAuth> },
    { path: "/SupportAdminTools", element: <RequireAuth roles={["admin"]}><SupportAdminTools /></RequireAuth> },
    { path: "/SecurityCompliance", element: <RequireAuth roles={["admin"]}><SecurityCompliance /></RequireAuth> },
    { path: "/AdminRolesManagement", element: <RequireAuth roles={["admin"]}><AdminRolesManagement /></RequireAuth> },
    // --- Admin Nested Routes ---
    { path: "/admin", element: <RequireAuth roles={["admin"]}><AdminControl /></RequireAuth> },
    { path: "/admin/users", element: <RequireAuth roles={["admin"]}><UserManagement /></RequireAuth> },
    { path: "/admin/admin-control", element: <RequireAuth roles={["admin"]}><AdminControl /></RequireAuth> },
    { path: "/admin/access-control", element: <RequireAuth roles={["admin"]}><UserAccessControl /></RequireAuth> },
    { path: "/admin/logs-audit-trail", element: <RequireAuth roles={["admin"]}><LogsAuditTrail /></RequireAuth> },
    { path: "/admin/excel-data-capture", element: <RequireAuth roles={["admin"]}><ExcelDataCapture /></RequireAuth> },
    { path: "/admin/subscriptions", element: <RequireAuth roles={["admin"]}><AdminSubscriptions /></RequireAuth> },
    { path: "/admin/plans-management", element: <RequireAuth roles={["admin"]}><AdminPlans /></RequireAuth> },
    { path: "/admin/subscriptions-management", element: <RequireAuth roles={["admin"]}><SubscriptionsManagement /></RequireAuth> },
    { path: "/admin/document-activity", element: <RequireAuth roles={["admin"]}><DocumentActivity /></RequireAuth> },
    { path: "/admin/user-management", element: <RequireAuth roles={["admin"]}><AdminUsers /></RequireAuth> },
    { path: "/admin/accounts-management", element: <RequireAuth roles={["admin"]}><AdminAccounts /></RequireAuth> },
    { path: "/admin/document-oversight", element: <RequireAuth roles={["admin"]}><AdminDocumentOversight /></RequireAuth> },
    { path: "/admin/platform-settings", element: <RequireAuth roles={["admin"]}><PlatformSettings /></RequireAuth> },
    { path: "/admin/support-tools", element: <RequireAuth roles={["admin"]}><SupportAdminTools /></RequireAuth> },
    { path: "/admin/support-admin-tools", element: <RequireAuth roles={["admin"]}><SupportAdminTools /></RequireAuth> },
    { path: "/admin/security-compliance", element: <RequireAuth roles={["admin"]}><SecurityCompliance /></RequireAuth> },
    { path: "/admin/roles-management", element: <RequireAuth roles={["admin"]}><AdminRolesManagement /></RequireAuth> },
    { path: "/admin/system-status", element: <RequireAuth roles={["admin"]}><SystemStatus /></RequireAuth> },
    { path: "/admin/background-jobs", element: <RequireAuth roles={["admin"]}><BackgroundJobs /></RequireAuth> },
    { path: "/BuildLogs", element: <RequireAuth roles={["admin"]}><BuildLogs /></RequireAuth> },
    { path: "/admin/build-logs", element: <RequireAuth roles={["admin"]}><BuildLogs /></RequireAuth> },
    {
        path: "/admin/transactions",
        element: <AdminTransactions />,
        label: "Transactions",
        showInNav: true,
        admin: true,
    },
    {
        path: "/admin/payouts",
        element: <AdminPayouts />,
        label: "Payouts",
        showInNav: true,
        admin: true,
    },
    {
        path: "/admin/fees",
        element: <AdminFees />,
        label: "Fees",
        showInNav: true,
        admin: true,
    },
    {
        path: "/admin/billing",
        element: <AdminBilling />,
        label: "Billing",
        showInNav: true,
        admin: true,
    },
    {
        path: "/admin/invoices-quotes",
        element: <AdminInvoicesQuotes />,
        label: "Invoices & Quotes",
        showInNav: true,
        admin: true,
    },
];




import { useLocation } from "react-router-dom";

function getPageName(pathname) {
  // Remove leading slash and query params
  const clean = pathname.replace(/^\//, "").split("?")[0];
  // Capitalize first letter
  return clean.charAt(0).toUpperCase() + clean.slice(1) || "Dashboard";
}

function PagesContent() {
    const location = useLocation();
    const currentPageName = getPageName(location.pathname);
    return (
        <Layout currentPageName={currentPageName}>
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
            </Routes>
            </Suspense>
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
            <AuthProvider>
                <PagesContent />
            </AuthProvider>
        </Router>
    );
}