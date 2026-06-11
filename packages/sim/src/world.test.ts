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

describe("Ciencia: escaneo", () => {
  it("sin escanear, el contacto no revela nombre, facción ni estado", () => {
    const w = new World(3);
    w.addCpuShip(1000, 1000, "KR-S");
    const e = w.snapshot().entities.find((x) => x.kind === "cpu")!;
    expect(e.scanned).toBe(false);
    expect(e.callSign).toBeUndefined();
    expect(e.faction).toBeUndefined();
    expect(e.hullFrac).toBeUndefined();
  });

  it("el escaneo tarda 6 s y revela todo", () => {
    const w = new World(3);
    const c = w.addCpuShip(1000, 1000, "KR-S");
    expect(w.ship.startScan(c.id, w)).toBe(true);
    for (let i = 0; i < 20 * 3; i++) w.tick();
    expect(w.snapshot().ship.scan?.progress).toBeGreaterThan(0.4);
    for (let i = 0; i < 20 * 4; i++) w.tick();
    const e = w.snapshot().entities.find((x) => x.kind === "cpu")!;
    expect(e.scanned).toBe(true);
    expect(e.callSign).toBe("KR-S");
    expect(e.faction).toBe("hostile");
    expect(e.hullFrac).toBeDefined();
  });

  it("fuera de alcance no se puede escanear", () => {
    const w = new World(3);
    const c = w.addCpuShip(0, 20000, "KR-F");
    expect(w.ship.startScan(c.id, w)).toBe(false);
  });
});

describe("Comms: waypoints y rendición", () => {
  it("añade y elimina waypoints (máx 9)", () => {
    const w = new World(4);
    for (let i = 0; i < 12; i++) w.addWaypoint(i * 100, 0);
    expect(w.snapshot().waypoints).toHaveLength(9);
    const first = w.snapshot().waypoints[0]!;
    w.removeWaypoint(first.id);
    expect(w.snapshot().waypoints).toHaveLength(8);
  });

  it("una nave rendida no ataca, es neutral y no bloquea la victoria", () => {
    const w = new World(4);
    const c = w.addCpuShip(0, 1000, "KR-R");
    c.scanned = true;
    c.surrendered = true;
    const shieldBefore = w.ship.shieldFront + w.ship.shieldRear;
    for (let i = 0; i < 20 * 8; i++) w.tick();
    expect(w.ship.shieldFront + w.ship.shieldRear).toBe(shieldBefore);
    expect(w.snapshot().entities.find((e) => e.kind === "cpu")?.faction).toBe("neutral");
    expect(w.hostilesAlive).toBe(0);
  });
});

describe("Mundo: estaciones, nebulosas y minas", () => {
  it("atraque: requiere cercanía y poca velocidad; repara y recarga", () => {
    const w = new World(8);
    w.addStation(0, 500, "DS-T");
    w.ship.hull = 100;
    w.ship.engineering.energy = 200;
    w.ship.speed = 100;
    expect(w.ship.requestDock(w)).toBe(false); // demasiado rápido
    w.ship.speed = 0;
    expect(w.ship.requestDock(w)).toBe(true);
    for (let i = 0; i < 20 * 10; i++) w.tick();
    expect(w.ship.hull).toBeGreaterThan(120);
    expect(w.ship.engineering.energy).toBeGreaterThan(400);
    expect(w.snapshot().ship.docked).toBe(true);
    w.ship.undock();
    expect(w.snapshot().ship.docked).toBe(false);
  });

  it("nebulosa: oculta contactos a más de 5 km, los revela de cerca", () => {
    const w = new World(8);
    w.addNebula(0, 8000, 2000);
    const c = w.addCpuShip(0, 8000, "KR-N");
    c.impulse = 0;
    expect(w.snapshot().entities.some((e) => e.id === c.id)).toBe(false);
    w.ship.y = 4000; // a 4 km del contacto
    expect(w.snapshot().entities.some((e) => e.id === c.id)).toBe(true);
  });

  it("mina: explota por proximidad y daña", () => {
    const w = new World(8);
    w.addMine(0, 900);
    const before = w.ship.shieldFront + w.ship.shieldRear + w.ship.hull;
    w.ship.setImpulse(1);
    let boom = false;
    for (let i = 0; i < 20 * 30 && !boom; i++) {
      w.tick();
      boom = w.snapshot().events.some?.((ev) => ev.k === "boom") || boom;
    }
    expect(boom).toBe(true);
    expect(w.ship.shieldFront + w.ship.shieldRear + w.ship.hull).toBeLessThan(before);
  });

  it("las minas no se ven a más de 5 km", () => {
    const w = new World(8);
    const m = w.addMine(0, 7000);
    expect(w.snapshot().entities.some((e) => e.id === m.id)).toBe(false);
    w.ship.y = 3000;
    expect(w.snapshot().entities.some((e) => e.id === m.id)).toBe(true);
  });
});
