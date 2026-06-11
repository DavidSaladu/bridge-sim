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

describe("Combate", () => {
  function closeWorld() {
    const w = new World(5);
    const enemy = w.addCpuShip(0, 800, "KR-T"); // delante, en rango de rayo
    return { w, enemy };
  }

  it("los rayos dañan al blanco en arco y rango, con cooldown", () => {
    const { w, enemy } = closeWorld();
    w.ship.setTarget(enemy.id);
    const before = enemy.shield + enemy.hull;
    w.tick();
    expect(enemy.shield + enemy.hull).toBeLessThan(before);
    const after1 = enemy.shield + enemy.hull;
    w.tick(); // cooldown: no dispara otra vez aún (el enemigo aún no llega a dañarnos en este tick tampoco necesariamente)
    expect(enemy.shield + enemy.hull).toBe(after1);
  });

  it("escudo absorbe antes que el casco", () => {
    const { w, enemy } = closeWorld();
    w.ship.setTarget(enemy.id);
    w.tick();
    expect(enemy.shield).toBeLessThan(enemy.shieldMax);
    expect(enemy.hull).toBe(70);
  });

  it("el blanco muere tras suficiente castigo y desaparece", () => {
    const { w, enemy } = closeWorld();
    enemy.shield = 0;
    enemy.hull = 5;
    w.ship.setTarget(enemy.id);
    w.tick();
    expect(enemy.dead).toBe(true);
    w.tick();
    expect(w.get(enemy.id)).toBeUndefined();
    expect(w.hostilesAlive).toBe(0);
  });

  it("tubo: cargar tarda 8 s y el misil persigue y destruye", () => {
    const w = new World(5);
    const enemy = w.addCpuShip(2000, 2000, "KR-M");
    enemy.impulse = 0; enemy.shield = 0; enemy.hull = 20;
    // mantener al enemigo lejos del modo ataque… está a <4500, así que vendrá; da igual para el misil
    w.ship.setTarget(enemy.id);
    w.ship.loadTube(0);
    expect(w.ship.tubes[0]!.state).toBe("loading");
    for (let i = 0; i < 20 * 8 + 1; i++) w.tick();
    expect(w.ship.tubes[0]!.state).toBe("loaded");
    w.ship.fireTube(0, w);
    expect(w.ship.tubes[0]!.state).toBe("empty");
    let died = false;
    for (let i = 0; i < 20 * 30 && !died; i++) { w.tick(); died = enemy.dead; }
    expect(died).toBe(true);
  });

  it("los hostiles atacan al jugador y los escudos encajan el daño", () => {
    const w = new World(5);
    w.addCpuShip(0, 1000, "KR-A");
    const startShield = w.ship.shieldFront + w.ship.shieldRear;
    for (let i = 0; i < 20 * 6; i++) w.tick();
    expect(w.ship.shieldFront + w.ship.shieldRear).toBeLessThan(startShield);
    expect(w.ship.hull).toBe(250);
  });

  it("sin escudos, el casco recibe daño y la nave puede morir", () => {
    const w = new World(5);
    w.addCpuShip(0, 1000, "KR-B");
    w.ship.setShields(false);
    w.ship.hull = 10;
    for (let i = 0; i < 20 * 12 && !w.playerDead; i++) w.tick();
    expect(w.playerDead).toBe(true);
  });
});
