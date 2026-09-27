/** @vitest-environment jsdom */
/**
 * Product photos on the till recover from a bad cached URL: a failed load evicts the cached copy and
 * retries a freshly built public URL, then the server-resolved `image_src`, before showing the placeholder.
 * Also covers the server-side builder for `image_src` in the POS catalog.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: { from: () => ({}) } }));
vi.mock("@/core/auth/SessionCoordinator", () => ({ getStableSession: async () => null }));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    storage: {
      from: (bucket) => ({
        getPublicUrl: (path) => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
      }),
    },
  },
}));

const { default: ProductThumbnail } = await import("@/components/inventory/ProductThumbnail");
const { __clearLogoUrlDiskCacheForTests } = await import("@/lib/logoUrlDiskCache");
const { default: AssetService } = await import("@/services/AssetService");

const PATH = "inventory/5b72e077/0b170107.jpg";
const FRESH = `https://proj.supabase.co/storage/v1/object/public/paidly/${PATH}`;
const STALE = "https://supabase.com/storage/v1/object/public/paidly/inventory/5b72e077/0b170107.jpg";
const SERVER = `https://server.supabase.co/storage/v1/object/public/paidly/${PATH}`;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container;
let root;
beforeEach(() => {
  AssetService.clearLogoSessionCache();
  __clearLogoUrlDiskCacheForTests();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const img = () => container.querySelector("img");
const fail = async () => act(async () => img().dispatchEvent(new Event("error")));
async function render(props) {
  await act(async () => root.render(<ProductThumbnail {...props} />));
}

describe("ProductThumbnail recovery", () => {
  it("renders the public URL for a storage path", async () => {
    await render({ imageUrl: PATH });
    expect(img().getAttribute("src")).toBe(FRESH);
  });

  it("a poisoned cached URL is evicted and replaced by a freshly built one", async () => {
    localStorage.setItem(`paidly_logo_url_v1:${PATH}`, JSON.stringify({ url: STALE, savedAt: Date.now() }));
    await render({ imageUrl: PATH, fallbackSrc: SERVER });
    expect(img().getAttribute("src")).toBe(STALE);
    await fail();
    expect(img().getAttribute("src")).toBe(FRESH);
    expect(localStorage.getItem(`paidly_logo_url_v1:${PATH}`)).toBeNull();
    await fail();
    expect(img().getAttribute("src")).toBe(SERVER);
    await fail();
    expect(img()).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("uses the server-resolved image when only that is available", async () => {
    await render({ imageUrl: null, fallbackSrc: SERVER });
    expect(img().getAttribute("src")).toBe(SERVER);
  });

  it("shows the placeholder with no image at all", async () => {
    await render({ imageUrl: "" });
    expect(img()).toBeNull();
  });
});

describe("posProductImageSrc (catalog image_src)", () => {
  it("builds an absolute public URL from the stored path and rejects unsafe keys", async () => {
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co/");
    const { posProductImageSrc } = await import("../../server/src/pos/posNativeCheckout.js");
    expect(posProductImageSrc(PATH)).toBe(`https://abc.supabase.co/storage/v1/object/public/paidly/${PATH}`);
    expect(posProductImageSrc(`paidly/${PATH}`)).toBe(`https://abc.supabase.co/storage/v1/object/public/paidly/${PATH}`);
    expect(posProductImageSrc(SERVER)).toBe(SERVER);
    expect(posProductImageSrc("../secrets")).toBeNull();
    expect(posProductImageSrc("")).toBeNull();
    vi.unstubAllEnvs();
  });
});
