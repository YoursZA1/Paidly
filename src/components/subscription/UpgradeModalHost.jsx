import { useUpgradeModalStore } from "@/stores/useUpgradeModalStore";
import UpgradeModal from "./UpgradeModal";

/** Mount once (e.g. in `App.jsx`) so any screen can open the upgrade flow via the store. */
export default function UpgradeModalHost() {
  const open = useUpgradeModalStore((s) => s.open);
  const featureKey = useUpgradeModalStore((s) => s.featureKey);
  const title = useUpgradeModalStore((s) => s.title);
  const description = useUpgradeModalStore((s) => s.description);
  const closeUpgradeModal = useUpgradeModalStore((s) => s.closeUpgradeModal);

  return (
    <UpgradeModal
      open={open}
      onOpenChange={(next) => {
        if (!next) closeUpgradeModal();
      }}
      featureKey={featureKey}
      title={title}
      description={description}
    />
  );
}
