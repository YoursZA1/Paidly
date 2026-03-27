import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { CircleCheck } from "lucide-react";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        if (props.open === false) {
          return null;
        }
        const showSuccessIcon = variant === "success";
        return (
          <Toast key={id} variant={variant} {...props}>
            <div
              className={
                showSuccessIcon
                  ? "flex gap-3 items-start w-full pr-6"
                  : "grid gap-1 w-full pr-6"
              }
            >
              {showSuccessIcon && (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 ring-2 ring-white/35"
                  aria-hidden
                >
                  <CircleCheck className="h-5 w-5 text-white" strokeWidth={2.25} />
                </span>
              )}
              <div className="grid gap-1 flex-1 min-w-0">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose onClick={() => props.onOpenChange?.(false)} />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
} 