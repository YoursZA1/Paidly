import { Badge } from "@/components/ui/badge";
import {
  attentionReasonLabel,
  employeeAttentionReasons,
  isWorkforceEmployeeActive,
  managerAssignmentLabel,
  managerAssignmentState,
  workforceLifecycleLabel,
} from "@shared/workforce/employeeLifecycle.js";

export function EmployeeLifecycleBadges({ employee, compact = false }) {
  const active = isWorkforceEmployeeActive(employee);
  const managerState = managerAssignmentState(employee);
  const reasons = employeeAttentionReasons(employee);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={active ? "default" : "secondary"}>{workforceLifecycleLabel(employee)}</Badge>
      <Badge variant={managerState === "inactive" ? "destructive" : "outline"}>
        {managerAssignmentLabel(managerState)}
      </Badge>
      {!compact && reasons.includes("inactive_manager") ? (
        <Badge variant="destructive">Manager inactive — reassignment required</Badge>
      ) : null}
      {!compact && reasons.filter((reason) => reason !== "inactive_manager").map((reason) => (
        <Badge key={reason} variant="outline">
          {attentionReasonLabel(reason)}
        </Badge>
      ))}
    </div>
  );
}

export default EmployeeLifecycleBadges;
