#!/usr/bin/env node
/**
 * Self-host on-device receipt OCR (tesseract.js) so it works under Paidly's CSP
 * (script-src/worker-src/connect-src 'self' — no jsDelivr). Copies the worker, the LSTM cores and the
 * English model into public/vendor/tesseract/ (gitignored, not precached by the PWA). They are fetched
 * only when someone scans a receipt without a server extraction provider.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = path.resolve("public/vendor/tesseract");

function pkgDir(name) {
  return path.dirname(require.resolve(`${name}/package.json`));
}

const files = [
  [path.join(pkgDir("tesseract.js"), "dist/worker.min.js"), "worker.min.js"],
  ...["relaxedsimd-lstm", "simd-lstm", "lstm"].map((variant) => [
    path.join(pkgDir("tesseract.js-core"), `tesseract-core-${variant}.wasm.js`),
    `core/tesseract-core-${variant}.wasm.js`,
  ]),
  [path.join(pkgDir("@tesseract.js-data/eng"), "4.0.0_best_int/eng.traineddata.gz"), "lang/eng.traineddata.gz"],
];

let copied = 0;
for (const [from, rel] of files) {
  const to = path.join(out, rel);
  if (!fs.existsSync(from)) {
    console.warn(`[copy-ocr-assets] missing ${from} — on-device OCR will be unavailable`);
    continue;
  }
  const same = fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size;
  if (same) continue;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied += 1;
}
console.log(`[copy-ocr-assets] ${copied} file(s) updated in public/vendor/tesseract`);
