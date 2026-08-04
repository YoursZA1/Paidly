# Paidly — Structured data (JSON-LD)

Follows Google’s **General Structured Data Guidelines**:
https://developers.google.com/search/docs/appearance/structured-data/sd-policies

## Principles we enforce

| Policy | Paidly practice |
|--------|-----------------|
| JSON-LD (recommended) | `application/ld+json` in `index.html` + `JsonLd` on marketing routes |
| Don’t block crawlers | `public/robots.txt` allows Googlebot; no `noindex` on marketing home |
| Visible content only | Markup mirrors Hero / Pricing / How-to copy |
| No misleading reviews | **No** `AggregateRating` / fake `Review` (SocialProof is persona copy) |
| Relevance | Home = Organization + WebSite + WebApplication; `/HowTo` = HowTo |
| Completeness | Offers match Individual / SME / Corporate ZAR prices from `@shared/plans.js` |

Google does **not** guarantee rich results even when markup is valid.

## Where it lives

- Static homepage graph: `index.html` (crawlable before JS)
- Builders: `src/lib/seo/structuredData.js`
- Injector: `src/components/seo/JsonLd.jsx`
- Home / HowTo pages mount `JsonLd`

## Validate

Use [Rich Results Test](https://search.google.com/test/rich-results) and Search Console URL Inspection on `https://www.paidly.co.za/`.
