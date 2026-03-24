import React from "react";
import PropTypes from "prop-types";

const statusConfig = {
  draft: { label: "Draft" },
  sent: { label: "Sent" },
  viewed: { label: "Viewed" },
  accepted: { label: "Accepted" },
  rejected: { label: "Rejected" },
  declined: { label: "Declined" },
  expired: { label: "Expired" },
};

function QuoteStatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.draft;
  const pillStatus = status || "draft";

  return (
    <div className={`status-pill ${pillStatus}`}>
      {config.label}
    </div>
  );
}

QuoteStatusBadge.propTypes = {
  status: PropTypes.string,
};

export default React.memo(QuoteStatusBadge);
