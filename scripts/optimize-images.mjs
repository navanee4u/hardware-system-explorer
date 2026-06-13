/**
 * optimize-images.mjs — shrink example-card art to web size.
 *
 *   node scripts/optimize-images.mjs
 *
 * Resizes every public/examples/<slug>.png to a 1100px-wide optimized JPEG
 * (<slug>.jpg) and removes the heavy source PNG. The cards display at ~400px, so
 * 1100px is crisp on retina while landing in the tens-of-KB range. Re-run any time
 * you drop a fresh full-res PNG into the folder.
 */
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "examples");
const WIDTH = 1100;
const QUALITY = 82;

const pngs = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".png"));
if (pngs.length === 0) {
  console.log("No .png files to optimize in public/examples.");
  process.exit(0);
}

let ok = 0;
for (const file of pngs) {
  const slug = file.replace(/\.png$/i, "");
  const src = join(DIR, file);
  const dst = join(DIR, `${slug}.jpg`);
  try {
    const inBuf = readFileSync(src);
    const out = await sharp(inBuf)
      .resize({ width: WIDTH, withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    writeFileSync(dst, out);
    unlinkSync(src); // drop the heavy PNG
    console.log(`  ✓ ${slug}: ${(inBuf.length / 1024).toFixed(0)} KB → ${(out.length / 1024).toFixed(0)} KB (.jpg)`);
    ok++;
  } catch (err) {
    console.error(`  ✗ ${slug} — ${err.message}`);
  }
}
console.log(`\n${ok}/${pngs.length} optimized.`);
process.exit(ok === pngs.length ? 0 : 1);
