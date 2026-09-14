import { Navigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

/** Legacy alias — company members land on Workforce. */
export default function CompanyWorkspacePage() {
  return <Navigate to={createPageUrl("Workforce")} replace />;
}
