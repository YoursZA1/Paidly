import { Download } from "lucide-react";
import PropTypes from "prop-types";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/**
 * Account menu row — only when the browser can show a native install prompt.
 * Hidden when already installed (standalone) or when only manual/iOS instructions apply.
 */
export default function InstallPaidlyMenuItem({ onAfterClick }) {
  const { canInstall, install } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={() => {
        void install();
        onAfterClick?.();
      }}
    >
      <Download className="mr-2 size-4" aria-hidden />
      Install Paidly
    </DropdownMenuItem>
  );
}

InstallPaidlyMenuItem.propTypes = {
  onAfterClick: PropTypes.func,
};
