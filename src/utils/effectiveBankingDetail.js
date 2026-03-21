/**
 * Invoice-linked banking row, else profile `user.business`, as a banking-detail-shaped object for HTML templates.
 */
export function effectiveBankingDetail(bankingDetail, user) {
  if (
    bankingDetail &&
    (bankingDetail.bank_name ||
      bankingDetail.account_name ||
      bankingDetail.account_number ||
      bankingDetail.routing_number ||
      bankingDetail.branch_code ||
      bankingDetail.swift_code)
  ) {
    return bankingDetail;
  }
  const biz = user?.business;
  if (!biz || typeof biz !== "object") return null;
  if (
    !biz.bank_name &&
    !biz.account_name &&
    !biz.account_number &&
    !biz.branch_code &&
    !biz.routing_number &&
    !biz.swift_code
  ) {
    return null;
  }
  return {
    bank_name: biz.bank_name || "",
    account_name: biz.account_name || "",
    account_number: biz.account_number || "",
    routing_number: biz.branch_code || biz.routing_number || "",
    branch_code: biz.branch_code || "",
    swift_code: biz.swift_code || "",
    payment_method: biz.payment_method,
    additional_info: biz.additional_info,
  };
}
