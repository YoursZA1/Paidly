import Layout from "./Layout.jsx";
import Dashboard from "./Dashboard";
import Login from "./Login";
import Signup from "./Signup";
import CreateInvoice from "./CreateInvoice";
import Clients from "./Clients";
import Invoices from "./Invoices";
import InvoicePDF from "./InvoicePDF";
import Settings from "./Settings";
import Notes from "./Notes";
import Services from "./Services";
import ViewInvoice from "./ViewInvoice";
import PublicInvoice from "./PublicInvoice";
import EditInvoice from "./EditInvoice";
import Quotes from "./Quotes";
import CreateQuote from "./CreateQuote";
import ViewQuote from "./ViewQuote";
import EditQuote from "./EditQuote";
import QuotePDF from "./QuotePDF";
import PublicQuote from "./PublicQuote";
import ClientPortal from "./ClientPortal";
import RecurringInvoices from "./RecurringInvoices";
import CreateRecurringInvoice from "./CreateRecurringInvoice";
import Reports from "./Reports";
import Payslips from "./Payslips";
import CreatePayslip from "./CreatePayslip";
import EditPayslip from "./EditPayslip";
import PayslipPDF from "./PayslipPDF";
import ViewPayslip from "./ViewPayslip";
import PublicPayslip from "./PublicPayslip";
import ReportPDF from "./ReportPDF";
import CashFlow from "./CashFlow";
import CashFlowPDF from "./CashFlowPDF";
import Calendar from "./Calendar";
import Messages from "./Messages";
import TaskSettings from "./TaskSettings";
import ClientDetail from "./ClientDetail";
import QuoteTemplates from "./QuoteTemplates";
import Vendors from "./Vendors";
import Budgets from "./Budgets";
import Accounting from "./Accounting";
import UserManagement from "./UserManagement";
import UserAccessControl from "./UserAccessControl";
import AdminControl from "./AdminControl";
import LogsAuditTrail from "./LogsAuditTrail";
import ExcelDataCapture from "./ExcelDataCapture";
import SubscriptionsManagement from "./SubscriptionsManagement";
import DocumentActivity from "./DocumentActivity";
import AdminUsers from "./AdminUsers";
import AdminAccounts from "./AdminAccounts";
import AdminDocumentOversight from "./AdminDocumentOversight";
import AdminSubscriptions from "./AdminSubscriptions";
import AdminPlans from "./AdminPlans";
import PlatformSettings from "./PlatformSettings";
import SupportAdminTools from "./SupportAdminTools";
import SecurityCompliance from "./SecurityCompliance";
import AdminRolesManagement from "./AdminRolesManagement";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";
import AcceptInvite from "./AcceptInvite";
import { BrowserRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthContext";
import RequireAuth from "@/components/auth/RequireAuth";

const PAGES = {
    Dashboard: Dashboard,
    Login: Login,
    Signup: Signup,
    CreateInvoice: CreateInvoice,
    Clients: Clients,
    Invoices: Invoices,
    InvoicePDF: InvoicePDF,
    Settings: Settings,
    Notes: Notes,
    Services: Services,
    ViewInvoice: ViewInvoice,
    PublicInvoice: PublicInvoice,
    EditInvoice: EditInvoice,
    Quotes: Quotes,
    CreateQuote: CreateQuote,
    ViewQuote: ViewQuote,
    EditQuote: EditQuote,
    QuotePDF: QuotePDF,
    PublicQuote: PublicQuote,
    ClientPortal: ClientPortal,
    RecurringInvoices: RecurringInvoices,
    CreateRecurringInvoice: CreateRecurringInvoice,
    Reports: Reports,
    Payslips: Payslips,
    CreatePayslip: CreatePayslip,
    EditPayslip: EditPayslip,
    PayslipPDF: PayslipPDF,
    ViewPayslip: ViewPayslip,
    PublicPayslip: PublicPayslip,
    ReportPDF: ReportPDF,
    CashFlow: CashFlow,
    CashFlowPDF: CashFlowPDF,
    Calendar: Calendar,
    Messages: Messages,
    TaskSettings: TaskSettings,
    ClientDetail: ClientDetail,
    QuoteTemplates: QuoteTemplates,
    Vendors: Vendors,
    Budgets: Budgets,
    Accounting: Accounting,
    UserManagement: UserManagement,
    UserAccessControl: UserAccessControl,
    AdminControl: AdminControl,
    LogsAuditTrail: LogsAuditTrail,
    ExcelDataCapture: ExcelDataCapture,
    SubscriptionsManagement: SubscriptionsManagement,
    DocumentActivity: DocumentActivity,
    AdminUsers: AdminUsers,
    AdminAccounts: AdminAccounts,
    AdminDocumentOversight: AdminDocumentOversight,
    AdminSubscriptions: AdminSubscriptions,
    AdminPlans: AdminPlans,
    PlatformSettings: PlatformSettings,
    SupportAdminTools: SupportAdminTools,
    SecurityCompliance: SecurityCompliance,
    AdminRolesManagement: AdminRolesManagement,
    ForgotPassword: ForgotPassword,
    ResetPassword: ResetPassword,
    AcceptInvite: AcceptInvite
};

function _getCurrentPage(url) {
    if (url.endsWith("/")) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split("/").pop();
    if (urlLastPart.includes("?")) {
        urlLastPart = urlLastPart.split("?")[0];
    }

    const pageName = Object.keys(PAGES).find(
        (page) => page.toLowerCase() === urlLastPart.toLowerCase()
    );
    return pageName || Object.keys(PAGES)[0];
}

function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);

    return (
        <Layout currentPageName={currentPage}>
            <Routes>
                <Route path="/Login" element={<Login />} />
                <Route path="/login" element={<Login />} />
                <Route path="/Signup" element={<Signup />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/ForgotPassword" element={<ForgotPassword />} />
                <Route path="/ResetPassword" element={<ResetPassword />} />
                <Route path="/AcceptInvite" element={<AcceptInvite />} />

                <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
                <Route path="/Dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />

                <Route path="/CreateInvoice" element={<RequireAuth><CreateInvoice /></RequireAuth>} />
                <Route path="/Clients" element={<RequireAuth><Clients /></RequireAuth>} />
                <Route path="/Invoices" element={<RequireAuth><Invoices /></RequireAuth>} />
                <Route path="/InvoicePDF" element={<RequireAuth><InvoicePDF /></RequireAuth>} />
                <Route path="/Settings" element={<RequireAuth><Settings /></RequireAuth>} />
                <Route path="/Notes" element={<RequireAuth><Notes /></RequireAuth>} />
                <Route path="/Services" element={<RequireAuth><Services /></RequireAuth>} />
                <Route path="/ViewInvoice" element={<RequireAuth><ViewInvoice /></RequireAuth>} />
                <Route path="/EditInvoice" element={<RequireAuth><EditInvoice /></RequireAuth>} />

                <Route path="/Quotes" element={<RequireAuth><Quotes /></RequireAuth>} />
                <Route path="/CreateQuote" element={<RequireAuth><CreateQuote /></RequireAuth>} />
                <Route path="/ViewQuote" element={<RequireAuth><ViewQuote /></RequireAuth>} />
                <Route path="/EditQuote" element={<RequireAuth><EditQuote /></RequireAuth>} />
                <Route path="/QuotePDF" element={<RequireAuth><QuotePDF /></RequireAuth>} />

                <Route path="/RecurringInvoices" element={<RequireAuth><RecurringInvoices /></RequireAuth>} />
                <Route path="/CreateRecurringInvoice" element={<RequireAuth><CreateRecurringInvoice /></RequireAuth>} />
                <Route path="/Reports" element={<RequireAuth><Reports /></RequireAuth>} />
                <Route path="/Payslips" element={<RequireAuth><Payslips /></RequireAuth>} />
                <Route path="/CreatePayslip" element={<RequireAuth><CreatePayslip /></RequireAuth>} />
                <Route path="/EditPayslip" element={<RequireAuth><EditPayslip /></RequireAuth>} />
                <Route path="/PayslipPDF" element={<RequireAuth><PayslipPDF /></RequireAuth>} />
                <Route path="/ViewPayslip" element={<RequireAuth><ViewPayslip /></RequireAuth>} />
                <Route path="/ReportPDF" element={<RequireAuth><ReportPDF /></RequireAuth>} />
                <Route path="/CashFlow" element={<RequireAuth><CashFlow /></RequireAuth>} />
                <Route path="/CashFlowPDF" element={<RequireAuth><CashFlowPDF /></RequireAuth>} />
                <Route path="/Calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
                <Route path="/Messages" element={<RequireAuth><Messages /></RequireAuth>} />
                <Route path="/TaskSettings" element={<RequireAuth roles={["admin"]}><TaskSettings /></RequireAuth>} />
                <Route path="/ClientDetail" element={<RequireAuth><ClientDetail /></RequireAuth>} />
                <Route path="/QuoteTemplates" element={<RequireAuth><QuoteTemplates /></RequireAuth>} />
                <Route path="/UserManagement" element={<RequireAuth roles={["admin"]}><UserManagement /></RequireAuth>} />
                <Route path="/UserAccessControl" element={<RequireAuth roles={["admin"]}><UserAccessControl /></RequireAuth>} />
                <Route path="/AdminControl" element={<RequireAuth roles={["admin"]}><AdminControl /></RequireAuth>} />
                <Route path="/LogsAuditTrail" element={<RequireAuth roles={["admin"]}><LogsAuditTrail /></RequireAuth>} />
                <Route path="/ExcelDataCapture" element={<RequireAuth roles={["admin"]}><ExcelDataCapture /></RequireAuth>} />
                <Route path="/SubscriptionsManagement" element={<RequireAuth roles={["admin"]}><SubscriptionsManagement /></RequireAuth>} />
                <Route path="/DocumentActivity" element={<RequireAuth roles={["admin"]}><DocumentActivity /></RequireAuth>} />
                <Route path="/AdminUsers" element={<RequireAuth roles={["admin"]}><AdminUsers /></RequireAuth>} />
                <Route path="/AdminAccounts" element={<RequireAuth roles={["admin"]}><AdminAccounts /></RequireAuth>} />
                <Route path="/AdminDocumentOversight" element={<RequireAuth roles={["admin"]}><AdminDocumentOversight /></RequireAuth>} />
                <Route path="/AdminSubscriptions" element={<RequireAuth roles={["admin"]}><AdminSubscriptions /></RequireAuth>} />
                <Route path="/AdminPlans" element={<RequireAuth roles={["admin"]}><AdminPlans /></RequireAuth>} />
                <Route path="/PlatformSettings" element={<RequireAuth roles={["admin"]}><PlatformSettings /></RequireAuth>} />
                <Route path="/SupportAdminTools" element={<RequireAuth roles={["admin"]}><SupportAdminTools /></RequireAuth>} />

                <Route path="/admin" element={<RequireAuth roles={["admin"]}><AdminControl /></RequireAuth>} />
                <Route path="/admin/users" element={<RequireAuth roles={["admin"]}><UserManagement /></RequireAuth>} />
                <Route path="/admin/admin-control" element={<RequireAuth roles={["admin"]}><AdminControl /></RequireAuth>} />
                <Route path="/admin/access-control" element={<RequireAuth roles={["admin"]}><UserAccessControl /></RequireAuth>} />
                <Route path="/admin/logs-audit-trail" element={<RequireAuth roles={["admin"]}><LogsAuditTrail /></RequireAuth>} />
                <Route path="/admin/excel-data-capture" element={<RequireAuth roles={["admin"]}><ExcelDataCapture /></RequireAuth>} />
                <Route path="/admin/subscriptions" element={<RequireAuth roles={["admin"]}><AdminSubscriptions /></RequireAuth>} />
                <Route path="/admin/plans-management" element={<RequireAuth roles={["admin"]}><AdminPlans /></RequireAuth>} />
                <Route path="/admin/subscriptions-management" element={<RequireAuth roles={["admin"]}><SubscriptionsManagement /></RequireAuth>} />
                <Route path="/admin/document-activity" element={<RequireAuth roles={["admin"]}><DocumentActivity /></RequireAuth>} />
                <Route path="/admin/user-management" element={<RequireAuth roles={["admin"]}><AdminUsers /></RequireAuth>} />
                <Route path="/admin/accounts-management" element={<RequireAuth roles={["admin"]}><AdminAccounts /></RequireAuth>} />
                <Route path="/admin/document-oversight" element={<RequireAuth roles={["admin"]}><AdminDocumentOversight /></RequireAuth>} />
                <Route path="/admin/platform-settings" element={<RequireAuth roles={["admin"]}><PlatformSettings /></RequireAuth>} />
                <Route path="/admin/support-tools" element={<RequireAuth roles={["admin"]}><SupportAdminTools /></RequireAuth>} />
                <Route path="/admin/security-compliance" element={<RequireAuth roles={["admin"]}><SecurityCompliance /></RequireAuth>} />
                <Route path="/admin/roles-management" element={<RequireAuth roles={["admin"]}><AdminRolesManagement /></RequireAuth>} />
                <Route path="/Vendors" element={<RequireAuth roles={["admin"]}><Vendors /></RequireAuth>} />
                <Route path="/Budgets" element={<RequireAuth><Budgets /></RequireAuth>} />
                <Route path="/Accounting" element={<RequireAuth><Accounting /></RequireAuth>} />

                <Route path="/PublicInvoice" element={<PublicInvoice />} />
                <Route path="/PublicQuote" element={<PublicQuote />} />
                <Route path="/PublicPayslip" element={<PublicPayslip />} />
                <Route path="/ClientPortal" element={<ClientPortal />} />
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <AuthProvider>
                <PagesContent />
            </AuthProvider>
        </Router>
    );
}