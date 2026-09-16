/**
 * PDF-only design tokens for the premium invoice document.
 * Accent comes from document brand hex; fallbacks match DocumentPreview defaults.
 */
import {
  DEFAULT_DOCUMENT_BRAND_PRIMARY,
  parseDocumentBrandHex,
} from "@/utils/documentBrandColors";

export const spacing = Object.freeze({
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
});

export const typography = Object.freeze({
  title: 26,
  invoiceNumber: 13,
  section: 8.5,
  body: 9.5,
  table: 9,
  total: 18,
  footer: 7.5,
  metaLabel: 8,
  metaValue: 9.5,
});

export const colours = Object.freeze({
  text: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  border: "#e5e7eb",
  borderStrong: "#d1d5db",
  background: "#ffffff",
  tableHeaderBg: "#f9fafb",
  white: "#ffffff",
});

export const dimensions = Object.freeze({
  pagePadding: 40,
  pagePaddingBottom: 56,
  logoMaxWidth: 140,
  logoMaxHeight: 48,
  footerHeight: 36,
});

/**
 * @param {string|null|undefined} brandPrimaryHex
 * @returns {{ accent: string, text: string, textSecondary: string, textMuted: string, border: string, borderStrong: string, background: string, tableHeaderBg: string }}
 */
export function createDocumentTheme(brandPrimaryHex) {
  const accent =
    parseDocumentBrandHex(brandPrimaryHex) ?? DEFAULT_DOCUMENT_BRAND_PRIMARY;
  return {
    accent,
    text: colours.text,
    textSecondary: colours.textSecondary,
    textMuted: colours.textMuted,
    border: colours.border,
    borderStrong: colours.borderStrong,
    background: colours.background,
    tableHeaderBg: colours.tableHeaderBg,
  };
}
