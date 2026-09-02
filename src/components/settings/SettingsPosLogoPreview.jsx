import PropTypes from "prop-types";
import { Store } from "lucide-react";
import LogoImage from "@/components/shared/LogoImage";

/**
 * POS Logo preview. When no POS logo is set, shows the Business Logo fallback.
 */
export default function SettingsPosLogoPreview({ posLogoUrl, businessLogoUrl }) {
  const previewUrl = posLogoUrl || businessLogoUrl || "";
  const usingFallback = !posLogoUrl && !!businessLogoUrl;

  return (
    <div className="text-center md:text-left">
      <div className="mx-auto md:mx-0 w-24 h-24 rounded-xl bg-background border border-border flex items-center justify-center overflow-hidden">
        {previewUrl ? (
          previewUrl.startsWith("blob:") ? (
            <img src={previewUrl} alt="POS Logo" className="object-contain w-16 h-16" />
          ) : (
            <LogoImage src={previewUrl} alt="POS Logo" className="object-contain w-16 h-16" preflightStorage />
          )
        ) : (
          <Store className="w-8 h-8 text-muted-foreground" />
        )}
      </div>
      <p className="text-xs font-medium text-foreground mt-2">POS Logo</p>
      <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[14rem]">
        {usingFallback
          ? "Using Business Logo until you upload a POS logo."
          : "Used on: POS · Till · POS receipts"}
      </p>
    </div>
  );
}

SettingsPosLogoPreview.propTypes = {
  posLogoUrl: PropTypes.string,
  businessLogoUrl: PropTypes.string,
};
