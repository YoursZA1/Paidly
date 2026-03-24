import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton for the invoice preview while data loads.
 * Mirrors DocumentPreview: top accent bar, header, bill-to + dates, table, solid total bar.
 */
export default function InvoicePreviewSkeleton() {
  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden">
      <CardHeader className="border-b border-border pb-4 sm:pb-6 px-4 sm:px-6">
        <Skeleton className="h-6 w-44 rounded" />
        <Skeleton className="h-4 w-64 mt-2 rounded" />
      </CardHeader>
      <CardContent className="p-0 overflow-x-hidden">
        <div className="bg-white text-foreground">
          <Skeleton className="h-1.5 w-full rounded-none bg-primary/80" />
          <div className="p-8 sm:p-12 sm:px-14">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-6 mb-10">
              <div className="space-y-3">
                <Skeleton className="h-20 w-40 rounded-lg" />
                <Skeleton className="h-3 w-48 rounded" />
                <Skeleton className="h-3 w-56 rounded" />
              </div>
              <div className="space-y-2 sm:text-right">
                <Skeleton className="h-9 w-36 sm:ml-auto rounded" />
                <Skeleton className="h-4 w-24 sm:ml-auto rounded" />
                <Skeleton className="h-6 w-28 sm:ml-auto rounded-full" />
              </div>
            </div>
            <Skeleton className="h-px w-full mb-8 bg-border" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
              <div className="space-y-2">
                <Skeleton className="h-3 w-14 rounded" />
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-full max-w-xs rounded" />
              </div>
              <div className="space-y-3 sm:text-right">
                <Skeleton className="h-3 w-20 sm:ml-auto rounded" />
                <Skeleton className="h-4 w-36 sm:ml-auto rounded" />
                <Skeleton className="h-3 w-20 sm:ml-auto rounded" />
                <Skeleton className="h-4 w-36 sm:ml-auto rounded" />
              </div>
            </div>
            <div className="rounded-lg overflow-hidden border border-border mb-8">
              <div className="bg-[#0f172a] px-4 py-3 flex gap-4">
                <Skeleton className="h-3 flex-1 rounded bg-slate-500" />
                <Skeleton className="h-3 w-10 rounded bg-slate-500" />
                <Skeleton className="h-3 w-20 rounded bg-slate-500" />
                <Skeleton className="h-3 w-20 rounded bg-slate-500" />
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4 px-4 py-3.5 border-t border-border">
                  <Skeleton className="h-4 flex-1 rounded" />
                  <Skeleton className="h-4 w-8 rounded" />
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="h-4 w-20 rounded" />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <div className="w-full max-w-[280px] rounded-[10px] bg-primary p-4 flex justify-between items-center">
                <Skeleton className="h-4 w-24 rounded bg-white/40" />
                <Skeleton className="h-6 w-28 rounded bg-white/50" />
              </div>
            </div>
          </div>
          <Skeleton className="h-1 w-full rounded-none bg-primary/80" />
        </div>
      </CardContent>
    </Card>
  );
}
