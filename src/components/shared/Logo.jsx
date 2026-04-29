import AssetService from "@/services/AssetService";

const DEFAULT_LOGO_SRC = AssetService.FALLBACK_LOGO;

export default function Logo({ path, className = "", alt = "Logo" }) {
  const url = AssetService.getLogo(path);

  return (
    <img
      src={url || DEFAULT_LOGO_SRC}
      alt={alt}
      className={className}
      onError={(e) => {
        e.currentTarget.src = DEFAULT_LOGO_SRC;
      }}
    />
  );
}
