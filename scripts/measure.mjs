// Geometry measurements shared by optimize.mjs and analyze-models.mjs.
// Models face +z, y is up.

/** All vertex positions of a scene in world space. */
export function worldPoints(scene) {
  const pts = [];
  scene.traverse((node) => {
    const mesh = node.getMesh(); if (!mesh) return;
    const m = node.getWorldMatrix(); const v = [0, 0, 0];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        pts.push([
          m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
          m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
          m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
        ]);
      }
    }
  });
  return pts;
}

/**
 * Bounds plus a robust floor and seat estimate.
 * floorY: lowest point that a real contact patch reaches (ignores a few stray vertices
 *         hanging below the feet, which would make the model float in AR).
 * seatRatio: seat surface height / total height — median top of a height map over the
 *            front-centre area below 75% height.
 */
export function measure(scene) {
  const pts = worldPoints(scene);
  const ys = pts.map((p) => p[1]).sort((a, b) => a - b);
  const mm = (k) => pts.reduce((a, p) => [Math.min(a[0], p[k]), Math.max(a[1], p[k])], [Infinity, -Infinity]);
  const [x0, x1] = mm(0), [z0, z1] = mm(2);
  const maxY = ys[ys.length - 1];
  // floor = lowest y that at least 0.05% of vertices are within 2 mm-equivalent of
  const H0 = maxY - ys[0], tol = 0.002 * H0, need = Math.max(20, Math.floor(ys.length * 0.0005));
  let floorY = ys[0];
  for (let i = 0; i < ys.length; i++) {
    let j = i; while (j < ys.length && ys[j] - ys[i] <= tol) j++;
    if (j - i >= need) { floorY = ys[i]; break; }
  }
  const H = maxY - floorY, W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const G = 12, cells = new Map();
  for (const p of pts) {
    if (Math.abs(p[0] - cx) > 0.2 * W || p[2] < cz - 0.15 * D || p[2] > cz + 0.3 * D || p[1] > floorY + 0.75 * H) continue;
    const k = Math.floor((p[0] - cx + 0.2 * W) / (0.4 * W) * G) + ',' + Math.floor((p[2] - cz + 0.15 * D) / (0.45 * D) * G);
    cells.set(k, Math.max(cells.get(k) ?? -Infinity, p[1]));
  }
  const tops = [...cells.values()].map((y) => y - floorY).filter((y) => y > 0.2 * H).sort((a, b) => a - b);
  const seatRatio = tops.length ? tops[Math.floor(tops.length / 2)] / H : NaN;
  return { floorY, strayBelow: floorY - ys[0], H, W, D, cx, cz, seatRatio };
}
