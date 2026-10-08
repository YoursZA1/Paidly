import { employeePortalPath } from "../workforce/portalSlug.js";
import { membershipIsPosEnabled, posTillPath } from "../posStaffInvite.js";

/**
 * Portal buttons on a payslip email.
 * Employee portal when the company has a slug and this person's portal is open.
 * POS when this person can use the till.
 */
export function payslipPortalLinks({ origin, portalSlug, membership } = {}) {
  const links = [];
  if (!membership?.portal_revoked_at) {
    const employeeUrl = employeePortalPath(portalSlug, origin);
    if (employeeUrl) links.push({ href: employeeUrl, label: "View your portal", variant: "outline" });
  }
  if (membership && !membership.pos_access_disabled_at && membershipIsPosEnabled(membership)) {
    links.push({
      href: posTillPath(membership.pos_register_id, origin),
      label: "Open POS",
      variant: "outline",
    });
  }
  return links;
}
