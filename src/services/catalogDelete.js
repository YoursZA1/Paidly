const DOCUMENT_LINKS = [
  ["invoice_items", "service_id"],
  ["invoice_items", "catalog_item_id"],
  ["quote_items", "service_id"],
  ["quote_items", "catalog_item_id"],
];

function errorText(error) {
  return `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
}

export function isDocumentCatalogFk(error) {
  const text = errorText(error);
  return /23503|foreign key/i.test(`${error?.code || ""} ${text}`) && /invoice_items|quote_items/i.test(text);
}

export function catalogDeleteFailureMessage(error) {
  const text = errorText(error);
  if (/purchase_order/i.test(text)) {
    return "This item is on a purchase order, so it stays in your catalog.";
  }
  if (/foreign key|23503/i.test(`${error?.code || ""} ${text}`)) {
    return "This item is still used on a document, so it could not be removed.";
  }
  const message = String(error?.message || "").trim();
  return message || "Could not remove this item. Try again.";
}

function missingColumn(error) {
  return /column|schema cache|does not exist/i.test(errorText(error));
}

async function clearDocumentCatalogLinks(client, id) {
  for (const [table, column] of DOCUMENT_LINKS) {
    const { error } = await client.from(table).update({ [column]: null }).eq(column, id);
    if (error && !missingColumn(error)) throw error;
  }
}

/**
 * Remove a catalog row. Invoice and quote lines keep their saved name, quantity,
 * and price; only the catalog pointer is cleared when that link blocks the delete.
 */
export async function deleteCatalogItem(client, { id, orgId }) {
  const remove = () => {
    let query = client.from("services").delete().eq("id", id);
    if (orgId) query = query.eq("org_id", orgId);
    return query;
  };

  let { error } = await remove();
  let detached = false;
  if (error && isDocumentCatalogFk(error)) {
    await clearDocumentCatalogLinks(client, id);
    detached = true;
    ({ error } = await remove());
  }
  if (error) {
    const failure = new Error(catalogDeleteFailureMessage(error));
    failure.cause = error;
    throw failure;
  }
  return { detached };
}
