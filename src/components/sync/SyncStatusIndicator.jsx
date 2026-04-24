import { RefreshCw, UploadCloud } from "lucide-react";
import { useSyncQueueStore } from "@/stores/useSyncQueueStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function SyncStatusIndicator({ className }) {
  const queue = useSyncQueueStore((s) => s.queue);
  const retryAllFailed = useSyncQueueStore((s) => s.retryAllFailed);

  const queuedCount = queue.filter((j) => j.status === "pending" || j.status === "processing").length;
  const failedCount = queue.filter((j) => j.status === "failed").length;

  if (queuedCount === 0 && failedCount === 0) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium",
        failedCount > 0
          ? "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200"
          : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <UploadCloud className="h-3.5 w-3.5" aria-hidden />
      {queuedCount > 0 ? `${queuedCount} queued` : `${failedCount} failed`}
      {failedCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-inherit hover:bg-black/10 dark:hover:bg-white/10"
          onClick={retryAllFailed}
          title="Retry failed sync jobs"
        >
          <RefreshCw className="h-3 w-3" />
          <span className="sr-only">Retry failed sync jobs</span>
        </Button>
      ) : null}
    </div>
  );
}

