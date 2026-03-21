import React from "react";
import PropTypes from "prop-types";

const LABELS = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
};

function PayslipStatusBadge({ status }) {
  const raw = (status || "draft").toString().toLowerCase();
  const label =
    LABELS[raw] ||
    raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return <div className={`status-pill ${raw}`}>{label}</div>;
}

PayslipStatusBadge.propTypes = {
  status: PropTypes.string,
};

export default React.memo(PayslipStatusBadge);
