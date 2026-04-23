"use client";
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

const Toaster = ({
  ...props
}) => {
  const { resolvedTheme = "light" } = useTheme()

  return (
    (<Sonner
      theme={resolvedTheme}
      className="toaster group"
      richColors
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          success:
            "group-[.toaster]:!border-emerald-500/40 group-[.toaster]:!bg-emerald-50 group-[.toaster]:!text-emerald-900 dark:group-[.toaster]:!bg-emerald-950/45 dark:group-[.toaster]:!text-emerald-100 dark:group-[.toaster]:!border-emerald-500/40",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props} />)
  );
}

export { Toaster }
