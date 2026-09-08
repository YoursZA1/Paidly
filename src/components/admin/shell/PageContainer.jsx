import PageHeader from "@/components/dashboard/PageHeader";
import { cn } from "@/lib/utils";

export default function PageContainer({
  title,
  description,
  action,
  onRefresh,
  isRefreshing,
  children,
  className,
}) {
  return (
    <div className={cn("mx-auto max-w-[1400px]", className)}>
      {title ? (
        <PageHeader title={title} description={description} onRefresh={onRefresh} isRefreshing={isRefreshing}>
          {action}
        </PageHeader>
      ) : null}
      {children}
    </div>
  );
}
