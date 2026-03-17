import React from "react";
import PropTypes from "prop-types";

/**
 * InvoiceStatusBadge — clean status cell, matches quote pill (one element, no icon)
 */
const statusConfig = {
  draft: { label: "Draft" },
  sending: { label: "Sending…" },
  preparing: { label: "Preparing…" },
  sent: { label: "Sent" },
  viewed: { label: "Viewed" },
  pending: { label: "Pending" },
  paid: { label: "Paid" },
  partial_paid: { label: "Partially Paid" },
  overdue: { label: "Overdue" },
  cancelled: { label: "Cancelled" },
};

function InvoiceStatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.draft;
  const pillStatus = status || "draft";

  return (
    <div className={`status-pill ${pillStatus}`}>
      {config.label}
    </div>
  );
}

InvoiceStatusBadge.propTypes = {
  status: PropTypes.string,
};

export default React.memo(InvoiceStatusBadge);
