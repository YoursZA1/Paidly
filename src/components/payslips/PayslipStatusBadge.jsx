import React from "react";
import PropTypes from "prop-types";

import { displayPayslipStatus, payslipStatusLabel } from "@shared/payroll/payslipStatus.js";

const LABELS = {
  draft: "Draft",
  published: "Published",
  sent: "Sent",
  paid: "Paid",
};

function PayslipStatusBadge({ status, payslip }) {
  const raw = displayPayslipStatus(payslip || { status });
  const label = LABELS[raw] || payslipStatusLabel(raw);

  return <div className={`status-pill ${raw}`}>{label}</div>;
}

PayslipStatusBadge.propTypes = {
  status: PropTypes.string,
  payslip: PropTypes.object,
};

export default React.memo(PayslipStatusBadge);
