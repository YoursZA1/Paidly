import {
  handlePublicPayslipGet,
  handlePublicPayslipVerify,
} from "../../api/public-payslip-shared.js";

export function registerPublicPayslipRoutes(app) {
  app.get("/api/public-payslip", handlePublicPayslipGet);
  app.post("/api/public-payslip-verify", handlePublicPayslipVerify);
}
