import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import DocumentCreateToolbar from "@/components/documents/DocumentCreateToolbar";
import DocumentApproverSelect from "@/components/documents/DocumentApproverSelect";
import ExpenseClaimFields, {
  expenseClaimMetadataFromForm,
} from "@/components/documents/ExpenseClaimFields";
import {
  emptyExpenseLine,
  expenseLinesToDocumentItems,
  sumExpenseLineAmounts,
} from "@/document-engine/expenseClaim";
import {
  afterCreateNavigateTarget,
  documentsReturnPath,
  persistNewHubDocument,
} from "@/document-engine/documentCreateNavigation";
import { formatCurrency } from "@/utils/currencyCalculations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Wallet } from "lucide-react";

export default function CreateExpenseClaimPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const returnTo = documentsReturnPath(location);

  const [lines, setLines] = useState([emptyExpenseLine()]);
  const [reimbursementMethod, setReimbursementMethod] = useState("bank_transfer");
  const [notes, setNotes] = useState("");
  const [approverId, setApproverId] = useState(null);
  const [saving, setSaving] = useState(false);

  const currency = "ZAR";
  const total = useMemo(() => sumExpenseLineAmounts(lines), [lines]);
  const canSubmit = total > 0 && lines.some((l) => l.expense_date && Number(l.amount) > 0);

  const buildPayload = () => {
    const metadata = expenseClaimMetadataFromForm({
      lines,
      reimbursementMethod,
      notes,
      currency,
    });
    return {
      type: "expense_claim",
      title: `Expense Claim — ${formatCurrency(total, currency)}`,
      currency,
      base_currency: currency,
      body: notes.trim() || null,
      metadata,
      items: expenseLinesToDocumentItems(lines),
      assigned_user_id: approverId,
    };
  };

  const persist = async (submitForApproval) => {
    if (!canSubmit) {
      toast({
        variant: "destructive",
        title: "Add at least one expense",
        description: "Enter a date and amount for each expense you want to claim.",
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
        title: submitForApproval ? "Expense claim submitted" : "Expense claim saved",
        description: submitForApproval
          ? "Pending approval — your approver has been notified by email."
          : "Draft saved — you can continue editing from the document page.",
      });
      navigate(afterCreateNavigateTarget(doc, { returnTo }));
    } catch (e) {
      toast({
        variant: "destructive",
        title: submitForApproval ? "Could not submit claim" : "Could not save claim",
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
          title="New Expense Claim"
          description="Log receipts and reimbursable costs, then save or submit for approval."
          actions={<DocumentCreateToolbar {...toolbarProps} />}
        />
      </PageTemplate.Header>

      <PageTemplate.Body
        sidePanel={
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  Claimant
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-medium">{user?.full_name || user?.email || "You"}</p>
                <p className="text-muted-foreground">Save as draft or submit when line items are complete.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Running total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">
                  {total > 0 ? formatCurrency(total, currency) : "—"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{currency} · reimbursable</p>
              </CardContent>
            </Card>
          </>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expense details</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseClaimFields
              lines={lines}
              onLinesChange={setLines}
              reimbursementMethod={reimbursementMethod}
              onReimbursementMethodChange={setReimbursementMethod}
              notes={notes}
              onNotesChange={setNotes}
              currency={currency}
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
