/**
 * Built-in document template presets — seed content users can add to their org library
 * without saving from an existing document first.
 */
import { categoryForType, isHubPersistedType } from "./documentCatalog";

/** @typedef {{ key: string, type: string, name: string, description: string, content: Record<string, unknown> }} DocumentTemplatePreset */

/** @type {DocumentTemplatePreset[]} */
export const DOCUMENT_TEMPLATE_PRESETS = Object.freeze([
  {
    key: "invoice_standard",
    type: "invoice",
    name: "Standard Invoice",
    description: "Line items, tax, and totals — ready for client billing.",
    content: {
      title: "New invoice",
      tax_rate: 15,
      currency: "ZAR",
      items: [
        { description: "Professional services", quantity: 1, unit_price: 0 },
        { description: "Materials / expenses", quantity: 1, unit_price: 0 },
      ],
    },
  },
  {
    key: "quote_standard",
    type: "quote",
    name: "Standard Quote",
    description: "Itemised quote with validity period placeholder.",
    content: {
      title: "New quote",
      tax_rate: 15,
      currency: "ZAR",
      items: [{ description: "Quoted work", quantity: 1, unit_price: 0 }],
    },
  },
  {
    key: "proposal_standard",
    type: "proposal",
    name: "Business Proposal",
    description: "Executive summary, scope, timeline, and pricing sections.",
    content: {
      title: "Business proposal",
      body: "## Executive summary\n\nDescribe the opportunity and your recommended approach.\n\n## Scope\n\n- Deliverable 1\n- Deliverable 2\n\n## Timeline\n\n| Phase | Duration |\n| --- | --- |\n| Discovery | 1 week |\n| Delivery | 2–4 weeks |\n\n## Investment\n\nSummarise pricing or link to a formal quote.",
    },
  },
  {
    key: "contract_standard",
    type: "contract",
    name: "Service Contract",
    description: "Parties, scope, term, payment, and signature blocks.",
    content: {
      title: "Service agreement",
      body: "## Parties\n\nThis agreement is between [Your company] and [Client name].\n\n## Scope of services\n\nDescribe the services to be provided.\n\n## Term\n\nStart date: ___________\nEnd date: ___________\n\n## Fees & payment\n\nPayment terms and schedule.\n\n## Signatures\n\nBoth parties agree to the terms above.",
    },
  },
  {
    key: "job_card_standard",
    type: "job_card",
    name: "Job Card",
    description: "Site visit, tasks, materials, and sign-off checklist.",
    content: {
      title: "Job card",
      body: "## Job details\n\nClient: \nSite: \nDate: \nTechnician: \n\n## Tasks\n\n- [ ] Task 1\n- [ ] Task 2\n\n## Materials used\n\n| Item | Qty |\n| --- | --- |\n| | |\n\n## Sign-off\n\nCompleted by: ___________",
    },
  },
  {
    key: "purchase_order_standard",
    type: "purchase_order",
    name: "Purchase Order",
    description: "Supplier PO with line items and delivery instructions.",
    content: {
      title: "Purchase order",
      tax_rate: 15,
      currency: "ZAR",
      items: [
        { description: "Ordered item", quantity: 1, unit_price: 0 },
        { description: "Shipping / handling", quantity: 1, unit_price: 0 },
      ],
    },
  },
  {
    key: "project_report_standard",
    type: "project_report",
    name: "Project Report",
    description: "Progress, risks, budget snapshot, and next steps.",
    content: {
      title: "Project status report",
      body: "## Summary\n\nOverall status: On track / At risk / Blocked\n\n## Progress this period\n\n- \n\n## Risks & blockers\n\n- \n\n## Budget\n\nPlanned vs actual.\n\n## Next steps\n\n- ",
    },
  },
  {
    key: "nda_standard",
    type: "nda",
    name: "Mutual NDA",
    description: "Confidentiality agreement for client or partner discussions.",
    content: {
      title: "Non-disclosure agreement",
      body: "## Purpose\n\nThe parties wish to explore a business opportunity and may share confidential information.\n\n## Confidential information\n\nDefine what is covered.\n\n## Obligations\n\nEach party agrees not to disclose confidential information except as permitted.\n\n## Term\n\nThis agreement remains in effect for ___ months from the date of signing.",
    },
  },
]);

const PRESET_BY_KEY = new Map(DOCUMENT_TEMPLATE_PRESETS.map((p) => [p.key, p]));

/** @param {string} key */
export function getTemplatePreset(key) {
  return PRESET_BY_KEY.get(String(key || "")) || null;
}

/** Presets grouped by document category for the templates dialog. */
export function presetsByCategory() {
  const groups = new Map();
  for (const preset of DOCUMENT_TEMPLATE_PRESETS) {
    if (!isHubPersistedType(preset.type)) continue;
    const cat = categoryForType(preset.type) || "other";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(preset);
  }
  return groups;
}
