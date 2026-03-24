import PropTypes from "prop-types";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, FileText, Download } from "lucide-react";
import { motion } from "framer-motion";
import { createPageUrl } from "@/utils";
import { writeQuoteDraft } from "@/utils/invoiceDraftStorage";
import DocumentPreview from "@/components/DocumentPreview";
import { recordToStyledPreviewDoc, profileForQuotePreview } from "@/utils/documentPreviewData";
import { clientPropType, quoteDataPropType } from "../invoice/propTypes";

export default function QuotePreview({
  quoteData,
  clients,
  onPrevious,
  onCreate,
  onClose,
  showBack = true,
  user,
  loading = false,
  previewOnly = false,
  onTotalClick: _onTotalClick,
}) {
  const clientList = Array.isArray(clients) ? clients : [];
  const client = clientList.find((c) => c.id === quoteData?.client_id) ?? null;

  const profile = useMemo(() => profileForQuotePreview(quoteData, user), [quoteData, user]);

  const previewDoc = useMemo(
    () => (quoteData ? recordToStyledPreviewDoc(quoteData, client, "quote", profile) : null),
    [quoteData, client, profile]
  );

  const handleDownloadPDF = () => {
    try {
      writeQuoteDraft({
        quoteData: {
          ...quoteData,
          quote_number: quoteData.quote_number || "Draft",
        },
        client: client || {},
        user: user || {},
      });
      window.open(createPageUrl("QuotePDF") + "?draft=1", "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("Failed to open PDF preview:", e);
    }
  };

  if (!quoteData) {
    return (
      <Card className="border-border">
        <CardContent className="p-6">
          <p className="text-destructive text-sm">Quote data is missing.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-card/80 backdrop-blur-sm border-0 shadow-xl overflow-x-auto">
        <CardHeader className="border-b border-border pb-6">
          <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {previewOnly ? "Quote" : "Quote Preview"}
          </CardTitle>
          {!previewOnly && (
            <p className="text-muted-foreground mt-2 text-sm">
              Review all details before creating your professional quote
            </p>
          )}
          {previewOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPDF}
              className="mt-3 rounded-xl border-border bg-card text-foreground hover:bg-muted"
            >
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-4 sm:p-6 lg:p-8 pt-4">
          {previewDoc ? (
            <DocumentPreview doc={previewDoc} docType="quote" clients={clientList} user={profile} />
          ) : null}

          <div
            className={`flex ${showBack && !previewOnly ? "justify-between" : "justify-end"} mt-6 sm:mt-8 gap-3`}
          >
            {showBack && !previewOnly && (
              <Button
                onClick={onPrevious}
                variant="outline"
                className="w-full sm:w-auto px-8 py-3 rounded-xl border-border hover:bg-muted"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
            {previewOnly && onClose && (
              <Button
                onClick={onClose}
                variant="outline"
                className="w-full sm:w-auto px-8 py-3 rounded-xl border-border hover:bg-muted"
              >
                Close Preview
              </Button>
            )}
            {!previewOnly && (
              <Button
                onClick={onCreate}
                disabled={loading}
                className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <motion.div
                      className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full inline-block"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Create Quote
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

QuotePreview.propTypes = {
  quoteData: quoteDataPropType.isRequired,
  clients: PropTypes.arrayOf(clientPropType),
  onPrevious: PropTypes.func,
  onCreate: PropTypes.func,
  onClose: PropTypes.func,
  showBack: PropTypes.bool,
  user: PropTypes.object,
  loading: PropTypes.bool,
  previewOnly: PropTypes.bool,
  onTotalClick: PropTypes.func,
};
