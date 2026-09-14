import { Navigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

/** Legacy member home — Workforce is the company-member landing page. */
export default function CompanyMemberDashboard() {
  return <Navigate to={createPageUrl("Workforce")} replace />;
}
