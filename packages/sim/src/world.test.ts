import { describe, expect, it } from "vitest";
import { World, angleDiff, createTestScenario, norm } from "./world.js";

describe("ángulos", () => {
  it("norm y angleDiff", () => {
    expect(norm(-90)).toBe(270);
    expect(norm(370)).toBe(10);
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
  });
});

describe("PlayerShip", () => {
  it("acelera hasta la velocidad de impulso y avanza hacia el norte", () => {
    const w = new World(1);
    w.ship.setImpulse(1);
    for (let i = 0; i < 20 * 10; i++) w.tick(); // 10 s
    expect(w.ship.speed).toBeCloseTo(125, 0);
    expect(w.ship.y).toBeGreaterThan(900);
    expect(Math.abs(w.ship.x)).toBeLessThan(1e-6);
  });

  it("gira hacia el rumbo objetivo a velocidad limitada", () => {
    const w = new World(1);
    w.ship.setTargetHeading(90);
    w.tick(1); // 1 s → máx 12°
    expect(w.ship.heading).toBeCloseTo(12, 5);
    for (let i = 0; i < 20 * 20; i++) w.tick();
    expect(w.ship.heading).toBeCloseTo(90, 1);
  });

  it("clampa el impulso a [0,1]", () => {
    const w = new World(1);
    w.ship.setImpulse(5);
    expect(w.ship.impulse).toBe(1);
    w.ship.setImpulse(-2);
    expect(w.ship.impulse).toBe(0);
  });
});

describe("escenario", () => {
  it("es determinista con la misma semilla", () => {
    const a = createTestScenario(7);
    const b = createTestScenario(7);
    for (let i = 0; i < 200; i++) { a.tick(); b.tick(); }
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it("los CPU se mueven con el tiempo", () => {
    const w = createTestScenario(7);
    const before = w.snapshot().entities.find((e) => e.kind === "cpu");
    for (let i = 0; i < 20 * 5; i++) w.tick();
    const after = w.snapshot().entities.find((e) => e.kind === "cpu");
    expect(Math.hypot(after!.x - before!.x, after!.y - before!.y)).toBeGreaterThan(50);
  });
});
