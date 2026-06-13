/**
 * gen-images.mjs — generate the 10 example-card images with Gemini "nano banana"
 * (gemini-2.5-flash-image) and save them to public/examples/<slug>.png.
 *
 *   node scripts/gen-images.mjs            # generate any missing images
 *   node scripts/gen-images.mjs --force    # regenerate all
 *   node scripts/gen-images.mjs <slug>     # regenerate one
 *
 * Reads GEMINI_API_KEY from .env.local (or process env). Never prints the key.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "examples");

function loadEnvLocal() {
  try {
    for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* rely on process env */
  }
}
loadEnvLocal();

const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image"; // Nano Banana 2
if (!KEY) {
  console.error("✗ GEMINI_API_KEY not set. Add it to .env.local (https://aistudio.google.com/apikey).");
  process.exit(1);
}

const STYLE =
  "Professional hardware product render, sleek modern industrial design, sky-blue (#0284c7) and " +
  "violet (#6048f0) accent lighting, clean soft-gradient studio background, crisp high detail, " +
  "cinematic 16:10 composition, centered hero subject, no text, no watermark, no logos.";

const SUBJECTS = {
  "inspection-drone": "a sleek autonomous quadcopter inspection drone with a stabilized gimbal camera pod, hovering beside high-voltage power lines",
  "humanoid-head": "the head and shoulders of a friendly white-and-grey service humanoid robot with glowing blue camera-eye sensors and a neck pan-tilt joint",
  "delivery-robot": "a compact six-wheeled autonomous sidewalk delivery robot with a sealed cargo compartment and a small sensor mast, on a city sidewalk",
  "robotic-arm": "a six-axis collaborative industrial robotic arm with an eye-in-hand camera and a precision gripper, on a clean workbench",
  "crop-drone": "an agricultural crop-scouting drone flying low over rows of green crops, a multispectral camera mounted underneath",
  "sar-quadruped": "a rugged four-legged search-and-rescue robot with a thermal-imaging camera turret on its back, walking through smoky rubble",
  "warehouse-amr": "a low-profile orange-and-black autonomous mobile robot (AMR) carrying a storage shelf through a modern warehouse aisle",
  "underwater-rov": "a compact yellow underwater inspection ROV with bright LED floodlights and a glass camera dome, submerged in clear blue water",
  "fpv-gimbal": "a lightweight carbon-fibre cinematic FPV drone with a three-axis brushless gimbal camera, dramatic dynamic angle",
  "hale-drone": "a high-altitude long-endurance solar-powered relay drone with an extremely long slender wing covered in solar cells, gliding in the stratosphere above a sea of clouds",
};

async function generate(slug) {
  const prompt = `${SUBJECTS[slug]}. ${STYLE}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    const text = parts.find((p) => p.text)?.text ?? "(no parts)";
    throw new Error(`no image in response: ${text.slice(0, 160)}`);
  }
  const buf = Buffer.from(img.inlineData.data, "base64");
  writeFileSync(join(OUT_DIR, `${slug}.png`), buf);
  return buf.length;
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.find((a) => !a.startsWith("--"));
const slugs = only ? [only] : Object.keys(SUBJECTS);

mkdirSync(OUT_DIR, { recursive: true });
console.log(`→ Model ${MODEL} · ${slugs.length} image(s) → public/examples/`);
let ok = 0;
for (const slug of slugs) {
  const path = join(OUT_DIR, `${slug}.png`);
  if (!force && !only && existsSync(path)) {
    console.log(`  • ${slug} — exists, skipping (use --force to redo)`);
    ok++;
    continue;
  }
  try {
    const bytes = await generate(slug);
    console.log(`  ✓ ${slug} — ${(bytes / 1024).toFixed(0)} KB`);
    ok++;
  } catch (err) {
    console.error(`  ✗ ${slug} — ${err.message}`);
  }
}
console.log(`\n${ok}/${slugs.length} ready.`);
process.exit(ok === slugs.length ? 0 : 1);
