/**
 * Anvil HTML → PDF (server-side only).
 * Set ANVIL_API_TOKEN in server/.env (see https://www.useanvil.com/docs/api/generate-pdf).
 */
import Anvil from "@anvilco/anvil";

export function getAnvilClient() {
  const apiKey = (process.env.ANVIL_API_TOKEN || "").trim();
  if (!apiKey) return null;
  return new Anvil({ apiKey });
}

/**
 * @param {InstanceType<typeof Anvil>} client
 * @param {{ html: string, css: string, title: string, page: Record<string, string> }} opts
 */
export async function generateHtmlPdfBuffer(client, { html, css, title, page }) {
  const payload = {
    type: "html",
    title,
    data: {
      html,
      css: css || "",
    },
    page,
  };

  const { statusCode, data, errors } = await client.generatePDF(payload);

  if (statusCode === 200 && data != null) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return { ok: true, buffer };
  }

  const detail =
    errors != null
      ? JSON.stringify(errors).slice(0, 2000)
      : typeof data === "string"
        ? data.slice(0, 2000)
        : "Unknown Anvil error";

  return { ok: false, statusCode: statusCode || 500, message: detail };
}
