import { parseUuid } from "@shared/ids/uuid.js";
import { employeeOptionValue, formatEmployeeLabel } from "@shared/workforce/employeeIdentity.js";
import { cn } from "@/lib/utils";

const defaultSelectClass = "w-full h-10 rounded-xl border border-border bg-background px-3 text-sm";

/**
 * Employee picker: option value is `memberships.id`; label is `Name (EMP-XXX)`.
 *
 * @param {{
 *   employees?: object[],
 *   value?: string,
 *   onChange?: (employeeId: string) => void,
 *   id?: string,
 *   required?: boolean,
 *   disabled?: boolean,
 *   emptyLabel?: string,
 *   className?: string,
 * }} props
 */
export default function EmployeeSelect({
  employees = [],
  value = "",
  onChange,
  id,
  required = false,
  disabled = false,
  emptyLabel = "Select employee",
  className,
}) {
  const selected = parseUuid(value) || "";
  return (
    <select
      id={id}
      className={cn(defaultSelectClass, className)}
      value={selected}
      required={required}
      disabled={disabled}
      onChange={(e) => onChange?.(parseUuid(e.target.value) || "")}
    >
      <option value="">{emptyLabel}</option>
      {employees.map((emp) => {
        const optionId = employeeOptionValue(emp);
        if (!optionId) return null;
        return (
          <option key={optionId} value={optionId}>
            {formatEmployeeLabel(emp)}
          </option>
        );
      })}
    </select>
  );
}
