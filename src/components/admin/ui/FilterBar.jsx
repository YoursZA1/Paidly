import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function FilterBar({ search, onSearch, placeholder = "Search", children, className }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
      <Input
        value={search}
        onChange={(e) => onSearch?.(e.target.value)}
        placeholder={placeholder}
        className="h-10 max-w-sm rounded-xl"
      />
      {children}
    </div>
  );
}
