import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentService } from "@/services/DocumentService";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Pick who receives the approval email when the document is submitted.
 */
export default function DocumentApproverSelect({
  value,
  onChange,
  disabled = false,
  id = "doc-approver",
}) {
  const { user, authUserId } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await DocumentService.listOrgMembers();
        if (!cancelled) setMembers(rows);
      } catch {
        if (!cancelled) setMembers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    return members.filter((m) => m.email?.trim() && m.user_id !== authUserId);
  }, [members, authUserId]);

  useEffect(() => {
    if (value || !options.length) return;
    const owner = options.find((m) => m.role === "owner");
    const admin = options.find((m) => m.role === "admin");
    const defaultId = owner?.user_id || admin?.user_id || options[0]?.user_id || null;
    if (defaultId) onChange?.(defaultId);
  }, [value, options, onChange]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Approver</Label>
      <Select
        value={value || "none"}
        onValueChange={(v) => onChange?.(v === "none" ? null : v)}
        disabled={disabled || loading || options.length === 0}
      >
        <SelectTrigger id={id}>
          <SelectValue
            placeholder={
              loading
                ? "Loading team…"
                : options.length
                  ? "Select approver"
                  : "No approver available"
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Select approver</SelectItem>
          {options.map((m) => (
            <SelectItem key={m.user_id} value={m.user_id}>
              {m.label}
              {m.role === "owner" ? " · Owner" : m.role === "admin" ? " · Admin" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {options.length
          ? "They will receive an email when you submit for approval."
          : `Add another team member with an email address to ${user?.company_name || "your organization"}.`}
      </p>
    </div>
  );
}
