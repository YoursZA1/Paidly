/**
 * Client import contract: mapping, validation, duplicates, formula-safe CSV, header promotion, limits.
 * No database and no production customer data.
 */
import { describe, expect, it } from "vitest";
import {
  CLIENT_IMPORT_LIMITS,
  applyColumnMapping,
  classifyAgainstExisting,
  clientLooksLikeHeaderRow,
  clientReportCsv,
  csvSafeCell,
  defaultDecision,
  fileDuplicates,
  identityKeys,
  missingRequiredFields,
  normalizePhone,
  planCounts,
  promoteClientHeader,
  suggestColumnMapping,
  validateClientImportRow,
} from "../../shared/clients/clientImport.js";
import { parseCsvBuffer } from "@/lib/productImport/tableParsing.js";

const EXISTING = [
  { id: "c1", name: "Thabo Nkosi", email: "thabo@example.co.za", phone: "0825550101", tax_id: "4123456789" },
  { id: "c2", name: "Amina Hassan", email: "amina@example.co.za", phone: "+27 11 555 0199", tax_id: "" },
];

describe("column mapping", () => {
  it("maps common client headings and ignores unknown columns", () => {
    const { mapping } = suggestColumnMapping(["Customer", "Email Address", "Mobile", "VAT No", "Favourite colour"]);
    expect(mapping).toEqual(["name", "email", "phone", "tax_id", "__ignore__"]);
  });

  it("does not treat a contact column as the client name", () => {
    const { mapping } = suggestColumnMapping(["Company name", "Contact person", "Email"]);
    expect(mapping[0]).toBe("name");
    expect(mapping[1]).toBe("contact_person");
  });

  it("requires a name and an email mapping, like Add client", () => {
    expect(missingRequiredFields(["email", "phone"])).toEqual(["name"]);
    expect(missingRequiredFields(["name"])).toEqual(["email"]);
    expect(missingRequiredFields(["name", "email"])).toEqual([]);
  });

  it("promotes a title row to the real header", () => {
    const table = promoteClientHeader({
      headers: ["Customer export"],
      rows: [
        ["Client name", "Email", "Phone"],
        ["José Muñoz", "jose@example.co.za", "0715550142"],
      ],
      rowNumbers: [1, 2, 3],
    });
    expect(table.headers.slice(0, 3)).toEqual(["Client name", "Email", "Phone"]);
    expect(table.rows).toEqual([["José Muñoz", "jose@example.co.za", "0715550142"]]);
    expect(clientLooksLikeHeaderRow(table.headers)).toBe(true);
  });
});

describe("validation", () => {
  it("accepts international names and a valid row", () => {
    const row = validateClientImportRow({ name: "  José Muñoz  ", email: "jose@example.co.za", phone: "+27 71 555 0142" });
    expect(row.errors).toEqual([]);
    expect(row.value.name).toBe("José Muñoz");
    expect(row.value.phone).toBe("+27 71 555 0142");
  });

  it("accepts CJK names", () => {
    const row = validateClientImportRow({ name: "北京贸易", email: "office@example.cn" });
    expect(row.errors).toEqual([]);
    expect(row.value.name).toBe("北京贸易");
  });

  it("flags a missing name and a bad email without dropping the row", () => {
    const row = validateClientImportRow({ name: "", email: "not-an-email", phone: "12" });
    expect(row.empty).toBe(false);
    expect(row.errors.map((e) => e.field)).toEqual(["name", "email", "phone"]);
    expect(row.value.email).toBe("not-an-email");
  });

  it("requires an email, the same as Add client", () => {
    const row = validateClientImportRow({ name: "Harbour School", phone: "0215550100" });
    expect(row.errors).toEqual([expect.objectContaining({ field: "email", message: "Email is required." })]);
  });

  it("treats a completely blank row as empty", () => {
    expect(validateClientImportRow({ name: "  ", email: "" }).empty).toBe(true);
  });

  it("warns on formula-like text and still keeps it", () => {
    const row = validateClientImportRow({ name: "=HYPERLINK(\"http://evil\")" });
    expect(row.value.name).toContain("HYPERLINK");
    expect(row.warnings.some((w) => /formula/i.test(w.message))).toBe(true);
  });
});

describe("duplicates", () => {
  it("matches +27 and 0 phone prefixes, and spaced tax numbers", () => {
    expect(normalizePhone("+27825550101")).toBe(normalizePhone("082 555 0101"));
    expect(identityKeys({ tax_id: "412 345 6789" }).tax).toBe(identityKeys({ tax_id: "4123456789" }).tax);
  });

  it("does not treat the same name as a duplicate", () => {
    const row = validateClientImportRow({ name: "Thabo Nkosi", email: "other@example.co.za" });
    expect(classifyAgainstExisting(row.value, EXISTING)).toBeNull();
  });

  it("reliably matches one existing client by email", () => {
    const row = validateClientImportRow({ name: "Someone else", email: "Thabo@Example.co.za" });
    const found = classifyAgainstExisting(row.value, EXISTING);
    expect(found.reliable).toBe(true);
    expect(found.matches[0].id).toBe("c1");
    expect(found.matches[0].matchedBy).toEqual(["email"]);
  });

  it("is uncertain when email and phone point at different clients", () => {
    const row = validateClientImportRow({ name: "Mixed", email: "thabo@example.co.za", phone: "+27 11 555 0199" });
    const found = classifyAgainstExisting(row.value, EXISTING);
    expect(found.reliable).toBe(false);
    expect(found.matches).toHaveLength(2);
  });

  it("flags the later in-file duplicate and defaults it to skip", () => {
    const rows = [
      { row_number: 2, ...validateClientImportRow({ name: "A", email: "a@example.co.za" }) },
      { row_number: 3, ...validateClientImportRow({ name: "B", email: "a@example.co.za" }) },
    ];
    const dups = fileDuplicates(rows);
    expect(dups.get(2)).toBeUndefined();
    expect(dups.get(3).row_number).toBe(2);
    const decision = defaultDecision(rows[1], dups.get(3), null);
    expect(decision.action).toBe("skip");
    expect(decision.allowDuplicate).toBe(false);
  });

  it("defaults a reliable existing match to skip, not update", () => {
    const row = { row_number: 2, errors: [], ...validateClientImportRow({ name: "Thabo", email: "thabo@example.co.za" }) };
    const found = classifyAgainstExisting(row.value, EXISTING);
    const decision = defaultDecision(row, undefined, found);
    expect(decision.action).toBe("skip");
    expect(decision.targetId).toBe("c1");
  });

  it("counts create, skip and invalid separately", () => {
    const rows = [
      { row_number: 2, errors: [], value: { name: "New" } },
      { row_number: 3, errors: [{ message: "bad" }], value: {} },
    ];
    const decisions = { get: (n) => (n === 2 ? { action: "create" } : { action: "skip" }) };
    expect(planCounts(rows, decisions)).toEqual({ create: 1, update: 0, skip: 0, invalid: 1 });
  });
});

describe("csv safety and scale", () => {
  it("neutralises spreadsheet formulas in exported cells", () => {
    expect(csvSafeCell("=cmd|'/c calc'!A1")).toBe(`"'=cmd|'/c calc'!A1"`);
    expect(csvSafeCell("+1+1")).toBe(`"'+1+1"`);
    expect(csvSafeCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
    const csv = clientReportCsv([{ row_number: 2, values: { name: "=HYPERLINK()", email: "a@example.co.za" }, result: "failed", details: "Fix the email" }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK()`);
    expect(csv).not.toMatch(/\n=HYPERLINK/);
  });

  it("writes a failed-rows file that maps back to every client field when uploaded again", () => {
    const values = {
      name: "=Harbour School", contact_person: "Lerato Dube", email: "office@example.co.za", alternate_email: "fees@example.co.za",
      phone: "+27 21 555 0100", fax: "0215550101", address: "1 Beach Road, Cape Town", tax_id: "4987654321",
      website: "harbour.example.co.za", industry: "Education", segment: "Schools", notes: "Pays termly",
    };
    const csv = clientReportCsv([{ row_number: 7, values, result: "failed", details: "Retry" }]);
    const { headers: header, rows: [line] } = parseCsvBuffer(new TextEncoder().encode(csv).buffer).sheets[0].table;
    const { mapping } = suggestColumnMapping(header);
    expect(mapping.slice(-3)).toEqual(["__ignore__", "__ignore__", "__ignore__"]);
    const back = validateClientImportRow(applyColumnMapping(mapping, line));
    expect(csv).toContain(`'+27 21 555 0100`);
    expect(back.errors).toEqual([]);
    expect(back.value).toEqual(values);
  });

  it("validates 5,000 rows within a couple of seconds", () => {
    const started = Date.now();
    for (let i = 0; i < CLIENT_IMPORT_LIMITS.maxRows; i++) {
      const row = validateClientImportRow({ name: `Client ${i}`, email: `c${i}@example.co.za`, phone: `082555${String(i).padStart(4, "0")}` });
      if (row.errors.length) throw new Error("unexpected");
    }
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
