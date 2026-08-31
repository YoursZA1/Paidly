import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

export default function InstallButton({ className }) {
  const { canInstall, install } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <Button onClick={() => void install()} variant="outline" className={className}>
      <Download className="w-4 h-4 mr-2" />
      Install App
    </Button>
  );
}
