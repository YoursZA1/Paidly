import React from "react";
import PropTypes from "prop-types";
import { cn } from "@/lib/utils";
import {
  invoiceStatusLabel,
  invoiceLifecycleLabel,
  invoiceLifecyclePillClass,
} from "@shared/commercial/documentStatuses.js";

function InvoiceStatusBadge({ status, invoice = null, compact = false }) {
  const label = invoice ? invoiceLifecycleLabel(invoice) : invoiceStatusLabel(status);
  const pillStatus = invoiceLifecyclePillClass(label, status || invoice?.status);

  return (
    <div className={cn("status-pill", pillStatus, compact && "status-pill-compact")}>
      {label}
    </div>
  );
}

InvoiceStatusBadge.propTypes = {
  status: PropTypes.string,
  invoice: PropTypes.object,
  compact: PropTypes.bool,
};

export default React.memo(InvoiceStatusBadge);
