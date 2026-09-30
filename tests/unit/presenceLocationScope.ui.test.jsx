/** @vitest-environment jsdom */
import { createRoot } from "react-dom/client";
import { act, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import PresenceLocationScope from "@/components/layout/PresenceLocationScope";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let mounts;
let navigateTo;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mounts = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function Page({ name }) {
  useEffect(() => {
    mounts.push(name);
  }, [name]);
  return <p data-page={name}>{name}</p>;
}

function Nav() {
  navigateTo = useNavigate();
  return null;
}

// Mirrors Layout.jsx: a page wrapper keyed by the route inside AnimatePresence mode="wait".
function Shell() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        data-wrapper={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.05 }}
      >
        <PresenceLocationScope>
          <Routes>
            <Route path="/Dashboard" element={<Page name="dashboard" />} />
            <Route path="/Invoices" element={<Page name="invoices" />} />
          </Routes>
        </PresenceLocationScope>
      </motion.div>
    </AnimatePresence>
  );
}

const pages = () => [...container.querySelectorAll("[data-page]")].map((el) => el.dataset.page);

describe("PresenceLocationScope", () => {
  // Without the scope the exiting wrapper re-renders <Routes> with the new location, so the
  // destination mounts inside it and then again in its own wrapper: ["dashboard", "invoices", "invoices"].
  it("mounts the destination page once per navigation", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/Dashboard"]}>
          <Nav />
          <Shell />
        </MemoryRouter>
      );
    });
    expect(pages()).toEqual(["dashboard"]);
    expect(mounts).toEqual(["dashboard"]);

    await act(async () => navigateTo("/Invoices"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(pages()).toEqual(["invoices"]);
    expect(container.querySelector("[data-wrapper]").dataset.wrapper).toBe("/Invoices");
    expect(mounts).toEqual(["dashboard", "invoices"]);
  });
});
