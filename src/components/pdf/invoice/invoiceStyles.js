import { StyleSheet } from "@react-pdf/renderer";
import { colours, dimensions, spacing, typography } from "./documentTheme";

/**
 * @param {{ accent: string }} theme
 */
export function createInvoiceStyles(theme) {
  const accent = theme?.accent || colours.text;
  return StyleSheet.create({
    page: {
      paddingTop: dimensions.pagePadding,
      paddingHorizontal: dimensions.pagePadding,
      paddingBottom: dimensions.pagePaddingBottom,
      fontSize: typography.body,
      fontFamily: "Helvetica",
      color: colours.text,
      backgroundColor: colours.background,
    },

    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: spacing.xl,
      paddingBottom: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colours.border,
      borderBottomStyle: "solid",
    },
    headerLeft: {
      width: "54%",
      paddingRight: spacing.md,
    },
    headerRight: {
      width: "44%",
      alignItems: "flex-end",
    },
    logo: {
      maxWidth: dimensions.logoMaxWidth,
      maxHeight: dimensions.logoMaxHeight,
      marginBottom: spacing.sm,
      objectFit: "contain",
    },
    brandName: {
      fontSize: 14,
      fontFamily: "Helvetica-Bold",
      color: colours.text,
      marginBottom: spacing.xs,
    },
    issuerLine: {
      fontSize: typography.metaValue,
      color: colours.textSecondary,
      lineHeight: 1.4,
      marginBottom: 1,
    },
    invoiceTitle: {
      fontSize: typography.title,
      fontFamily: "Helvetica-Bold",
      color: colours.text,
      letterSpacing: 1.2,
      textAlign: "right",
      marginBottom: spacing.xs,
    },
    invoiceNumber: {
      fontSize: typography.invoiceNumber,
      fontFamily: "Helvetica-Bold",
      color: colours.text,
      textAlign: "right",
      marginBottom: spacing.md,
    },
    metaRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 3,
      width: "100%",
    },
    metaLabel: {
      fontSize: typography.metaLabel,
      color: colours.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginRight: spacing.sm,
      textAlign: "right",
    },
    metaValue: {
      fontSize: typography.metaValue,
      color: colours.text,
      textAlign: "right",
      minWidth: 88,
    },
    statusText: {
      marginTop: spacing.sm,
      fontSize: typography.metaLabel,
      fontFamily: "Helvetica-Bold",
      color: colours.textSecondary,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      textAlign: "right",
    },

    section: {
      marginBottom: spacing.xl,
    },
    sectionLabel: {
      fontSize: typography.section,
      fontFamily: "Helvetica-Bold",
      color: accent,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: spacing.sm,
    },
    clientName: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: colours.text,
      marginBottom: 2,
    },
    clientLine: {
      fontSize: typography.body,
      color: colours.textSecondary,
      lineHeight: 1.4,
      marginBottom: 1,
    },

    table: {
      width: "100%",
      marginBottom: spacing.lg,
    },
    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colours.tableHeaderBg,
      borderBottomWidth: 1,
      borderBottomColor: colours.borderStrong,
      borderBottomStyle: "solid",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    tableHeaderText: {
      fontSize: typography.section,
      fontFamily: "Helvetica-Bold",
      color: colours.textSecondary,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    tableRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colours.border,
      borderBottomStyle: "solid",
    },
    colDesc: { width: "48%", paddingRight: spacing.sm },
    colQty: { width: "12%", textAlign: "right" },
    colRate: { width: "20%", textAlign: "right" },
    colTotal: { width: "20%", textAlign: "right" },
    colDescWide: { width: "48%", paddingRight: spacing.sm },
    tableCell: {
      fontSize: typography.table,
      color: colours.text,
      lineHeight: 1.35,
    },
    tableCellMuted: {
      fontSize: typography.table,
      color: colours.textSecondary,
    },
    emptyItems: {
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.sm,
      fontSize: typography.body,
      color: colours.textMuted,
    },

    totalsWrap: {
      alignItems: "flex-end",
      marginBottom: spacing.xl,
      marginTop: spacing.sm,
    },
    totalsBox: {
      width: 220,
    },
    totalsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    totalsLabel: {
      fontSize: typography.body,
      color: colours.textSecondary,
    },
    totalsValue: {
      fontSize: typography.body,
      color: colours.text,
      textAlign: "right",
    },
    totalsDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colours.borderStrong,
      borderBottomStyle: "solid",
      marginVertical: spacing.sm,
    },
    totalsDueRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      paddingTop: spacing.xs,
    },
    totalsDueLabel: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: colours.text,
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    totalsDueValue: {
      fontSize: typography.total,
      fontFamily: "Helvetica-Bold",
      color: accent,
      textAlign: "right",
    },
    totalsSubRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: spacing.sm,
    },

    paymentRow: {
      flexDirection: "row",
      marginBottom: spacing.sm,
    },
    paymentLabel: {
      width: "38%",
      fontSize: typography.metaLabel,
      color: colours.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      paddingRight: spacing.sm,
    },
    paymentValue: {
      width: "62%",
      fontSize: typography.body,
      color: colours.text,
      lineHeight: 1.35,
    },

    notesTitle: {
      fontSize: typography.section,
      fontFamily: "Helvetica-Bold",
      color: colours.textSecondary,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: spacing.xs,
    },
    notesText: {
      fontSize: typography.body,
      color: colours.textSecondary,
      lineHeight: 1.45,
      marginBottom: spacing.md,
    },

    pageFooter: {
      position: "absolute",
      left: dimensions.pagePadding,
      right: dimensions.pagePadding,
      bottom: 18,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: colours.border,
      borderTopStyle: "solid",
      paddingTop: spacing.sm,
    },
    footerText: {
      fontSize: typography.footer,
      color: colours.textMuted,
    },
    footerBrand: {
      fontSize: typography.footer,
      color: colours.textMuted,
    },
  });
}
