/** @vitest-environment jsdom */
import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getLogo, signLogoUrl } = vi.hoisted(() => ({
  getLogo: vi.fn(() => "https://proj.supabase.co/storage/v1/object/public/paidly/logo.png"),
  signLogoUrl: vi.fn(async () => "https://proj.supabase.co/storage/v1/object/sign/paidly/logo.png?token=t"),
}));

vi.mock("@/services/AssetService", () => ({
  default: {
    FALLBACK_LOGO: "/fallback-logo.png",
    getLogo,
    signLogoUrl,
  },
}));

vi.mock("@/lib/logoUrlDiskCache", () => ({
  clearLogoUrlDiskCacheForSrc: vi.fn(),
}));

vi.mock("@/lib/paidlyStorageAssetGuard", () => ({
  markStorageAssetFailed: vi.fn(),
}));

import LogoImage from "@/components/shared/LogoImage";

const { act } = React;

describe("LogoImage public vs signed access", () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    getLogo.mockClear();
    signLogoUrl.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("uses getPublicUrl (getLogo) for public invoice surfaces and never signs", async () => {
    await act(async () => {
      root.render(<LogoImage src="logo.png" alt="Logo" />);
    });
    expect(getLogo).toHaveBeenCalledWith("logo.png");
    expect(signLogoUrl).not.toHaveBeenCalled();
  });

  it("uses signLogoUrl only when Settings opts in", async () => {
    await act(async () => {
      root.render(<LogoImage src="logo.png" alt="Logo" preferSignedUrl />);
    });
    expect(signLogoUrl).toHaveBeenCalledWith("logo.png");
  });
});
