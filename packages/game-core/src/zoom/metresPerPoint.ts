/**
 * Metres covered by one map point (pixel) at `zoom` and `lat`.
 *
 * Uses the Web Mercator constant from the plan:
 * `78271.517 * cos(lat) / 2^zoom`.
 */
export function metresPerPoint(latDegrees: number, zoom: number): number {
  const cosLat = Math.cos((latDegrees * Math.PI) / 180);
  return (78271.517 * cosLat) / 2 ** zoom;
}

/** Approximate on-screen size of a feature of `metres` at the given zoom. */
export function metresToPoints(args: {
  metres: number;
  latDegrees: number;
  zoom: number;
}): number {
  const mpp = metresPerPoint(args.latDegrees, args.zoom);
  if (mpp <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return args.metres / mpp;
}
