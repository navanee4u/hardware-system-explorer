export const meta = {
  name: 'hse-example-art',
  description: 'Author 10 cohesive SVG hero illustrations for the example gallery (rasterized to PNG after)',
  phases: [{ title: 'Illustrate', detail: 'one Opus agent per hardware system, shared style contract' }],
}

const ROOT = 'C:\\Users\\navan\\RF\\Claude_Fable_Build\\System-Explorer'

const STYLE = `
You are a senior product illustrator. Author ONE complete, standalone SVG illustration — a premium
hero image for a product card in a hardware-design web app (Rapidflare brand).

HARD REQUIREMENTS (a renderer with limited font/filter support will rasterize this — obey exactly):
- Root element EXACTLY: <svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"> … </svg>
- Style: flat, modern, premium vector illustration — clean geometric shapes, smooth bezier paths,
  subtle linear/radial gradients for depth and lighting. High-end tech "onboarding illustration" feel.
- Background: full-bleed 800x500 subtle gradient (sky→violet or zinc tones). Add a faint horizon,
  glow, or sparse accent dots/grid so it feels designed.
- PALETTE ONLY (you may vary opacity): sky #0284c7, deep blue #0369a1, violet #6048f0, indigo #4338ca,
  white #ffffff, zinc #0f172a #1e293b #334155 #64748b #94a3b8 #cbd5e1 #e2e8f0, plus one warm accent
  #f59e0b allowed sparingly for lights/indicators.
- SUBJECT: a clearly recognizable, CENTERED, large depiction of the system below, filling ~70% of the
  frame, with tasteful detail (panel lines, highlights, a soft ground shadow, lens glints, status LEDs).
- FORBIDDEN: no <text>/<tspan> (fonts will not render), no external <image>/href, no <foreignObject>,
  no <script>. Self-contained shapes/paths/gradients only. At most a simple <feGaussianBlur> for a soft
  shadow/glow — prefer gradients over filters.
- Must be valid, self-contained SVG that renders correctly on its own.

Make it genuinely attractive and distinctive — this is demo-facing. Cohesive with its 9 siblings (same
palette + flat style) but unmistakably ITS subject.

After authoring, WRITE the SVG to this exact file with the Write tool:
  ${ROOT}\\public\\examples\\<SLUG>.svg
Then return { slug, bytes } where bytes = the byte length of the SVG you wrote.
`

const SYSTEMS = [
  { slug: 'inspection-drone', subject: 'an autonomous quadcopter INSPECTION DRONE seen at a dynamic 3/4 angle: four arms with rotors, a central body, and an underslung stabilized gimbal CAMERA. Optional faint power-line cables in the background.' },
  { slug: 'humanoid-head', subject: 'the HEAD and upper shoulders of a friendly white-and-grey SERVICE HUMANOID ROBOT: smooth helmet-like head, two glowing blue camera eyes, a visor band, and a visible pan-tilt neck joint.' },
  { slug: 'delivery-robot', subject: 'a compact six-wheeled autonomous SIDEWALK DELIVERY ROBOT: rounded cargo box body with a lid, six small wheels, a short sensor mast with a camera, and a friendly front light bar.' },
  { slug: 'robotic-arm', subject: 'a six-axis industrial COLLABORATIVE ROBOTIC ARM mounted on a base: several jointed segments, a wrist with a small camera, and a two-finger gripper, posed mid-reach.' },
  { slug: 'crop-drone', subject: 'an AGRICULTURAL CROP-SCOUT DRONE flying low over rows of green crops: quad/hex rotor drone with a downward multispectral camera, stylized field rows and a low horizon below.' },
  { slug: 'sar-quadruped', subject: 'a rugged four-legged SEARCH-AND-RESCUE QUADRUPED ROBOT: dog-like articulated legs, a sturdy body, and a thermal-imaging camera TURRET on its back, posed walking.' },
  { slug: 'warehouse-amr', subject: 'a low-profile AUTONOMOUS MOBILE ROBOT (AMR) carrying a tall storage SHELF on its back through a warehouse: flat rounded chassis, lidar puck, subtle shelving/aisle hints behind.' },
  { slug: 'underwater-rov', subject: 'a compact yellow-and-black UNDERWATER INSPECTION ROV submerged: boxy frame with thruster nozzles, two bright LED floodlights casting beams, and a round glass camera dome. Blue water gradient with light rays.' },
  { slug: 'fpv-gimbal', subject: 'a lightweight carbon-fibre CINEMATIC FPV DRONE at a dramatic angle: slim X-frame, four motors/props, and a prominent front 3-AXIS BRUSHLESS GIMBAL holding a small cinema camera.' },
  { slug: 'hale-drone', subject: 'a HIGH-ALTITUDE SOLAR DRONE with an extremely long slender glider WING covered in a grid of solar cells, a slim fuselage and twin props, gliding above a sea of clouds with a deep-blue stratosphere sky.' },
]

phase('Illustrate')

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['slug', 'bytes'],
  properties: { slug: { type: 'string' }, bytes: { type: 'number' }, note: { type: 'string' } },
}

const results = await parallel(
  SYSTEMS.map((s) => () =>
    agent(`${STYLE}\n\n=== YOUR SUBJECT ===\nSLUG: ${s.slug}\nDEPICT: ${s.subject}`, {
      label: s.slug,
      phase: 'Illustrate',
      agentType: 'general-purpose',
      schema: SCHEMA,
    }),
  ),
)

return { authored: results.filter(Boolean) }
