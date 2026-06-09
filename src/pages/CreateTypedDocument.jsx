import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, Navigate } from "react-router-dom";
import PageTemplate from "@/components/layout/PageTemplate";
import PageHeader from "@/components/dashboard/PageHeader";
import DocumentCreateToolbar from "@/components/documents/DocumentCreateToolbar";
import DocumentApproverSelect from "@/components/documents/DocumentApproverSelect";
import TypedDocumentFields, {
  emptyTypedDocumentLine,
  typedLinesToDocumentItems,
} from "@/components/documents/TypedDocumentFields";
import { DocumentTypeIcon } from "@/components/documents/documentIcon";
import {
  getDocumentFormProfile,
  hasDocumentFormProfile,
  typedDocumentTitle,
  emptyFormValues,
  buildDocumentTitleFromForm,
  formMetadataFromValues,
  validateFormValues,
} from "@/document-engine/documentFormProfiles";
import { isFinancialType, typeLabel } from "@/document-engine";
import {
  afterCreateNavigateTarget,
  documentsReturnPath,
  isApprovalFlowType,
  persistNewHubDocument,
} from "@/document-engine/documentCreateNavigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CreateTypedDocumentPage() {
  const { type: typeParam } = useParams();
  const typeKey = String(typeParam || "").trim();

  if (!hasDocumentFormProfile(typeKey)) {
    return <Navigate to={createPageUrl("Documents")} replace />;
  }

  return <CreateTypedDocumentCore typeKey={typeKey} />;
}

function CreateTypedDocumentCore({ typeKey }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const returnTo = documentsReturnPath(location);
  const profile = useMemo(() => getDocumentFormProfile(typeKey), [typeKey]);
  const showSubmit = isApprovalFlowType(typeKey);

  const [values, setValues] = useState(() => emptyFormValues(profile));
  const [lines, setLines] = useState(() =>
    profile.includeLineItems ? [emptyTypedDocumentLine()] : []
  );
  const [approverId, setApproverId] = useState(null);
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = () => {
    const metadata = formMetadataFromValues({ values, profile });
    const title = buildDocumentTitleFromForm(typeKey, values, profile);
    const body =
      values.notes?.trim() ||
      values.summary?.trim() ||
      values.procedure?.trim() ||
      values.letter_body?.trim() ||
      null;

    const payload = {
      type: typeKey,
      title,
      body,
      metadata,
      currency: "ZAR",
      base_currency: "ZAR",
      assigned_user_id: showSubmit ? approverId : null,
    };

    if (profile.includeLineItems || isFinancialType(typeKey)) {
      payload.items = typedLinesToDocumentItems(lines);
    }

    return payload;
  };

  const validate = () => {
    const error = validateFormValues(profile, values);
    if (error) {
      toast({ variant: "destructive", title: "Missing required field", description: error });
      return false;
    }

    if (profile.includeLineItems) {
      const hasLine = lines.some(
        (line) => line.description?.trim() && Number(line.unit_price) > 0
      );
      if (!hasLine) {
        toast({
          variant: "destructive",
          title: "Add line items",
          description: "Enter at least one line with a description and amount.",
        });
        return false;
      }
    }

    return true;
  };

  const persist = async (submitForApproval) => {
    if (!validate()) return;
    if (submitForApproval && showSubmit && !approverId) {
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
        title: submitForApproval ? `${typeLabel(typeKey)} submitted` : `${typeLabel(typeKey)} saved`,
        description: submitForApproval
          ? "Pending approval — your approver has been notified by email."
          : "Draft saved — you can continue editing from the document page.",
      });
      navigate(afterCreateNavigateTarget(doc, { returnTo }));
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not create document",
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
    onSecondary: showSubmit ? () => persist(true) : undefined,
    secondaryLabel: showSubmit ? "Submit for approval" : undefined,
    secondaryDisabled: showSubmit ? !approverId : false,
    saving,
  };

  return (
    <PageTemplate>
      <PageTemplate.Header>
        <PageHeader
          title={typedDocumentTitle(typeKey)}
          description={profile.description}
          actions={<DocumentCreateToolbar {...toolbarProps} />}
        />
      </PageTemplate.Header>

      <PageTemplate.Body
        sidePanel={
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <DocumentTypeIcon type={typeKey} className="h-4 w-4 text-muted-foreground" />
                {typeLabel(typeKey)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{profile.summaryHint || "Complete the form and save your draft."}</p>
              <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1 px-2" asChild>
                <Link to={returnTo}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to Documents
                </Link>
              </Button>
            </CardContent>
          </Card>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Document details</CardTitle>
            {profile.description ? (
              <CardDescription>{profile.description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <TypedDocumentFields
              profile={profile}
              values={values}
              onChange={setField}
              lines={lines}
              onLinesChange={setLines}
            />
            {showSubmit ? (
              <div className="mt-6 border-t border-border pt-6">
                <DocumentApproverSelect value={approverId} onChange={setApproverId} disabled={saving} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </PageTemplate.Body>

      <DocumentCreateToolbar {...toolbarProps} sticky className="mt-6" />
    </PageTemplate>
  );
}
