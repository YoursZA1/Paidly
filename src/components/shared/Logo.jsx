import { getLogoUrl } from "@/lib/logoUrl";

const DEFAULT_LOGO_SRC = "/default-logo.png";
const SECONDARY_FALLBACK_SRC = "/logo.svg";

export default function Logo({ path, className = "", alt = "Logo" }) {
  const url = getLogoUrl(path);

  return (
    <img
      src={url || DEFAULT_LOGO_SRC}
      alt={alt}
      className={className}
      onError={(e) => {
        if (e.currentTarget.src.includes(DEFAULT_LOGO_SRC)) {
          e.currentTarget.src = SECONDARY_FALLBACK_SRC;
          return;
        }
        e.currentTarget.src = DEFAULT_LOGO_SRC;
      }}
    />
  );
}
