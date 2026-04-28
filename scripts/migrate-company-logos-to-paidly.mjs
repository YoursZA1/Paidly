#!/usr/bin/env node
/**
 * Copy legacy logo objects from `company-logos` to `paidly`.
 *
 * Safe-by-default:
 * - Dry-run unless `--apply` is provided.
 * - Never deletes source unless `--delete-source` is provided.
 *
 * Usage:
 *   node scripts/migrate-company-logos-to-paidly.mjs
 *   node scripts/migrate-company-logos-to-paidly.mjs --apply
 *   node scripts/migrate-company-logos-to-paidly.mjs --apply --delete-source
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_BUCKET = "company-logos";
const TARGET_BUCKET = "paidly";

function loadServerDotEnv() {
  const p = resolve(__dirname, "../server/.env");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq <= 0) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has("--apply"),
    deleteSource: args.has("--delete-source"),
    allowAnonKey: args.has("--allow-anon-key"),
  };
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function listAll(admin, bucket, prefix = "") {
  const out = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(`list(${bucket}, ${prefix || "/"}) failed: ${error.message}`);
    }
    const rows = Array.isArray(data) ? data : [];
    out.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  return out;
}

async function collectSourcePaths(admin) {
  const root = await listAll(admin, SOURCE_BUCKET, "");
  const rootLogoPaths = root
    .filter((f) => f?.name && f.id)
    .map((f) => f.name)
    .filter((name) => name.startsWith("logo-"));

  const documentDir = await listAll(admin, SOURCE_BUCKET, "document-logos");
  const userDirs = documentDir
    .filter((f) => f?.name && !f.id) // directory entries
    .map((f) => f.name);

  const docPaths = [];
  for (const userDir of userDirs) {
    const files = await listAll(admin, SOURCE_BUCKET, `document-logos/${userDir}`);
    for (const f of files) {
      if (f?.name && f.id) docPaths.push(`document-logos/${userDir}/${f.name}`);
    }
  }

  return [...rootLogoPaths, ...docPaths];
}

async function copyOne(admin, path) {
  const { data: blob, error: dlErr } = await admin.storage.from(SOURCE_BUCKET).download(path);
  if (dlErr) throw new Error(`download ${path}: ${dlErr.message}`);
  const { error: upErr } = await admin.storage.from(TARGET_BUCKET).upload(path, blob, { upsert: false });
  if (upErr) {
    // Already exists is safe to skip.
    if (/exists|duplicate|already/i.test(upErr.message || "")) return "skipped_exists";
    throw new Error(`upload ${path}: ${upErr.message}`);
  }
  return "copied";
}

async function removeOne(admin, path) {
  const { error } = await admin.storage.from(SOURCE_BUCKET).remove([path]);
  if (error) throw new Error(`remove ${path}: ${error.message}`);
}

async function main() {
  loadServerDotEnv();
  const { apply, deleteSource, allowAnonKey } = parseArgs();

  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or provide them in server/.env).");
    process.exit(1);
  }
  const payload = decodeJwtPayload(key);
  if (payload && payload.role !== "service_role" && !(allowAnonKey && payload.role === "anon")) {
    console.error(
      `[logo-migrate] SUPABASE_SERVICE_ROLE_KEY is not a service_role JWT (role=${String(
        payload.role || "unknown"
      )}).`
    );
    process.exit(1);
  }
  if (payload?.role === "anon" && allowAnonKey) {
    console.warn("[logo-migrate] Proceeding with anon key (--allow-anon-key). Ensure temporary insert policy exists.");
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const paths = await collectSourcePaths(admin);
  console.log(`[logo-migrate] Found ${paths.length} source object(s) in ${SOURCE_BUCKET}.`);
  if (!apply) {
    console.log("[logo-migrate] Dry-run mode (no changes). Use --apply to execute.");
    console.log(paths.slice(0, 20).map((p) => `  - ${p}`).join("\n"));
    if (paths.length > 20) console.log(`  ... and ${paths.length - 20} more`);
    return;
  }

  let copied = 0;
  let skipped = 0;
  let removed = 0;

  for (const path of paths) {
    const status = await copyOne(admin, path);
    if (status === "copied") copied += 1;
    if (status === "skipped_exists") skipped += 1;

    if (deleteSource) {
      await removeOne(admin, path);
      removed += 1;
    }
  }

  console.log(`[logo-migrate] Completed. copied=${copied} skipped_exists=${skipped} removed_source=${removed}`);
}

main().catch((err) => {
  console.error("[logo-migrate] Failed:", err?.message || err);
  process.exit(1);
});
