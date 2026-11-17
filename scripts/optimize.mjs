// Optimizes source 3D models (source-models/*.glb) into web-ready files (site/models/*.glb).
//
//   npm run optimize            → all models
//   npm run optimize:one m4     → a single model
//
// Settings can be tuned per run with env vars, e.g.
//   TEXTURE_SIZE=1024 SIMPLIFY_RATIO=0.3 npm run optimize
import { readdirSync, mkdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const SRC = 'source-models';
const OUT = join('site', 'models');
const TEXTURE_SIZE = process.env.TEXTURE_SIZE ?? '2048';   // keep 2048: embroidery detail matters
const SIMPLIFY_RATIO = process.env.SIMPLIFY_RATIO ?? '0.2'; // ~400k → ~80k triangles
const SIMPLIFY_ERROR = process.env.SIMPLIFY_ERROR ?? '0.0005';
const COMPRESS = process.env.COMPRESS ?? 'quantize';        // quantize | draco

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

mkdirSync(OUT, { recursive: true });
const mb = (p) => (statSync(p).size / 1048576).toFixed(2) + ' MB';

for (const f of files) {
  const input = join(SRC, f);
  const output = join(OUT, f);
  execFileSync('npx', [
    'gltf-transform', 'optimize', input, output,
    // 'quantize' (KHR_mesh_quantization) loads natively in <model-viewer>.
    // Do NOT use 'meshopt' here: model-viewer has no meshopt decoder by default,
    // so such files silently fail to show.
    '--compress', COMPRESS,
    '--texture-compress', 'webp',
    '--texture-size', TEXTURE_SIZE,
    '--simplify-ratio', SIMPLIFY_RATIO,
    '--simplify-error', SIMPLIFY_ERROR,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`${f.padEnd(8)} ${mb(input).padStart(9)} → ${mb(output)}`);
}
