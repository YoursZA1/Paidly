import PropTypes from "prop-types";
import { FileText, Image as ImageIcon, User as UserIcon } from "lucide-react";
import LogoImage from "@/components/shared/LogoImage";

function PreviewFrame({ label, shape, logoUrl }) {
  const isRound = shape === "round";
  const frameClass = isRound
    ? "w-20 h-20 rounded-full"
    : "w-20 h-20 rounded-lg";
  const imgClass = isRound ? "object-cover w-full h-full" : "object-contain w-12 h-12";

  return (
    <div className="text-center">
      <div
        className={`${frameClass} bg-background border border-border flex items-center justify-center overflow-hidden`}
      >
        {logoUrl ? (
          logoUrl.startsWith("blob:") ? (
            <img src={logoUrl} alt={label} className={imgClass} />
          ) : (
            <LogoImage src={logoUrl} alt={label} className={imgClass} preflightStorage />
          )
        ) : isRound ? (
          <UserIcon className="w-10 h-10 text-muted-foreground" />
        ) : shape === "quote" ? (
          <FileText className="w-6 h-6 text-muted-foreground" />
        ) : (
          <ImageIcon className="w-6 h-6 text-muted-foreground" />
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

PreviewFrame.propTypes = {
  label: PropTypes.string.isRequired,
  shape: PropTypes.oneOf(["round", "square", "quote"]).isRequired,
  logoUrl: PropTypes.string,
};

export default function SettingsLogoPreviews({ logoUrl }) {
  return (
    <div className="flex flex-wrap justify-center gap-4 md:justify-start">
      <PreviewFrame label="Profile" shape="round" logoUrl={logoUrl} />
      <PreviewFrame label="Invoice" shape="square" logoUrl={logoUrl} />
      <PreviewFrame label="Quote" shape="quote" logoUrl={logoUrl} />
    </div>
  );
}

SettingsLogoPreviews.propTypes = {
  logoUrl: PropTypes.string,
};
