import { useSessionHealth } from "@/hooks/useSessionHealth";
import { cn } from "@/lib/utils";

export default function SessionIndicator({ className }) {
  const { status } = useSessionHealth();

  if (status === "connected") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs",
          className
        )}
      >
        <span className="w-2 h-2 bg-green-400 rounded-full" />
        Connected
      </div>
    );
  }

  if (status === "reconnecting") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-xs",
          className
        )}
      >
        <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
        Reconnecting...
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs",
          className
        )}
      >
        <span className="w-2 h-2 bg-red-400 rounded-full" />
        Session expired
      </div>
    );
  }

  return null;
}

