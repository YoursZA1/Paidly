import { describe, expect, it } from "vitest";
import {
  buildHomeStructuredDataGraph,
  buildHowToStructuredData,
  stringifyJsonLd,
  ORG_ID,
  WEBSITE_ID,
  APP_ID,
} from "@/lib/seo/structuredData";

describe("structuredData (Google SD policies)", () => {
  it("builds a home @graph with Organization, WebSite, and WebApplication", () => {
    const graph = buildHomeStructuredDataGraph();
    expect(graph["@context"]).toBe("https://schema.org");
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("WebSite");
    expect(types).toContain("WebPage");
    expect(graph["@graph"].some((n) => n["@id"] === ORG_ID)).toBe(true);
    expect(graph["@graph"].some((n) => n["@id"] === WEBSITE_ID)).toBe(true);
    expect(graph["@graph"].some((n) => n["@id"] === APP_ID)).toBe(true);
  });

  it("never fabricates AggregateRating or Review (quality guideline)", () => {
    const raw = JSON.stringify(buildHomeStructuredDataGraph());
    expect(raw).not.toMatch(/AggregateRating/);
    expect(raw).not.toMatch(/"@type":"Review"/);
  });

  it("offers match shared plan prices in ZAR", () => {
    const app = buildHomeStructuredDataGraph()["@graph"].find((n) => n["@id"] === APP_ID);
    const prices = app.offers.map((o) => o.price).sort();
    expect(prices).toEqual(["150", "350", "50"]);
    expect(app.offers.every((o) => o.priceCurrency === "ZAR")).toBe(true);
  });

  it("builds HowTo steps from visible quick-start copy", () => {
    const data = buildHowToStructuredData([
      { name: "Create your account", text: "Sign up with email." },
      { name: "Set up your business profile", text: "Add company name." },
    ]);
    expect(data["@type"]).toBe("HowTo");
    expect(data.step).toHaveLength(2);
    expect(data.step[0].position).toBe(1);
    expect(data.step[0].name).toBe("Create your account");
  });

  it("escapes < in JSON-LD stringification", () => {
    expect(stringifyJsonLd({ a: "<script>" })).toContain("\\u003cscript>");
  });
});
