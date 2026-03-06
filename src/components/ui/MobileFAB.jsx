import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { createPageUrl } from "@/utils";

function MobileFAB() {
  return (
    <Link
      to={createPageUrl("CreateInvoice")}
      className="md:hidden fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all touch-manipulation"
      aria-label="Quick create invoice"
    >
      <Plus className="size-7" strokeWidth={2.5} />
    </Link>
  );
}

export default MobileFAB;
