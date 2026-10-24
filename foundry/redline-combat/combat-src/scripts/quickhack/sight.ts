/** Wall-based sight from the attacker center to nine inset points on the target. */
export function hasQuickhackSight(source: Token, target: Token): boolean {
  const backend = CONFIG.Canvas.polygonBackends.sight;
  if (!backend || !(target.w > 0) || !(target.h > 0)) return false;
  const center = target.center;
  const offsets = [0, -0.4, 0.4];
  for (const x of offsets) for (const y of offsets) {
    const point = { x: center.x + x * target.w, y: center.y + y * target.h };
    if (!backend.testCollision(source.center, point, { type: "sight", mode: "any" })) return true;
  }
  return false;
}
