import { describe, expect, it } from "vitest";
import { signingState } from "../../api/_publicDocumentShared.js";

describe("public document signing", () => {
  it("offers Sign on a sent contract and stops once it is signed", () => {
    expect(signingState({ type: "contract", status: "viewed" }, [])).toMatchObject({
      required: true,
      canSign: true,
      signed: false,
    });
    expect(
      signingState({ type: "contract", status: "signed", signature_status: "signed" }, [
        { signer_name: "On The Design Agency", status: "signed" },
      ])
    ).toMatchObject({
      canSign: false,
      signed: true,
      signedName: "On The Design Agency",
    });
  });

  it("does not ask an invoice-style hub document to sign", () => {
    expect(signingState({ type: "receipt", status: "sent" }, []).canSign).toBe(false);
  });
});
