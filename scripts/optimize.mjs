// Optimizes source 3D models (source-models/*.glb) into web-ready files (site/models/*.glb)
// and scales each one to its real-world height from models.json (needed for AR).
//
//   npm run optimize            → all models
//   npm run optimize:one m4     → a single model
//
// Settings can be tuned per run with env vars, e.g.
//   TEXTURE_SIZE=1024 SIMPLIFY_RATIO=0.3 npm run optimize
import { readdirSync, readFileSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, draco } from '@gltf-transform/functions';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import { measure } from './measure.mjs';
import { targetHeightCm } from './sizes.mjs';

const SRC = 'source-models';
// Three builds of every model: full quality for desktop, a light one for phones
// (phones have little GPU memory: a 2048px texture set alone takes ~67 MB there), and
// an AR build for Google Scene Viewer on Android, which reads the file itself and only
// supports plain glTF: JPEG textures + Draco, no WebP and no quantization.
const VARIANTS = [
  { out: join('site', 'models'),           textureSize: process.env.TEXTURE_SIZE ?? '2048', simplifyRatio: process.env.SIMPLIFY_RATIO ?? '0.2' },
  { out: join('site', 'models', 'mobile'), textureSize: process.env.MOBILE_TEXTURE_SIZE ?? '1024', simplifyRatio: process.env.MOBILE_SIMPLIFY_RATIO ?? '0.1' },
  { out: join('site', 'models', 'ar'),     textureSize: '1024', simplifyRatio: process.env.MOBILE_SIMPLIFY_RATIO ?? '0.1', sceneViewer: true },
];
const SIMPLIFY_ERROR = process.env.SIMPLIFY_ERROR ?? '0.0005';
const COMPRESS = process.env.COMPRESS ?? 'quantize';        // quantize | draco

const sizes = JSON.parse(readFileSync('models.json', 'utf8'));
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1]?.replace(/\.glb$/, '') : null;

const files = readdirSync(SRC)
  .filter((f) => f.endsWith('.glb'))
  .filter((f) => !only || basename(f, '.glb') === only)
  .sort();

if (!files.length) {
  console.error(only ? `No ${only}.glb in ${SRC}/` : `No .glb files in ${SRC}/ — put the original models there first.`);
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
// Real height per model, measured once on the full-detail source so both builds match.
const target = {};
for (const f of files) {
  const id = basename(f, '.glb');
  const src = await io.read(join(SRC, f));
  target[id] = targetHeightCm(sizes[id], measure(src.getRoot().listScenes()[0]));
}
const mb = (p) => (statSync(p).size / 1048576).toFixed(2) + ' MB';

for (const { out: OUT, textureSize: TEXTURE_SIZE, simplifyRatio: SIMPLIFY_RATIO, sceneViewer } of VARIANTS) {
mkdirSync(OUT, { recursive: true });
console.log(`\n${OUT}  (textures ${TEXTURE_SIZE}px, simplify ${SIMPLIFY_RATIO})`);
for (const f of files) {
  const id = basename(f, '.glb');
  const heightCm = target[id].cm;

  const input = join(SRC, f);
  const tmp = join(OUT, `.${id}.tmp.glb`);
  const output = join(OUT, f);

  execFileSync('npx', [
    'gltf-transform', 'optimize', input, tmp,
    // 'quantize' (KHR_mesh_quantization) loads natively in <model-viewer>.
    // Do NOT use 'meshopt' here: model-viewer has no meshopt decoder by default.
    // The Scene Viewer build is compressed below (JPEG + Draco) instead.
    '--compress', sceneViewer ? 'false' : COMPRESS,
    '--texture-compress', sceneViewer ? 'false' : 'webp',
    '--texture-size', TEXTURE_SIZE,
    '--simplify-ratio', SIMPLIFY_RATIO,
    '--simplify-error', SIMPLIFY_ERROR,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });

  // Scale to real height (1 unit = 1 metre), centre the footprint and put the feet exactly
  // at y = 0 (floorY ignores stray vertices below the feet, which would make it float in AR).
  // A wrapper node keeps this for Android Scene Viewer and iOS Quick Look, which use the file as is.
  const doc = await io.read(tmp);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const m = measure(scene);
  const s = heightCm / 100 / m.H;
  const root = doc.createNode('real-size').setScale([s, s, s]).setTranslation([-m.cx * s, -m.floorY * s, -m.cz * s]);
  for (const child of scene.listChildren()) { scene.removeChild(child); root.addChild(child); }
  scene.addChild(root);
  if (sceneViewer) {
    const size = +TEXTURE_SIZE;
    await doc.transform(
      textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [size, size], quality: 88 }),
      draco({ method: 'edgebreaker' }),
    );
  }
  await io.write(output, doc);
  rmSync(tmp);

  const b = getBounds(scene);
  const cm = (i) => Math.round((b.max[i] - b.min[i]) * 100);
  if (Math.abs(b.min[1]) > 0.003) console.warn(`  ! ${id}: lowest point at ${(b.min[1] * 100).toFixed(1)} cm (stray geometry below the feet)`);
  console.log(`${f.padEnd(8)} ${mb(input).padStart(9)} → ${mb(output).padStart(8)}   ${cm(0)} × ${cm(2)} × ${cm(1)} cm (W×D×H), feet at y=${(b.min[1] * 100).toFixed(1)} cm   [${target[id].from}]`);
}
}
