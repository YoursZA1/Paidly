import React from "react";
import PropTypes from "prop-types";
import { cn } from "@/lib/utils";
import {
  normalizeInvoiceStatus,
  invoiceStatusLabel,
} from "@shared/commercial/documentStatuses.js";

function InvoiceStatusBadge({ status, compact = false }) {
  const pillStatus = normalizeInvoiceStatus(status);

  return (
    <div className={cn("status-pill", pillStatus, compact && "status-pill-compact")}>
      {invoiceStatusLabel(status)}
    </div>
  );
}

InvoiceStatusBadge.propTypes = {
  status: PropTypes.string,
  compact: PropTypes.bool,
};

export default React.memo(InvoiceStatusBadge);
