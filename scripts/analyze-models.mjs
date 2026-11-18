// Prints, for each source model: proportions, floor contact and seat height ratio,
// plus the real size the optimizer will produce from models.json. Read-only.
//   node scripts/analyze-models.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { measure } from './measure.mjs';
import { targetHeightCm } from './sizes.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const SRC = 'source-models';
const sizes = JSON.parse(readFileSync('models.json', 'utf8'));

for (const f of readdirSync(SRC).filter((f) => f.endsWith('.glb')).sort()) {
  const id = basename(f, '.glb');
  const doc = await io.read(join(SRC, f));
  const m = measure(doc.getRoot().listScenes()[0]);
  const h = targetHeightCm(sizes[id], m);
  const k = h.cm / 100 / m.H;
  const cm = (v) => Math.round(v * k * 100);
  console.log(`${id}  seat/H=${m.seatRatio.toFixed(3)}  stray below feet=${(m.strayBelow / m.H * 100).toFixed(2)}%  → ${cm(m.W)} × ${cm(m.D)} × ${h.cm} cm (W×D×H), seat ≈ ${Math.round(m.seatRatio * h.cm)} cm  [${h.from}]`);
}
