/**
 * rasterize-svgs.mjs — render every public/examples/<slug>.svg to <slug>.png at
 * 2x card resolution. Offline, deterministic; no network. Run after the SVG
 * illustrations are authored.
 *
 *   node scripts/rasterize-svgs.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "public", "examples");
const WIDTH = 1024; // 2x the ~512px card for crisp rendering

const svgs = readdirSync(DIR).filter((f) => f.endsWith(".svg"));
if (svgs.length === 0) {
  console.error("No .svg files in public/examples — author them first.");
  process.exit(1);
}

let ok = 0;
for (const file of svgs) {
  const slug = file.replace(/\.svg$/, "");
  try {
    const svg = readFileSync(join(DIR, file), "utf8");
    const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();
    writeFileSync(join(DIR, `${slug}.png`), png);
    console.log(`  ✓ ${slug}.png — ${(png.length / 1024).toFixed(0)} KB`);
    ok++;
  } catch (err) {
    console.error(`  ✗ ${slug} — ${err.message}`);
  }
}
console.log(`\n${ok}/${svgs.length} rasterized.`);
process.exit(ok === svgs.length ? 0 : 1);
