const BRAND = "#f24e00";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buttonColors(variant) {
  if (variant === "outline") {
    return { bg: "#ffffff", color: BRAND, border: `border:1px solid ${BRAND};` };
  }
  if (variant === "danger") {
    return { bg: "#ffffff", color: "#b91c1c", border: "border:1px solid #b91c1c;" };
  }
  return { bg: BRAND, color: "#ffffff", border: "border:0;" };
}

/** One inbox-safe button. Empty when the link is missing. */
export function emailButton(href, label, variant = "primary") {
  const url = String(href || "").trim();
  if (!url) return "";
  const { bg, color, border } = buttonColors(variant);
  return `<td style="padding:0 8px 8px 0;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="border-radius:8px;background-color:${bg};${border}">
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 18px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${color};text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>
  </td>`;
}

export function emailButtonRow(buttons) {
  const cells = (buttons || []).map((button) => emailButton(button.href, button.label, button.variant)).filter(Boolean).join("");
  if (!cells) return "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 8px;"><tr>${cells}</tr></table>`;
}
