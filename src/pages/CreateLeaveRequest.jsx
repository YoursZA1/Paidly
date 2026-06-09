import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import DocumentCreateToolbar from "@/components/documents/DocumentCreateToolbar";
import DocumentApproverSelect from "@/components/documents/DocumentApproverSelect";
import LeaveRequestFields, { leaveMetadataFromForm } from "@/components/documents/LeaveRequestFields";
import { DEFAULT_LEAVE_BALANCES, countBusinessLeaveDays } from "@/document-engine/leaveRequest";
import {
  afterCreateNavigateTarget,
  documentsReturnPath,
  persistNewHubDocument,
} from "@/document-engine/documentCreateNavigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarOff } from "lucide-react";

export default function CreateLeaveRequestPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const returnTo = documentsReturnPath(location);

  const [leaveType, setLeaveType] = useState("annual");
  const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });
  const [reason, setReason] = useState("");
  const [approverId, setApproverId] = useState(null);
  const [saving, setSaving] = useState(false);

  const daysRequested = useMemo(
    () => countBusinessLeaveDays(dateRange.from, dateRange.to),
    [dateRange.from, dateRange.to]
  );

  const canSubmit = Boolean(dateRange.from && dateRange.to && daysRequested > 0);

  const buildPayload = () => {
    const metadata = leaveMetadataFromForm({
      leaveType,
      dateRange,
      reason,
      balances: DEFAULT_LEAVE_BALANCES,
    });
    const title =
      dateRange.from && dateRange.to
        ? `Leave Request — ${format(dateRange.from, "MMM d")} to ${format(dateRange.to, "MMM d, yyyy")}`
        : "Leave Request";
    return {
      type: "leave_request",
      title,
      body: reason.trim() || null,
      metadata,
      assigned_user_id: approverId,
    };
  };

  const persist = async (submitForApproval) => {
    if (!canSubmit) {
      toast({
        variant: "destructive",
        title: "Select leave dates",
        description: "Choose a start and end date before saving your request.",
      });
      return;
    }
    if (submitForApproval && !approverId) {
      toast({
        variant: "destructive",
        title: "Choose an approver",
        description: "Select who should receive the approval email before submitting.",
      });
      return;
    }

    setSaving(true);
    try {
      const doc = await persistNewHubDocument(buildPayload(), { submitForApproval });
      toast({
        title: submitForApproval ? "Leave request submitted" : "Leave request saved",
        description: submitForApproval
          ? "Pending approval — your approver has been notified by email."
          : "Draft saved — you can continue editing from the document page.",
      });
      navigate(afterCreateNavigateTarget(doc, { returnTo }));
    } catch (e) {
      toast({
        variant: "destructive",
        title: submitForApproval ? "Could not submit leave request" : "Could not save leave request",
        description: e?.message || String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  const toolbarProps = {
    returnTo,
    onPrimary: () => persist(false),
    primaryLabel: "Save draft",
    primaryIcon: "save",
    primaryDisabled: !canSubmit,
    onSecondary: () => persist(true),
    secondaryLabel: "Submit for approval",
    secondaryDisabled: !approverId,
    saving,
  };

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title="New Leave Request"
          description="Choose your dates, leave type, and balance — then save or submit for approval."
          actions={<DocumentCreateToolbar {...toolbarProps} />}
        />
      </PageTemplate.Header>

      <PageTemplate.Body
        sidePanel={
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarOff className="h-4 w-4 text-muted-foreground" />
                  Employee
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-medium">{user?.full_name || user?.email || "You"}</p>
                <p className="text-muted-foreground">Save as draft or submit when dates and type are set.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Leave balances</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(DEFAULT_LEAVE_BALANCES).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                    <span className="font-medium tabular-nums">{value == null ? "—" : `${value}d`}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leave details</CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveRequestFields
              leaveType={leaveType}
              onLeaveTypeChange={setLeaveType}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              reason={reason}
              onReasonChange={setReason}
              balances={DEFAULT_LEAVE_BALANCES}
            />
            <div className="mt-6 border-t border-border pt-6">
              <DocumentApproverSelect value={approverId} onChange={setApproverId} disabled={saving} />
            </div>
          </CardContent>
        </Card>
      </PageTemplate.Body>

      <DocumentCreateToolbar {...toolbarProps} sticky className="mt-6" />
    </PageTemplate>
  );
}
