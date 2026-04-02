#!/usr/bin/env node
/**
 * Purge Supabase Storage assets for a user (profile-logos, company-logos, document-logos).
 * Use when a user was deleted from Auth in the Dashboard/SQL so files are not left behind
 * (Node API and self-delete already call the same logic server-side).
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *     node scripts/purge-user-storage.mjs <user-uuid>
 *
 * Or with server/.env (first two vars loaded if present):
 *   node scripts/purge-user-storage.mjs <user-uuid>
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  loadServerDotEnv();
  const userId = String(process.argv[2] || "").trim();
  if (!userId || !UUID_RE.test(userId)) {
    console.error("Usage: node scripts/purge-user-storage.mjs <user-uuid>");
    process.exit(1);
  }

  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use server/.env with those keys).");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const removeQuiet = async (bucket, paths) => {
    if (!paths.length) return;
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) console.warn(`[purge-user-storage] remove ${bucket}:`, error.message);
  };

  const { data: profileFiles, error: profileListErr } = await admin.storage.from("profile-logos").list(userId);
  if (profileListErr) {
    console.warn("[purge-user-storage] list profile-logos:", profileListErr.message);
  } else if (profileFiles?.length) {
    const paths = profileFiles.filter((f) => f?.name).map((f) => `${userId}/${f.name}`);
    await removeQuiet("profile-logos", paths);
    console.log(`Removed ${paths.length} object(s) from profile-logos/${userId}/`);
  }

  const companyBucket = "company-logos";
  const rootLogoPaths = ["png", "jpg", "jpeg", "svg"].map((ext) => `logo-${userId}.${ext}`);
  await removeQuiet(companyBucket, rootLogoPaths);

  const docPrefix = `document-logos/${userId}`;
  const { data: docFiles, error: docListErr } = await admin.storage.from(companyBucket).list(docPrefix);
  if (docListErr) {
    console.warn("[purge-user-storage] list document-logos:", docListErr.message);
  } else if (docFiles?.length) {
    const paths = docFiles.filter((f) => f?.name).map((f) => `${docPrefix}/${f.name}`);
    await removeQuiet(companyBucket, paths);
    console.log(`Removed ${paths.length} object(s) from ${docPrefix}/`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
