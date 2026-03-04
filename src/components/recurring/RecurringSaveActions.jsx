import { Button } from "@/components/ui/button";
import { Loader2, Save, Zap } from "lucide-react";
import PropTypes from "prop-types";

export default function RecurringSaveActions({
    onSaveDraft,
    onActivateNow,
    loading = false,
    disabled = false,
    buttonText = {
        draft: "Save as Draft",
        activate: "Activate Now",
    },
}) {
    return (
        <div className="flex gap-3 flex-col sm:flex-row">
            <Button
                onClick={onSaveDraft}
                disabled={disabled || loading}
                variant="outline"
                className="px-6 py-3 rounded-xl border-slate-200 hover:bg-slate-50"
            >
                {loading ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                    </>
                ) : (
                    <>
                        <Save className="w-4 h-4 mr-2" />
                        {buttonText.draft}
                    </>
                )}
            </Button>
            <Button
                onClick={onActivateNow}
                disabled={disabled || loading}
                className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white"
            >
                {loading ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                    </>
                ) : (
                    <>
                        <Zap className="w-4 h-4 mr-2" />
                        {buttonText.activate}
                    </>
                )}
            </Button>
        </div>
    );
}

RecurringSaveActions.propTypes = {
    onSaveDraft: PropTypes.func.isRequired,
    onActivateNow: PropTypes.func.isRequired,
    loading: PropTypes.bool,
    disabled: PropTypes.bool,
    buttonText: PropTypes.shape({
        draft: PropTypes.string,
        activate: PropTypes.string,
    }),
};
