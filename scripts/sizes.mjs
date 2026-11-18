// How tall a model should be in real life (cm), from its models.json entry:
//   heightCm — exact total height from the brand (wins when present)
//   seatCm   — seat height; total height is derived from the measured seat ratio
//   topCm    — for pieces you sit on top of (ottoman): total height = top height
export function targetHeightCm(entry = {}, m) {
  if (entry.heightCm) return { cm: entry.heightCm, from: 'heightCm (exact)' };
  if (entry.topCm) return { cm: entry.topCm, from: 'topCm' };
  if (entry.seatCm && Number.isFinite(m.seatRatio)) {
    return { cm: Math.round(entry.seatCm / m.seatRatio), from: `seatCm ${entry.seatCm} ÷ seat ratio` };
  }
  throw new Error('models.json entry needs heightCm, topCm or seatCm');
}
