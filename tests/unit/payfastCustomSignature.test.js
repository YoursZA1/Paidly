/**
 * PayFast Custom Integration signature — matches PHP `urlencode` + document field order.
 * Spec: https://developers.payfast.co.za/documentation/
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PAYFAST_CHECKOUT_FIELD_ORDER,
  buildPayfastCheckoutParamString,
  describePayfastCheckoutSignature,
  generatePayFastSignature,
  orderPayfastCheckoutFields,
  payfastPhpUrlEncode,
  signPayfastCheckoutFields,
  verifyPayFastITNSignature,
} from "../../server/src/payfastCustomSignature.js";

/** Official PayFast PHP sample (Custom Integration Step 3) + documented passphrase. */
const OFFICIAL_PHP_EXAMPLE = {
  merchant_id: "10000100",
  merchant_key: "46f0cd694581a",
  return_url: "http://www.yourdomain.co.za/return.php",
  cancel_url: "http://www.yourdomain.co.za/cancel.php",
  notify_url: "http://www.yourdomain.co.za/notify.php",
  name_first: "First Name",
  name_last: "Last Name",
  email_address: "test@test.com",
  m_payment_id: "1234",
  amount: "10.00",
  item_name: "Order#123",
};
const OFFICIAL_PASSPHRASE = "jt7NOE43FZPn";
/** MD5 of PHP urlencode(document-order fields) + &passphrase=jt7NOE43FZPn */
const OFFICIAL_EXAMPLE_MD5 = "8317e2bbd1ae2a6f4f36837e83be4ca9";

function md5(text) {
  return createHash("md5").update(String(text), "utf8").digest("hex");
}

function signItn(payload, passphrase) {
  const parts = [];
  for (const [k, v] of Object.entries(payload)) {
    if (k === "signature") continue;
    parts.push(`${k}=${payfastPhpUrlEncode(String(v))}`);
  }
  let s = parts.join("&");
  if (passphrase) s += `&passphrase=${payfastPhpUrlEncode(passphrase)}`;
  return { ...payload, signature: md5(s) };
}

describe("payfastPhpUrlEncode", () => {
  it("encodes spaces as + (Test Company)", () => {
    expect(payfastPhpUrlEncode("Test Company")).toBe("Test+Company");
    expect(payfastPhpUrlEncode("My Company")).toBe("My+Company");
  });

  it("encodes URL characters with uppercase hex", () => {
    expect(payfastPhpUrlEncode("https://paidly.co.za/payment/success?plan=pro")).toBe(
      "https%3A%2F%2Fpaidly.co.za%2Fpayment%2Fsuccess%3Fplan%3Dpro"
    );
  });

  it("encodes &, +, %, apostrophes, and unicode deterministically", () => {
    expect(payfastPhpUrlEncode("A & B")).toBe("A+%26+B");
    expect(payfastPhpUrlEncode("a+b")).toBe("a%2Bb");
    expect(payfastPhpUrlEncode("100%")).toBe("100%25");
    expect(payfastPhpUrlEncode("O'Brien")).toBe("O%27Brien");
    expect(payfastPhpUrlEncode("café")).toBe("caf%C3%A9");
  });
});

describe("generatePayFastSignature", () => {
  it("matches the official PayFast PHP checkout example", () => {
    expect(generatePayFastSignature(OFFICIAL_PHP_EXAMPLE, OFFICIAL_PASSPHRASE)).toBe(
      OFFICIAL_EXAMPLE_MD5
    );
  });

  it("omits blank optional fields", () => {
    const withBlanks = {
      ...OFFICIAL_PHP_EXAMPLE,
      cell_number: "",
      item_description: "   ",
      name_first: "First Name",
    };
    expect(generatePayFastSignature(withBlanks, OFFICIAL_PASSPHRASE)).toBe(
      generatePayFastSignature(OFFICIAL_PHP_EXAMPLE, OFFICIAL_PASSPHRASE)
    );
    expect(orderPayfastCheckoutFields(withBlanks).cell_number).toBeUndefined();
    expect(orderPayfastCheckoutFields(withBlanks).item_description).toBeUndefined();
  });

  it("appends passphrase exactly once", () => {
    const s = buildPayfastCheckoutParamString(
      orderPayfastCheckoutFields(OFFICIAL_PHP_EXAMPLE),
      OFFICIAL_PASSPHRASE
    );
    expect(s.endsWith(`&passphrase=${payfastPhpUrlEncode(OFFICIAL_PASSPHRASE)}`)).toBe(true);
    expect(s.split("&passphrase=").length - 1).toBe(1);
  });

  it("is independent of JavaScript object insertion order", () => {
    const reversed = {};
    for (const key of [...PAYFAST_CHECKOUT_FIELD_ORDER].reverse()) {
      if (OFFICIAL_PHP_EXAMPLE[key] != null) reversed[key] = OFFICIAL_PHP_EXAMPLE[key];
    }
    expect(generatePayFastSignature(reversed, OFFICIAL_PASSPHRASE)).toBe(
      generatePayFastSignature(OFFICIAL_PHP_EXAMPLE, OFFICIAL_PASSPHRASE)
    );
  });

  it("never includes an existing signature field", () => {
    const withSig = {
      ...OFFICIAL_PHP_EXAMPLE,
      signature: "ffffffffffffffffffffffffffffffff",
    };
    expect(generatePayFastSignature(withSig, OFFICIAL_PASSPHRASE)).toBe(OFFICIAL_EXAMPLE_MD5);
    expect(orderPayfastCheckoutFields(withSig).signature).toBeUndefined();
  });

  it("signs subscription recurring fields", () => {
    const sub = {
      merchant_id: "10000100",
      merchant_key: "46f0cd694581a",
      amount: "50.00",
      item_name: "Paidly Starter",
      subscription_type: 1,
      recurring_amount: "50.00",
      frequency: 3,
      cycles: 0,
    };
    const param = buildPayfastCheckoutParamString(orderPayfastCheckoutFields(sub), "secret");
    expect(param).toContain("subscription_type=1");
    expect(param).toContain("frequency=3");
    expect(param).toContain("cycles=0");
    expect(param).toContain("recurring_amount=50.00");
    expect(param).toContain("item_name=Paidly+Starter");
    expect(param.endsWith("&passphrase=secret")).toBe(true);
    expect(generatePayFastSignature(sub, "secret")).toMatch(/^[a-f0-9]{32}$/);
  });

  it("does not mutate the original object", () => {
    const src = { ...OFFICIAL_PHP_EXAMPLE };
    const snapshot = JSON.stringify(src);
    generatePayFastSignature(src, OFFICIAL_PASSPHRASE);
    signPayfastCheckoutFields(src, OFFICIAL_PASSPHRASE);
    expect(JSON.stringify(src)).toBe(snapshot);
  });
});

describe("verifyPayFastITNSignature", () => {
  it("accepts an ITN hashed in received order with passphrase", () => {
    const payload = {
      m_payment_id: "sub_abc",
      pf_payment_id: "1089250",
      payment_status: "COMPLETE",
      item_name: "Paidly Starter",
      amount_gross: "50.00",
      merchant_id: "10000100",
      signature: "",
    };
    const signed = signItn(payload, "salt");
    expect(verifyPayFastITNSignature(signed, "salt")).toBe(true);
    expect(verifyPayFastITNSignature(signed, "wrong")).toBe(false);
  });

  it("does not use checkout document reordering for ITN", () => {
    const a = {
      z_field: "1",
      a_field: "2",
      signature: "",
    };
    const signed = signItn(a, "p");
    expect(verifyPayFastITNSignature(signed, "p")).toBe(true);
  });
});

describe("describePayfastCheckoutSignature", () => {
  it("redacts passphrase and merchant_key", () => {
    const d = describePayfastCheckoutSignature(OFFICIAL_PHP_EXAMPLE, OFFICIAL_PASSPHRASE);
    expect(d.paramStringRedacted).toContain("passphrase=[REDACTED]");
    expect(d.paramStringRedacted).not.toContain(OFFICIAL_PASSPHRASE);
    const keyPair = d.encodedPairs.find((p) => p.name === "merchant_key");
    expect(keyPair?.encoded).toBe("[REDACTED]");
    expect(d.passphraseAppended).toBe(true);
    expect(d.signature).toBe(OFFICIAL_EXAMPLE_MD5);
  });
});
