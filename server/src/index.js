import process from "node:process";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  getPayfastFrequency,
  getPayfastProcessUrl,
  signPayfastPayload,
  verifyPayfastSignature
} from "./payfast.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5179;

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "*",
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({
  extended: false,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/payfast/subscription", (req, res) => {
  const {
    subscriptionId,
    userId,
    userEmail,
    userName,
    plan,
    billingCycle,
    amount,
    currency,
    returnUrl,
    cancelUrl
  } = req.body || {};

  if (!subscriptionId || !userEmail || !amount) {
    return res.status(400).json({
      error: "Missing required fields",
      fields: ["subscriptionId", "userEmail", "amount"]
    });
  }

  const merchantId = process.env.PAYFAST_MERCHANT_ID || "";
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY || "";
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  const notifyUrl = process.env.PAYFAST_NOTIFY_URL || returnUrl;
  const returnUrlResolved = process.env.PAYFAST_RETURN_URL || returnUrl;
  const cancelUrlResolved = process.env.PAYFAST_CANCEL_URL || cancelUrl;

  if (!merchantId || !merchantKey) {
    return res.status(500).json({
      error: "Payfast merchant credentials not configured"
    });
  }

  const now = new Date();
  const billingDate = now.toISOString().slice(0, 10);
  const frequency = getPayfastFrequency(billingCycle);

  const payload = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: returnUrlResolved,
    cancel_url: cancelUrlResolved,
    notify_url: notifyUrl,
    m_payment_id: `${subscriptionId}-${Date.now()}`,
    amount: Number(amount).toFixed(2),
    item_name: `${plan || "Subscription"} Plan`,
    item_description: `Subscription for ${userName || userEmail}`,
    custom_str1: subscriptionId,
    custom_str2: userId || "",
    custom_str3: billingCycle || "monthly",
    custom_str4: currency || "ZAR",
    email_address: userEmail,
    subscription_type: 1,
    billing_date: billingDate,
    recurring_amount: Number(amount).toFixed(2),
    frequency,
    cycles: 0
  };

  payload.signature = signPayfastPayload(payload, passphrase);

  res.json({
    payfastUrl: getPayfastProcessUrl(process.env.PAYFAST_MODE || "sandbox"),
    fields: payload
  });
});

app.post("/api/payfast/itn", (req, res) => {
  const payload = req.body || {};
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  const signatureValid = verifyPayfastSignature(payload, passphrase);

  if (!signatureValid) {
    return res.status(400).send("Invalid signature");
  }

  // TODO: Validate payload with Payfast and update subscription status in storage.
  console.log("Payfast ITN received", {
    m_payment_id: payload.m_payment_id,
    payment_status: payload.payment_status,
    subscription_id: payload.custom_str1,
    gross: payload.amount_gross
  });

  return res.status(200).send("OK");
});

app.listen(port, () => {
  console.log(`Payfast server listening on port ${port}`);
});
