# Send Invoice PDF via Email (Node + Nodemailer)

The server can generate the invoice PDF and send it via Gmail (or another Nodemailer transport).

## Setup

1. **Environment variables** (in `server/.env` or project root):

   ```env
   EMAIL=your@gmail.com
   EMAIL_PASSWORD=your-app-password
   # Optional: custom "from" address
   EMAIL_FROM=billing@yourapp.com
   ```

   For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833), not your normal password.

2. **Server dependencies** (already in `server/package.json`):

   - `nodemailer`
   - `@react-pdf/renderer`
   - `react`

   Run from project root: `npm install` (or `npm install --prefix server`).

## Usage

```js
import { sendInvoice, generateInvoicePDFBuffer } from "./sendInvoiceNodemailer.js";

// invoiceData shape: brand, address, number, client: { name, address, email }, items, subtotal, total, currency?
const invoiceData = {
  brand: "Your Company",
  address: "123 Street, City",
  number: "INV-001",
  client: { name: "Client Name", address: "Client Address", email: "client@example.com" },
  items: [
    { description: "Item 1", qty: 2, price: 100, total: 200 },
    { description: "Item 2", qty: 1, price: 50, total: 50 },
  ],
  subtotal: "250.00",
  total: "250.00",
  currency: "ZAR",
};

// Generate PDF and send email
await sendInvoice(invoiceData);
```

**Generate buffer only** (e.g. for another transport or API):

```js
const pdfBuffer = await generateInvoicePDFBuffer(invoiceData);
```

## Frontend → Server flow

1. In the app, build `invoiceData` with `mapToInvoiceData(invoice, client, user)` from `@/components/pdf/InvoicePDFDownloadLink` (includes `client.email`).
2. POST `invoiceData` to a server endpoint that calls `sendInvoice(invoiceData)`.

## Reference: inline example

```js
import nodemailer from "nodemailer";
import { renderToBuffer } from "@react-pdf/renderer";
import InvoiceEmailPDF from "./pdf/InvoiceEmailPDFNode.js";
import React from "react";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

async function sendInvoice(invoiceData) {
  const pdfBuffer = await renderToBuffer(
    React.createElement(InvoiceEmailPDF, { invoice: invoiceData })
  );

  await transporter.sendMail({
    from: "billing@yourapp.com",
    to: invoiceData.client.email,
    subject: `Invoice ${invoiceData.number}`,
    text: "Please find your invoice attached.",
    attachments: [
      {
        filename: `Invoice-${invoiceData.number}.pdf`,
        content: pdfBuffer,
      },
    ],
  });
}
```
