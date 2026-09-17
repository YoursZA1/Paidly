import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  ChevronDown,
  FileText,
  FileStack,
  Users,
  Package,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createPageUrl } from "@/utils";

export const OWNER_CREATE_ACTIONS = [
  { name: "Invoice", url: createPageUrl("CreateInvoice"), icon: FileText },
  { name: "Quote", url: createPageUrl("CreateQuote"), icon: FileStack },
  { name: "Client", url: createPageUrl("EditClient"), icon: Users },
  { name: "Product", url: `${createPageUrl("Services")}?new=1`, icon: Package },
];

/**
 * Split Create control: primary action (Invoice) + menu (Invoice / Quote / Client / Product).
 * Desktop sidebar CTA (expanded pill + collapsed icon menu).
 */
export default function CreateSplitButton({
  collapsed = false,
  id = "create-invoice-btn",
  className = "",
}) {
  const navigate = useNavigate();
  const primary = OWNER_CREATE_ACTIONS[0];

  const menuItems = OWNER_CREATE_ACTIONS.map((action) => (
    <DropdownMenuItem
      key={action.name}
      className="cursor-pointer gap-2.5 py-2.5"
      onSelect={() => navigate(action.url)}
    >
      <action.icon className="size-4 text-primary" strokeWidth={2} />
      {action.name}
    </DropdownMenuItem>
  ));

  if (collapsed) {
    return (
      <DropdownMenu>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                id={id}
                className={`inline-flex w-full items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background h-10 ${className}`}
                aria-label="Create"
              >
                <Plus className="size-5" strokeWidth={2} />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="font-medium">
            Create
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="right" align="end" sideOffset={10} className="w-44 rounded-xl">
          {menuItems}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div
      className={`flex w-full items-stretch rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ${className}`}
      role="group"
      aria-label="Create"
    >
      <button
        type="button"
        id={id}
        onClick={() => navigate(primary.url)}
        className="flex flex-1 items-center gap-2 rounded-l-full py-2.5 pl-3.5 pr-2.5 text-sm font-semibold transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground/40"
        aria-label="Create invoice"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
          <Plus className="size-3.5" strokeWidth={2.5} />
        </span>
        Create
      </button>
      <span className="w-px self-stretch my-2 bg-primary-foreground/25" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex min-w-[42px] items-center justify-center rounded-r-full px-3 transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground/40"
            aria-label="Open create menu"
          >
            <ChevronDown className="size-4" strokeWidth={2.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-44 rounded-xl">
          {menuItems}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

CreateSplitButton.propTypes = {
  collapsed: PropTypes.bool,
  id: PropTypes.string,
  className: PropTypes.string,
};
