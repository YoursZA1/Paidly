import PropTypes from "prop-types";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import Button from "@/components/ui/button";

/**
 * Mobile filter container: search stays on the page; extra filters live in a bottom sheet.
 */
export default function MobileFilterSheet({
  open,
  onOpenChange,
  title = "Filters",
  children,
  onApply,
  onClear,
  applyLabel = "Apply",
  clearLabel = "Clear",
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-0">
        <DrawerHeader className="shrink-0 text-left">
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">{children}</div>
        <DrawerFooter className="sticky bottom-0 flex-row gap-2 bg-background">
          {onClear ? (
            <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={onClear}>
              {clearLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            className="min-h-11 flex-1"
            onClick={() => {
              onApply?.();
              onOpenChange?.(false);
            }}
          >
            {applyLabel}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

MobileFilterSheet.propTypes = {
  open: PropTypes.bool,
  onOpenChange: PropTypes.func,
  title: PropTypes.string,
  children: PropTypes.node,
  onApply: PropTypes.func,
  onClear: PropTypes.func,
  applyLabel: PropTypes.string,
  clearLabel: PropTypes.string,
};
