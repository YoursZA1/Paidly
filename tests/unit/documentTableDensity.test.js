import { describe, expect, it } from "vitest";
import {
  documentTableCellClass,
  documentTableRowHeight,
  normalizeDocumentTableDensity,
} from "../../src/lib/documentTableDensity.js";

describe("document table density", () => {
  it("defaults unknown values to comfortable", () => {
    expect(normalizeDocumentTableDensity("")).toBe("comfortable");
    expect(normalizeDocumentTableDensity("huge")).toBe("comfortable");
  });

  it("maps the legacy spacious alias to comfortable", () => {
    expect(normalizeDocumentTableDensity("spacious")).toBe("comfortable");
  });

  it("maps each density to padding and row height", () => {
    expect(documentTableCellClass("comfortable")).toBe("py-4");
    expect(documentTableCellClass("cozy")).toBe("py-2.5");
    expect(documentTableCellClass("compact")).toBe("py-1.5 text-sm");
    expect(documentTableRowHeight("compact")).toBe(44);
    expect(documentTableRowHeight("cozy")).toBe(56);
    expect(documentTableRowHeight("comfortable")).toBe(72);
  });
});
