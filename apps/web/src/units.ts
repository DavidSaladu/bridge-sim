/** Unidades estilo Empty Epsilon: 1 U = 1000 m. */
export const U = 1000;

/** Distancia en U: "7.2 U" (sin decimal si es entero). */
export function distU(meters: number, decimals = 1): string {
  const u = meters / U;
  const s = u.toFixed(decimals);
  return (s.endsWith(".0") ? s.slice(0, -2) : s) + " U";
}

/** Velocidad en U/min, como EE: 125 m/s → "7.5 U/min". */
export function speedU(mps: number): string {
  return ((mps / U) * 60).toFixed(1) + " U/min";
}

/** Sector de 20U estilo EE: el origen está en F5. */
export function sectorName(x: number, y: number): string {
  const col = Math.floor(x / (20 * U)) + 5;
  const row = Math.floor(-y / (20 * U)) + 5;
  const letter = row >= 0 && row < 26 ? String.fromCharCode(65 + row) : "?";
  return letter + (col >= 0 ? String(col) : "?");
}
