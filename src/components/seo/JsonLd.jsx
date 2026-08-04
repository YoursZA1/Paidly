import { useEffect } from "react";
import { stringifyJsonLd } from "@/lib/seo/structuredData";

/**
 * Injects JSON-LD into document head (Google-recommended format).
 * One script per `id` so route changes replace rather than stack.
 *
 * @param {{ id: string, data: object | null | undefined }} props
 */
export default function JsonLd({ id, data }) {
  useEffect(() => {
    if (typeof document === "undefined" || !id || !data) return;
    const scriptId = `paidly-jsonld-${id}`;
    let el = document.getElementById(scriptId);
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = scriptId;
      document.head.appendChild(el);
    }
    el.textContent = stringifyJsonLd(data);
    return () => {
      el?.parentNode?.removeChild(el);
    };
  }, [id, data]);

  return null;
}
