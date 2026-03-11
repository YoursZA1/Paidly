import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton for the invoice preview area to improve perceived performance
 * (e.g. cold start, slow network). Matches InvoicePreview layout: header, table, footer.
 */
export default function InvoicePreviewSkeleton() {
  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl overflow-hidden">
      <CardHeader className="border-b border-border pb-4 sm:pb-6 px-4 sm:px-6">
        <div className="flex justify-center mb-3 sm:mb-4">
          <Skeleton className="h-12 w-24 rounded" />
        </div>
        <Skeleton className="h-6 w-40 rounded" />
        <Skeleton className="h-4 w-64 mt-2 rounded" />
      </CardHeader>
      <CardContent className="p-0 overflow-x-hidden">
        <div className="relative w-full max-w-[800px] mx-auto bg-white border border-slate-100 min-h-[600px] sm:min-h-[1000px] flex flex-col">
          <div className="relative z-10 flex flex-col flex-1 p-[48px]">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:justify-between gap-4 pb-6 sm:pb-10 border-b border-slate-100">
              <div className="space-y-2">
                <Skeleton className="h-10 w-32 rounded" />
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-3 w-48 rounded" />
              </div>
              <div className="space-y-2 text-right">
                <Skeleton className="h-8 w-24 ml-auto rounded" />
                <Skeleton className="h-4 w-28 ml-auto rounded" />
                <Skeleton className="h-4 w-20 ml-auto rounded" />
              </div>
            </div>
            {/* Bill to / client */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 sm:py-8">
              <div className="space-y-2">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-48 rounded" />
              </div>
            </div>
            {/* Table */}
            <div className="rounded-lg border border-slate-200 mb-4 sm:mb-8 overflow-hidden">
              <div className="bg-slate-100 border-b border-slate-200 px-4 py-3 flex gap-4">
                <Skeleton className="h-4 flex-1 rounded" />
                <Skeleton className="h-4 w-12 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
              </div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4 px-4 py-4 border-b border-slate-100 last:border-0">
                  <Skeleton className="h-4 flex-1 rounded" />
                  <Skeleton className="h-4 w-8 rounded" />
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="h-4 w-20 rounded" />
                </div>
              ))}
            </div>
          </div>
          {/* Footer */}
          <div className="p-[48px] bg-slate-900">
            <div className="flex flex-col sm:flex-row justify-between gap-6">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24 rounded bg-slate-700" />
                <Skeleton className="h-4 w-36 rounded bg-slate-700" />
                <Skeleton className="h-3 w-44 rounded bg-slate-700" />
              </div>
              <div className="text-right space-y-1">
                <Skeleton className="h-4 w-24 ml-auto rounded bg-slate-700" />
                <Skeleton className="h-10 w-32 ml-auto rounded bg-slate-700 mt-2" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
