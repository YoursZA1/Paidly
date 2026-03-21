#!/usr/bin/env node
/**
 * Generate a PDF from static HTML/CSS files using Anvil (same payload as the sample script).
 *
 * Usage:
 *   ANVIL_API_TOKEN=<key> node ./scripts/anvil-generate-plain-html.mjs [invoice.html] [invoice.css...]
 *
 * Defaults: ./invoice.html and ./invoice.css in the current working directory.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { generateHtmlPdfBuffer, getAnvilClient } from "../src/anvilPdf.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const apiKey = process.env.ANVIL_API_TOKEN;
if (!apiKey?.trim()) {
  console.error("Set ANVIL_API_TOKEN in the environment.");
  process.exit(1);
}

const cwd = process.cwd();
const htmlPath = path.resolve(cwd, process.argv[2] || "invoice.html");
const extraCss = process.argv.slice(3);
const defaultCssFiles = ["invoice.css", "invoice-pdf.css"];
const cssPaths =
  extraCss.length > 0
    ? extraCss.map((p) => path.resolve(cwd, p))
    : defaultCssFiles.map((f) => path.resolve(cwd, f)).filter((p) => fs.existsSync(p));

if (!fs.existsSync(htmlPath)) {
  console.error("Missing HTML file:", htmlPath);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");
const canonicalCssPath = path.resolve(__dirname, "../../public/invoice-anvil/invoice.css");
const canonicalCss = fs.existsSync(canonicalCssPath) ? fs.readFileSync(canonicalCssPath, "utf8") : "";
const userCss = cssPaths.map((p) => fs.readFileSync(p, "utf8")).join("\n\n");
const css = [canonicalCss, userCss].filter(Boolean).join("\n\n");

const payload = {
  html,
  css,
  title: "HTML Invoice",
  page: {
    marginLeft: "60px",
    marginRight: "60px",
  },
};

const client = getAnvilClient();
if (!client) {
  console.error("Could not create Anvil client.");
  process.exit(1);
}
const result = await generateHtmlPdfBuffer(client, payload);

if (!result.ok) {
  console.error(result.statusCode, result.message);
  process.exit(1);
}

const outPath = path.join(cwd, "generate-plain-html.output.pdf");
fs.writeFileSync(outPath, result.buffer, { encoding: null });
console.log("Wrote", outPath);
