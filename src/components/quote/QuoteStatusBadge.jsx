import React from "react";
import PropTypes from "prop-types";
import {
  normalizeQuoteStatus,
  quoteStatusLabel,
} from "@shared/commercial/documentStatuses.js";

function QuoteStatusBadge({ status }) {
  const pillStatus = normalizeQuoteStatus(status);

  return (
    <div className={`status-pill ${pillStatus}`}>
      {quoteStatusLabel(status)}
    </div>
  );
}

QuoteStatusBadge.propTypes = {
  status: PropTypes.string,
};

export default React.memo(QuoteStatusBadge);
