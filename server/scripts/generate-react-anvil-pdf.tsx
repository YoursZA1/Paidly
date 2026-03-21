/**
 * Generate a PDF from React + styled-components SSR, sent to Anvil.
 *
 * Usage (from repo root or server/):
 *   cd server && ANVIL_API_TOKEN=your_token npm run react:generate-pdf
 *
 * Output: ../generate-react.output.pdf (repository root)
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { ServerStyleSheet } from "styled-components";
import { generateHtmlPdfBuffer, getAnvilClient } from "../src/anvilPdf.js";
import Invoice from "./anvil-invoice/Invoice.jsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const apiKey = process.env.ANVIL_API_TOKEN?.trim();
if (!apiKey) {
  console.error("Set ANVIL_API_TOKEN in the environment or server/.env");
  process.exit(1);
}

function loadInvoiceAnvilBaseCss() {
  const cssPath = path.resolve(__dirname, "../../public/invoice-anvil/invoice.css");
  if (!fs.existsSync(cssPath)) return "";
  return fs.readFileSync(cssPath, "utf8");
}

function buildHTMLToPDFPayload() {
  const sheet = new ServerStyleSheet();
  try {
    const html = ReactDOMServer.renderToStaticMarkup(sheet.collectStyles(<Invoice />));
    const baseCss = loadInvoiceAnvilBaseCss();
    const css = [baseCss, sheet.instance.toString()].filter(Boolean).join("\n\n");
    return {
      type: "html" as const,
      title: "HTML Invoice",
      data: {
        html,
        css,
      },
      page: {
        marginLeft: "60px",
        marginRight: "60px",
      },
    };
  } finally {
    sheet.seal();
  }
}

async function main() {
  const client = getAnvilClient();
  if (!client) {
    console.error("Anvil client not available (ANVIL_API_TOKEN).");
    process.exit(1);
  }

  const exampleData = buildHTMLToPDFPayload();
  const { html, css, title, page } = {
    html: exampleData.data.html,
    css: exampleData.data.css,
    title: exampleData.title,
    page: exampleData.page,
  };

  const result = await generateHtmlPdfBuffer(client, { html, css, title, page });

  if (result.ok) {
    const repoRoot = path.join(__dirname, "..", "..");
    const outputFilePath = path.join(repoRoot, "generate-react.output.pdf");
    fs.writeFileSync(outputFilePath, result.buffer, { encoding: null });
    console.log("Wrote", outputFilePath);
  } else {
    console.log(result.statusCode, result.message);
    process.exit(1);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err: Error) => {
    console.log(err.stack || err.message);
    process.exit(1);
  });
