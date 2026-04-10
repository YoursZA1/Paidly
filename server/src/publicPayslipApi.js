import {
  handlePublicPayslipGet,
  handlePublicPayslipVerify,
} from "../../api/_publicPayslipShared.js";

export function registerPublicPayslipRoutes(app) {
  app.get("/api/public-payslip", handlePublicPayslipGet);
  app.post("/api/public-payslip-verify", handlePublicPayslipVerify);
}
