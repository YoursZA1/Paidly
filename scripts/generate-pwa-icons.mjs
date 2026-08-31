/**
 * Rasterize the main Paidly logo (public/logo.svg) into square PWA PNG sizes.
 * "any" icons keep modest padding; maskable icons keep the mark inside the
 * Android safe zone (~80% centre).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const LOGO = path.join(publicDir, "logo.svg");
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

async function renderLogoOnSquare(outName, size, pad) {
  const inner = Math.max(1, Math.round(size * (1 - pad * 2)));
  const logoPng = await sharp(LOGO, { density: 512 })
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const png = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: WHITE,
    },
  })
    .composite([{ input: logoPng, gravity: "centre" }])
    .png()
    .toBuffer();

  await writeFile(path.join(publicDir, outName), png);
  console.info(`wrote public/${outName} (${size}x${size})`);
}

await mkdir(publicDir, { recursive: true });
await renderLogoOnSquare("pwa-192x192.png", 192, 0.08);
await renderLogoOnSquare("pwa-512x512.png", 512, 0.08);
await renderLogoOnSquare("pwa-maskable-192x192.png", 192, 0.16);
await renderLogoOnSquare("pwa-maskable-512x512.png", 512, 0.16);
await renderLogoOnSquare("apple-touch-icon.png", 180, 0.08);
