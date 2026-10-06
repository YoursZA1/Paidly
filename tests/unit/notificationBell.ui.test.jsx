/** @vitest-environment jsdom */
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ authUserId: "user-1" }),
}));

const queryResult = { data: [], error: null, count: 0 };
function query() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => Promise.resolve(queryResult),
    then: (resolve, reject) => Promise.resolve(queryResult).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: () => query() },
}));
vi.mock("@/lib/realtime/paidlyRealtimeManager", () => ({
  subscribePaidlyNotificationsRealtime: () => () => {},
}));

const { default: NotificationBell } = await import("@/components/notifications/NotificationBell");

let container;
let root;

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("NotificationBell", () => {
  it("opens Activity and the list as one panel outside the app bar", async () => {
    const header = document.createElement("header");
    header.style.transform = "translateY(0px)";
    header.appendChild(container);
    document.body.appendChild(header);

    await act(async () => {
      root.render(<NotificationBell />);
    });

    const button = document.querySelector('button[aria-label="Notifications"]');
    await act(async () => {
      button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const activity = Array.from(document.querySelectorAll("span")).find((el) => el.textContent === "Activity");
    expect(activity).toBeTruthy();
    const panel = activity.closest("[data-side]");
    expect(panel).toBeTruthy();
    expect(header.contains(panel)).toBe(false);
    expect(panel.textContent).toContain("No notifications yet");
    expect(panel.className).not.toContain("top-[calc(4rem");
  });
});
