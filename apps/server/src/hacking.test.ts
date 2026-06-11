import { describe, expect, it } from "vitest";
import { HACK_MINES, HACK_ROWS, HACK_COLS, createSession, reveal } from "./hacking.js";

function rngFromSeed(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

describe("Hacking (buscaminas)", () => {
  it("el tablero tiene exactamente 10 minas y números coherentes", () => {
    const s = createSession(1, "X", "shields", rngFromSeed(7));
    const mines = s.board.flat().filter((v) => v === -1).length;
    expect(mines).toBe(HACK_MINES);
  });

  it("revelar mina = fallo; revelar 14 seguras = éxito", () => {
    const s = createSession(1, "X", "shields", rngFromSeed(7));
    // encontrar una mina y una celda segura
    let mine: [number, number] | null = null;
    outer: for (let y = 0; y < HACK_ROWS; y++) {
      for (let x = 0; x < HACK_COLS; x++) {
        if (s.board[y]![x] === -1) { mine = [x, y]; break outer; }
      }
    }
    const fail = createSession(1, "X", "shields", rngFromSeed(7));
    reveal(fail, mine![0], mine![1]);
    expect(fail.status).toBe("failed");

    // revelar seguras hasta ganar
    const win = createSession(1, "X", "shields", rngFromSeed(7));
    for (let y = 0; y < HACK_ROWS && win.status === "playing"; y++) {
      for (let x = 0; x < HACK_COLS && win.status === "playing"; x++) {
        if (win.board[y]![x] !== -1) reveal(win, x, y);
      }
    }
    expect(win.status).toBe("success");
  });

  it("revelar un cero expande en cascada", () => {
    // buscar una semilla con algún 0
    for (let seed = 1; seed < 50; seed++) {
      const s = createSession(1, "X", "shields", rngFromSeed(seed));
      let zero: [number, number] | null = null;
      outer: for (let y = 0; y < HACK_ROWS; y++) {
        for (let x = 0; x < HACK_COLS; x++) {
          if (s.board[y]![x] === 0) { zero = [x, y]; break outer; }
        }
      }
      if (!zero) continue;
      const cells = reveal(s, zero[0], zero[1]);
      expect(cells.length).toBeGreaterThan(1);
      return;
    }
    throw new Error("ninguna semilla con ceros");
  });
});
