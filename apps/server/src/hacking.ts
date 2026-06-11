export type HackSystem = "shields" | "engines" | "beams";

export interface HackSession {
  targetId: number;
  targetCallSign: string;
  system: HackSystem;
  board: number[][];     // -1 mina, 0-8 = minas adyacentes
  revealed: boolean[][];
  safeLeft: number;
  status: "playing" | "success" | "failed";
}

export const HACK_ROWS = 8;
export const HACK_COLS = 8;
export const HACK_MINES = 10;
export const HACK_SAFE_GOAL = 14;
export const HACK_RANGE = 3000;

export function createBoard(rng: () => number): number[][] {
  const board: number[][] = Array.from({ length: HACK_ROWS }, () => Array(HACK_COLS).fill(0));
  let placed = 0;
  while (placed < HACK_MINES) {
    const x = Math.floor(rng() * HACK_COLS);
    const y = Math.floor(rng() * HACK_ROWS);
    if (board[y]![x] === -1) continue;
    board[y]![x] = -1;
    placed++;
  }
  for (let y = 0; y < HACK_ROWS; y++) {
    for (let x = 0; x < HACK_COLS; x++) {
      if (board[y]![x] === -1) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < HACK_ROWS && xx >= 0 && xx < HACK_COLS && board[yy]![xx] === -1) n++;
        }
      }
      board[y]![x] = n;
    }
  }
  return board;
}

export function createSession(targetId: number, targetCallSign: string, system: HackSystem, rng: () => number): HackSession {
  return {
    targetId, targetCallSign, system,
    board: createBoard(rng),
    revealed: Array.from({ length: HACK_ROWS }, () => Array(HACK_COLS).fill(false)),
    safeLeft: HACK_SAFE_GOAL,
    status: "playing",
  };
}

/** Revela una celda (con expansión de ceros). Devuelve las celdas reveladas en esta acción. */
export function reveal(session: HackSession, x: number, y: number): { x: number; y: number; v: number }[] {
  if (session.status !== "playing") return [];
  if (x < 0 || x >= HACK_COLS || y < 0 || y >= HACK_ROWS) return [];
  if (session.revealed[y]![x]) return [];

  const out: { x: number; y: number; v: number }[] = [];
  if (session.board[y]![x] === -1) {
    session.revealed[y]![x] = true;
    session.status = "failed";
    return [{ x, y, v: -1 }];
  }
  // BFS de ceros
  const queue: [number, number][] = [[x, y]];
  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    if (cx < 0 || cx >= HACK_COLS || cy < 0 || cy >= HACK_ROWS) continue;
    if (session.revealed[cy]![cx] || session.board[cy]![cx] === -1) continue;
    session.revealed[cy]![cx] = true;
    const v = session.board[cy]![cx]!;
    out.push({ x: cx, y: cy, v });
    if (v === 0) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) queue.push([cx + dx, cy + dy]);
      }
    }
  }
  session.safeLeft = Math.max(0, session.safeLeft - out.length);
  if (session.safeLeft === 0) session.status = "success";
  return out;
}

/** Todas las celdas reveladas (para reconstruir el estado en cliente). */
export function revealedCells(session: HackSession): { x: number; y: number; v: number }[] {
  const out: { x: number; y: number; v: number }[] = [];
  for (let y = 0; y < HACK_ROWS; y++) {
    for (let x = 0; x < HACK_COLS; x++) {
      if (session.revealed[y]![x]) out.push({ x, y, v: session.board[y]![x]! });
    }
  }
  return out;
}
