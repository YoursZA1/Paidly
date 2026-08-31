/**
 * Back-office POS entry (sidebar, dashboard, search).
 * The till itself stays a dedicated shell at `/POS` — this module only decides
 * whether staff can see a link to it.
 *
 * Show POS when the org opted into a till (retail/mixed), the plan includes
 * `pos` (Business+), **and** the user may open the till.
 * Do not render an “Upgrade to Business” teaser in primary nav.
 */

const POS_QUERY_KEYS = ["pos", "till", "checkout", "register"];

/** Dedicated till shell — Layout skips sidebar/header/footer/mobile nav. */
export function isPosTerminalPage(pageName) {
  return /^pos$/i.test(String(pageName || ""));
}

/**
 * @param {{
 *   hasPosCapability?: boolean,
 *   hasPosEntitlement?: boolean,
 *   hasPosAccess?: boolean,
 *   isOrgOwner?: boolean,
 *   isCompanyMember?: boolean,
 * }} [input]
 * @returns {boolean}
 */
export function canShowPosNav({
  hasPosCapability = false,
  hasPosEntitlement = false,
  hasPosAccess = false,
  isOrgOwner = false,
  isCompanyMember = false,
} = {}) {
  if (hasPosCapability !== true) return false;
  if (hasPosEntitlement !== true) return false;
  if (isOrgOwner === true) return true;
  if (isCompanyMember !== true) return true;
  return hasPosAccess === true;
}

/**
 * Drop the sidebar POS item when the org/user should not see the till.
 * @param {Array<{ id?: string }>} items
 * @param {Parameters<typeof canShowPosNav>[0]} access
 */
export function applyPosNavVisibility(items, access) {
  if (!Array.isArray(items)) return [];
  if (canShowPosNav(access)) return items;
  return items.filter((item) => item?.id !== "nav-pos");
}

/**
 * Quick-search shortcut: “pos”, “till”, “checkout”, “register”.
 * @param {string} query
 */
export function matchesPosNavQuery(query) {
  const t = String(query || "").trim().toLowerCase();
  if (t.length < 2) return false;
  return POS_QUERY_KEYS.some((key) => key.startsWith(t) || t.startsWith(key));
}
