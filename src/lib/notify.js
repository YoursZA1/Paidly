import { toast } from "sonner";

/**
 * Consistent success notification pattern across the app.
 * @param {string} title
 * @param {string} [description]
 * @param {import("sonner").ExternalToast} [options]
 */
export function notifySuccess(title, description, options = {}) {
  const normalizedTitle = String(title || "Success").trim() || "Success";
  const normalizedDescription = description != null ? String(description).trim() : "";
  if (normalizedDescription) {
    return toast.success(normalizedTitle, {
      description: normalizedDescription,
      ...options,
    });
  }
  return toast.success(normalizedTitle, options);
}

