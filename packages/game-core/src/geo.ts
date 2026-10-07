import type { LatLng } from "./types.js";

const EARTH_RADIUS_M = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in metres (haversine). */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when `point` is within `radiusM` of `origin`. */
export function isWithinReach(args: {
  origin: LatLng;
  point: LatLng;
  radiusM: number;
}): boolean {
  return distanceMetres(args.origin, args.point) <= args.radiusM;
}
