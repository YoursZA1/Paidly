/**
 * Rasterize existing Paidly brand SVGs into PWA PNG sizes.
 * Source marks: public/icon.svg (any) and public/pwa-maskable.svg (maskable).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");

async function render(svgName, outName, size) {
  const svg = await readFile(path.join(publicDir, svgName));
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 242, g: 78, b: 0, alpha: 1 } })
    .png()
    .toBuffer();
  await writeFile(path.join(publicDir, outName), png);
  console.info(`wrote public/${outName} (${size}x${size})`);
}

await mkdir(publicDir, { recursive: true });
await render("icon.svg", "pwa-192x192.png", 192);
await render("icon.svg", "pwa-512x512.png", 512);
await render("pwa-maskable.svg", "pwa-maskable-192x192.png", 192);
await render("pwa-maskable.svg", "pwa-maskable-512x512.png", 512);
await render("icon.svg", "apple-touch-icon.png", 180);
