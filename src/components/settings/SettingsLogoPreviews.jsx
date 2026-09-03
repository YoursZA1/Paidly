import PropTypes from "prop-types";
import { Image as ImageIcon } from "lucide-react";
import LogoImage from "@/components/shared/LogoImage";

/**
 * Single Business Logo preview. One canonical logo — not three separate settings.
 */
export default function SettingsLogoPreviews({ businessLogoUrl }) {
  return (
    <div className="text-center md:text-left">
      <div className="mx-auto md:mx-0 w-24 h-24 rounded-xl bg-background border border-border flex items-center justify-center overflow-hidden">
        {businessLogoUrl ? (
          businessLogoUrl.startsWith("blob:") ? (
            <img src={businessLogoUrl} alt="Business Logo" className="object-contain w-16 h-16" />
          ) : (
            <LogoImage src={businessLogoUrl} alt="Business Logo" className="object-contain w-16 h-16" preferSignedUrl />
          )
        ) : (
          <ImageIcon className="w-8 h-8 text-muted-foreground" />
        )}
      </div>
      <p className="text-xs font-medium text-foreground mt-2">Business Logo</p>
      <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[14rem]">
        Used on: Profile · Documents · POS
      </p>
    </div>
  );
}

SettingsLogoPreviews.propTypes = {
  businessLogoUrl: PropTypes.string,
};
