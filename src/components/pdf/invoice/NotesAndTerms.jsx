import { View, Text } from "@react-pdf/renderer";
import { sanitizeDocumentDisplayText } from "@/utils/documentInvoiceDisplay";

/**
 * @param {{ data: object, styles: object }} props
 */
export function NotesAndTerms({ data, styles }) {
  const notes = sanitizeDocumentDisplayText(data?.notes);
  const terms = sanitizeDocumentDisplayText(data?.paymentTerms);
  if (!notes && !terms) return null;

  return (
    <View style={styles.section}>
      {terms ? (
        <View>
          <Text style={styles.notesTitle}>Terms</Text>
          <Text style={styles.notesText}>{terms}</Text>
        </View>
      ) : null}
      {notes ? (
        <View>
          <Text style={styles.notesTitle}>Notes</Text>
          <Text style={styles.notesText}>{notes}</Text>
        </View>
      ) : null}
    </View>
  );
}
