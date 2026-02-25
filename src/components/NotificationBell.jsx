import React from "react";
import { Bell } from "lucide-react";

export default function NotificationBell({ count = 0, onClick }) {
  return (
    <button
      type="button"
      className="relative flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
      aria-label="Notifications"
      onClick={onClick}
    >
      <Bell className="h-5 w-5 text-gray-500" />
      {count > 0 && (
        <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
          {count}
        </span>
      )}
    </button>
  );
}
