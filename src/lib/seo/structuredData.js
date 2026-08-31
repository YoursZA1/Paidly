/**
 * JSON-LD builders aligned with Google Search structured data policies:
 * https://developers.google.com/search/docs/appearance/structured-data/sd-policies
 *
 * Rules we follow:
 * - JSON-LD format (Google-recommended)
 * - Markup mirrors user-visible page content only
 * - No fabricated AggregateRating / Review (SocialProof is persona copy, not ratings)
 * - Most specific applicable types; nested @graph with stable @id links
 * - Offers match the visible Pricing section (ZAR amounts from shared plans)
 */
import { PLANS, PUBLIC_SELF_SERVE_MONTHLY_SLUGS } from "@shared/plans.js";
import { PAIDLY_SITE_ORIGIN, absoluteUrl } from "@/lib/seo/siteOrigin.js";

export const ORG_ID = `${PAIDLY_SITE_ORIGIN}/#organization`;
export const WEBSITE_ID = `${PAIDLY_SITE_ORIGIN}/#website`;
export const APP_ID = `${PAIDLY_SITE_ORIGIN}/#webapp`;

const SITE_DESCRIPTION =
  "Paidly — Invoicing and cash flow for small businesses. Create invoices, track payments, and manage your business in one place.";

/**
 * Organization + WebSite for the marketing home page (site name eligibility).
 * Safe without review data; matches visible brand + meta description.
 */
export function buildHomeStructuredDataGraph() {
  const logoUrl = absoluteUrl("/logo_icon.svg");

  const organization = {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Paidly",
    url: absoluteUrl("/"),
    logo: {
      "@type": "ImageObject",
      url: logoUrl,
    },
    description: SITE_DESCRIPTION,
  };

  const website = {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: "Paidly",
    alternateName: ["Paidly Invoice", "Paidly Invoicing"],
    url: absoluteUrl("/"),
    description: SITE_DESCRIPTION,
    publisher: { "@id": ORG_ID },
    inLanguage: "en-ZA",
  };

  // WebApplication + offers that mirror the Pricing section. No AggregateRating —
  // fabricating reviews violates Google's quality guidelines / spam policies.
  const offers = PUBLIC_SELF_SERVE_MONTHLY_SLUGS.map((slug) => {
    const plan = PLANS[slug];
    return {
      "@type": "Offer",
      name: plan.name,
      price: String(plan.price),
      priceCurrency: "ZAR",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: String(plan.price),
        priceCurrency: "ZAR",
        billingDuration: "P1M",
      },
      availability: "https://schema.org/InStock",
      url: `${absoluteUrl("/")}#pricing`,
    };
  });

  const webApp = {
    "@type": ["SoftwareApplication", "WebApplication"],
    "@id": APP_ID,
    name: "Paidly",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    browserRequirements: "Requires JavaScript. Requires HTML5.",
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
    image: logoUrl,
    offers,
    publisher: { "@id": ORG_ID },
    featureList: [
      "Invoices",
      "Quotes",
      "Client management",
      "Payment tracking",
      "Email delivery",
      "Reports",
    ],
  };

  const webPage = {
    "@type": "WebPage",
    "@id": `${absoluteUrl("/")}#webpage`,
    url: absoluteUrl("/"),
    name: "Paidly — Invoicing for small business",
    description: SITE_DESCRIPTION,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": APP_ID },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: logoUrl,
    },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organization, website, webApp, webPage],
  };
}

/**
 * HowTo markup for /HowTo — steps must match the visible Quick start content.
 * @param {{ name: string, text: string }[]} steps
 */
export function buildHowToStructuredData(steps) {
  const list = Array.isArray(steps) ? steps.filter((s) => s?.name && s?.text) : [];
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to get started with Paidly",
    description:
      "Create your account, set up your business profile, and add banking details so you can send professional invoices.",
    url: absoluteUrl("/HowTo"),
    inLanguage: "en-ZA",
    step: list.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

/** Serialize for `<script type="application/ld+json">` (escapes `<` for HTML safety). */
export function stringifyJsonLd(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
