import { lazy, Suspense } from "react";
import Layout from "./Layout.jsx";
import AuthenticatedShell from "@/components/layout/AuthenticatedShell";
import AuthLayout from "@/components/layout/AuthLayout";

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
const CompanyWorkspace = lazy(() => import("./CompanyWorkspace"));
const Reports = lazy(() => import("./Reports"));
const Payslips = lazy(() => import("./Payslips"));
const CreatePayslip = lazy(() => import("./CreatePayslip"));
const CreateLeaveRequest = lazy(() => import("./CreateLeaveRequest"));
const CreateExpenseClaim = lazy(() => import("./CreateExpenseClaim"));
const CreateTypedDocument = lazy(() => import("./CreateTypedDocument"));
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
const InvitePage = lazy(() => import("./Invite"));
const About = lazy(() => import("./About"));
const PrivacyPolicy = lazy(() => import("./PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("./TermsAndConditions"));
const BentoDemoPage = lazy(() => import("./BentoDemo"));
const AnimatedIconsDemoPage = lazy(() => import("./AnimatedIconsDemo"));
const HowTo = lazy(() => import("./HowTo"));
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
import { RequireCompanyPermissionRedirect } from "@/components/auth/RequireCompanyPermission";
import RequireBusinessOwner from "@/components/auth/RequireBusinessOwner";
import { PERMISSIONS } from "@/lib/companyPermissions";
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
    { path: "/Auth", element: <Home navActive="login" /> },
    { path: "/Auth.html", element: <Home navActive="login" /> },
    { path: "/Login", element: <Home navActive="login" /> },
    { path: "/login", element: <Home navActive="login" /> },
    { path: "/Signup", element: <AuthLayout><Signup /></AuthLayout> },
    { path: "/signup", element: <AuthLayout><Signup /></AuthLayout> },
    { path: "/ForgotPassword", element: <AuthLayout><ForgotPassword /></AuthLayout> },
    { path: "/ResetPassword", element: <ResetPassword /> },
    { path: "/AcceptInvite", element: <AcceptInvite /> },
    { path: "/invite", element: <InvitePage /> },
    { path: "/Invite", element: <InvitePage /> },
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
    { path: "/HowTo", element: <HowTo /> },
    { path: "/how-to", element: <HowTo /> },
    { path: "/How-to", element: <HowTo /> },
    { path: "/affiliate", element: <AffiliateLanding /> },
    { path: "/Affiliate", element: <AffiliateLanding /> },
    { path: "/affiliate/apply", element: <AffiliateApply /> },
    { path: "/Affiliate/apply", element: <AffiliateApply /> },
    { path: "/return", element: <PayfastReturn /> },
    { path: "/success", element: <PayfastReturn /> },
    { path: "/cancel", element: <PayfastCancel /> },
];

function ownerRoute(element) {
    return (
        <RequireAuth>
            <RequireBusinessOwner>{element}</RequireBusinessOwner>
        </RequireAuth>
    );
}

// --- Main App Pages ---
const MAIN_ROUTES = [
    { path: "/", element: <Home /> },
    { path: "/Dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
    { path: "/dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
    { path: "/employee-dashboard", element: <RequireAuth><CompanyWorkspace /></RequireAuth> },
    { path: "/EmployeeDashboard", element: <RequireAuth><CompanyWorkspace /></RequireAuth> },
    { path: "/Clients", element: ownerRoute(<Clients />) },
    { path: "/clients", element: ownerRoute(<Clients />) },
    { path: "/Settings", element: <RequireAuth><Settings /></RequireAuth> },
    { path: "/settings", element: <RequireAuth><Settings /></RequireAuth> },
    { path: "/Reminders", element: <RequireAuth><Navigate to="/Settings?tab=reminders" replace /></RequireAuth> },
    { path: "/reminders", element: <RequireAuth><Navigate to="/Settings?tab=reminders" replace /></RequireAuth> },
    { path: "/BillingAndInvoices", element: ownerRoute(<BillingAndInvoices />) },
    { path: "/billingandinvoices", element: ownerRoute(<BillingAndInvoices />) },
    { path: "/Notes", element: <RequireAuth><Notes /></RequireAuth> },
    { path: "/notes", element: <RequireAuth><Notes /></RequireAuth> },
    { path: "/Services", element: ownerRoute(<Services />) },
    { path: "/services", element: ownerRoute(<Services />) },
    { path: "/Inventory", element: <RequireAuth><Navigate to="/Services" replace /></RequireAuth> },
    { path: "/inventory", element: <RequireAuth><Navigate to="/Services" replace /></RequireAuth> },
    { path: "/Calendar", element: <RequireAuth><Calendar /></RequireAuth> },
    { path: "/Messages", element: <RequireAuth><Messages /></RequireAuth> },
    { path: "/Budgets", element: ownerRoute(<Budgets />) },
    { path: "/Accounting", element: ownerRoute(<Accounting />) },
    { path: "/ClientDetail", element: ownerRoute(<ClientDetail />) },
    { path: "/EditClient", element: ownerRoute(<EditClient />) },
    { path: "/editclient", element: ownerRoute(<EditClient />) },
    { path: "/EditCatalogItem", element: ownerRoute(<EditCatalogItem />) },
    { path: "/editcatalogitem", element: ownerRoute(<EditCatalogItem />) },
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
    { path: "/Invoices", element: ownerRoute(<Invoices />) },
    { path: "/invoices", element: ownerRoute(<Invoices />) },
    { path: "/CreateInvoice", element: ownerRoute(<CreateInvoice />) },
    { path: "/createinvoice", element: ownerRoute(<CreateInvoice />) },
    { path: "/CreateDocument", element: ownerRoute(<Navigate to="/CreateDocument/invoice" replace />) },
    { path: "/CreateDocument/:type", element: ownerRoute(<CreateDocument />) },
    { path: "/createdocument", element: ownerRoute(<Navigate to="/CreateDocument/invoice" replace />) },
    { path: "/createdocument/:type", element: ownerRoute(<CreateDocument />) },
    { path: "/ViewDocument/:docType/:id", element: <RequireAuth><ViewDocument /></RequireAuth> },
    { path: "/viewdocument/:docType/:id", element: <RequireAuth><ViewDocument /></RequireAuth> },
    { path: "/Documents/:documentId", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_OWN_DOCUMENTS}><DocumentDetail /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/documents/:documentId", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_OWN_DOCUMENTS}><DocumentDetail /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/Documents", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_OWN_DOCUMENTS}><Documents /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/documents", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_OWN_DOCUMENTS}><Documents /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/CreateLeaveRequest", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_OWN_LEAVE}><CreateLeaveRequest /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/createleaverequest", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_OWN_LEAVE}><CreateLeaveRequest /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/CreateExpenseClaim", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_OWN_DOCUMENTS}><CreateExpenseClaim /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/createexpenseclaim", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_OWN_DOCUMENTS}><CreateExpenseClaim /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/CreateTypedDocument/:type", element: <RequireAuth><CreateTypedDocument /></RequireAuth> },
    { path: "/createtypeddocument/:type", element: <RequireAuth><CreateTypedDocument /></RequireAuth> },
    { path: "/ViewInvoice", element: ownerRoute(<ViewInvoice />) },
    { path: "/EditInvoice", element: ownerRoute(<EditInvoice />) },
    { path: "/RecurringInvoices", element: ownerRoute(<RecurringInvoices />) },
    { path: "/CreateRecurringInvoice", element: ownerRoute(<CreateRecurringInvoice />) },
];

// --- Quote Pages ---
const QUOTE_ROUTES = [
    { path: "/Quotes", element: ownerRoute(<Quotes />) },
    { path: "/quotes", element: ownerRoute(<Quotes />) },
    { path: "/CreateQuote", element: ownerRoute(<CreateQuote />) },
    { path: "/ViewQuote", element: ownerRoute(<ViewQuote />) },
    { path: "/EditQuote", element: ownerRoute(<EditQuote />) },
    { path: "/QuotePDF", element: ownerRoute(<QuotePDF />) },
    { path: "/QuoteTemplates", element: ownerRoute(<QuoteTemplates />) },
];

// --- Payslip & Report Pages ---
const PAYSLIP_REPORT_ROUTES = [
    { path: "/Payslips", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_OWN_PAYSLIPS}><Payslips /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/CreatePayslip", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.MANAGE_PAYROLL}><CreatePayslip /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/EditPayslip", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.MANAGE_PAYROLL}><EditPayslip /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/PayslipPDF", element: <RequireAuth><PayslipPDF /></RequireAuth> },
    { path: "/ViewPayslip", element: <RequireAuth><ViewPayslip /></RequireAuth> },
    { path: "/ReportPDF", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_COMPANY_REPORTS}><ReportPDF /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/reportpdf", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_COMPANY_REPORTS}><ReportPDF /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/Reports", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_COMPANY_REPORTS}><Reports /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/TeamMembers", element: <RequireAuth><Navigate to="/Settings?tab=team" replace /></RequireAuth> },
    { path: "/teammembers", element: <RequireAuth><Navigate to="/Settings?tab=team" replace /></RequireAuth> },
    { path: "/CompanyTeam", element: <RequireAuth><Navigate to="/Settings?tab=company-team" replace /></RequireAuth> },
    { path: "/companyteam", element: <RequireAuth><Navigate to="/Settings?tab=company-team" replace /></RequireAuth> },
    { path: "/CompanyWorkspace", element: <RequireAuth><CompanyWorkspace /></RequireAuth> },
    { path: "/companyworkspace", element: <RequireAuth><CompanyWorkspace /></RequireAuth> },
    { path: "/CashFlow", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_COMPANY_REPORTS}><CashFlow /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/CashFlowPDF", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_COMPANY_REPORTS}><CashFlowPDF /></RequireCompanyPermissionRedirect></RequireAuth> },
    // Lowercase aliases for nav/bookmarks
    { path: "/reports", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_COMPANY_REPORTS}><Reports /></RequireCompanyPermissionRedirect></RequireAuth> },
    { path: "/cashflow", element: <RequireAuth><RequireCompanyPermissionRedirect permission={PERMISSIONS.VIEW_COMPANY_REPORTS}><CashFlow /></RequireCompanyPermissionRedirect></RequireAuth> },
];

// --- Admin & Support Pages ---
const ADMIN_ROUTES = [
    { path: "/AdminFinancials", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/AdminBusinesses", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/TaskSettings", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/UserManagement", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/UserAccessControl", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/AdminControl", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/AdminDashboard", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/dashboard", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/LogsAuditTrail", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/ExcelDataCapture", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/SubscriptionsManagement", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/DocumentActivity", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/AdminUsers", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/AdminAffiliates", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/affiliates" replace /></RequireAuth> },
    { path: "/AdminAccounts", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/AdminDocumentOversight", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/AdminSubscriptions", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/AdminPlans", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/PlatformSettings", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/SupportAdminTools", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/SecurityCompliance", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/AdminRolesManagement", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    // --- Admin Nested Routes ---
    { path: "/admin", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/users", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/admin/admin-control", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/access-control", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/logs-audit-trail", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/excel-data-capture", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/subscriptions", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/admin/plans-management", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/admin/subscriptions-management", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/admin/document-activity", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/user-management", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/admin/affiliates", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/affiliates" replace /></RequireAuth> },
    { path: "/admin/accounts-management", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/users" replace /></RequireAuth> },
    { path: "/admin/document-oversight", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/platform-settings", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/support-tools", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/support-admin-tools", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/security-compliance", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/roles-management", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/settings" replace /></RequireAuth> },
    { path: "/admin/system-status", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/background-jobs", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/BuildLogs", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/build-logs", element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/transactions",    element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
    { path: "/admin/payouts",          element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/affiliates" replace /></RequireAuth> },
    { path: "/admin/fees",             element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/admin/billing",          element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2/subscriptions" replace /></RequireAuth> },
    { path: "/admin/invoices-quotes",  element: <RequireAuth roles={["admin", "management", "sales", "support"]}><Navigate to="/admin-v2" replace /></RequireAuth> },
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
    /^\/invite$/i,
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
        <AuthenticatedShell>
            <Layout currentPageName={currentPageName}>
                {content}
            </Layout>
        </AuthenticatedShell>
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