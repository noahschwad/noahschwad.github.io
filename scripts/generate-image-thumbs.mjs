/**
 * Build step: for each raster under public/project-assets/, ensure a
 * `basename.thumb.webp` exists (very small, same aspect). Skips if that file
 * already exists unless you pass `--force` / `-f` (e.g. after changing size).
 * Netlify: runs as
 * part of `npm run build` (Node 18+; sharp ships linux-x64 prebuilds).
 */
import { readdir, stat } from "node:fs/promises";
import { join, extname, basename, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "public");
const ASSETS_ROOT = join(PUBLIC, "project-assets");
const THUMB_MAX_W = 6;
const WEBP_QUALITY = 62;
const RASTER = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const FORCE =
  process.argv.includes("--force") || process.argv.includes("-f");

function isRasterSource(name) {
  const ext = extname(name).toLowerCase();
  if (!RASTER.has(ext)) return false;
  if (name.includes(".thumb.")) return false;
  return true;
}

function thumbNameForSource(name) {
  const ext = extname(name);
  const base = basename(name, ext);
  return `${base}.thumb.webp`;
}

async function walkFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await walkFiles(p)));
    } else if (ent.isFile() && isRasterSource(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

async function main() {
  let files;
  try {
    await stat(ASSETS_ROOT);
  } catch {
    console.log("[thumbs] no public/project-assets; skip");
    return;
  }
  try {
    files = await walkFiles(ASSETS_ROOT);
  } catch (e) {
    console.error("[thumbs] walk failed", e);
    process.exit(1);
  }

  const seenBases = new Map();
  let created = 0;
  let skipped = 0;

  for (const abs of files) {
    const rel = relative(PUBLIC, abs);
    const dir = dirname(abs);
    const name = basename(abs);
    const thumbName = thumbNameForSource(name);
    const outPath = join(dir, thumbName);
    const key = `${dir}/${thumbName}`;

    if (seenBases.has(key)) {
      console.warn(`[thumbs] skip (duplicate output): ${rel} → ${thumbName}`);
      continue;
    }
    seenBases.set(key, true);

    if (!FORCE) {
      try {
        await stat(outPath);
        skipped += 1;
        continue;
      } catch {
        /* no thumb yet */
      }
    }

    try {
      await sharp(abs)
        .rotate()
        .resize({
          width: THUMB_MAX_W,
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toFile(outPath);
      created += 1;
      console.log(
        `[thumbs] ${FORCE ? "rewrote" : "wrote"} ${relative(PUBLIC, outPath)}`,
      );
    } catch (e) {
      console.error(`[thumbs] failed: ${rel}`, e);
      process.exit(1);
    }
  }

  const doneVerb = FORCE ? "rewrote" : "created";
  console.log(
    `[thumbs] done: ${created} ${doneVerb}, ${skipped} skipped (unchanged), ${files.length} sources`,
  );
}

main();
