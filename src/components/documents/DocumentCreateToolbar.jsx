import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Loader2, Save, Send } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared header/footer actions for document create flows.
 *
 * @param {{
 *   returnTo?: string,
 *   returnLabel?: string,
 *   onPrimary?: () => void,
 *   primaryLabel?: string,
 *   primaryIcon?: "save" | "send",
 *   primaryDisabled?: boolean,
 *   onSecondary?: () => void,
 *   secondaryLabel?: string,
 *   secondaryDisabled?: boolean,
 *   saving?: boolean,
 *   className?: string,
 *   sticky?: boolean,
 * }} props
 */
export default function DocumentCreateToolbar({
  returnTo = createPageUrl("Documents"),
  returnLabel = "Back to Documents",
  onPrimary,
  primaryLabel = "Save draft",
  primaryIcon = "save",
  primaryDisabled = false,
  onSecondary,
  secondaryLabel,
  secondaryDisabled = false,
  saving = false,
  className,
  sticky = false,
}) {
  const PrimaryIcon = primaryIcon === "send" ? Send : Save;

  const content = (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        sticky &&
          "sticky bottom-0 z-20 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6",
        className
      )}
    >
      <Button type="button" variant="outline" asChild>
        <Link to={returnTo}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {returnLabel}
        </Link>
      </Button>
      {onPrimary ? (
        <Button
          type="button"
          onClick={onPrimary}
          disabled={saving || primaryDisabled}
          className="gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PrimaryIcon className="h-4 w-4" />}
          {primaryLabel}
        </Button>
      ) : null}
      {onSecondary && secondaryLabel ? (
        <Button
          type="button"
          variant="secondary"
          onClick={onSecondary}
          disabled={saving || primaryDisabled || secondaryDisabled}
          className="gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {secondaryLabel}
        </Button>
      ) : null}
    </div>
  );

  return content;
}
