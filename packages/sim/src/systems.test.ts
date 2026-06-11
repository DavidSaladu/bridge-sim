import { describe, expect, it } from "vitest";
import { EngineeringSuite, COOLANT_BUDGET } from "./systems.js";

describe("EngineeringSuite", () => {
  it("sobrepotencia genera calor; el refrigerante lo contiene", () => {
    const eng = new EngineeringSuite();
    eng.setPower("beams", 3);
    for (let i = 0; i < 20 * 10; i++) eng.tick(0.05); // 10 s
    const hot = eng.systems.beams.heat;
    expect(hot).toBeGreaterThan(0.5);

    const eng2 = new EngineeringSuite();
    eng2.setPower("beams", 3);
    eng2.setCoolant("beams", 10);
    for (let i = 0; i < 20 * 10; i++) eng2.tick(0.05);
    expect(eng2.systems.beams.heat).toBeLessThan(hot / 2);
  });

  it("el sobrecalentamiento daña el sistema y la reparación lo recupera", () => {
    const eng = new EngineeringSuite();
    eng.setPower("impulse", 3);
    for (let i = 0; i < 20 * 60; i++) eng.tick(0.05); // 60 s al rojo
    expect(eng.systems.impulse.health).toBeLessThan(1);
    const damaged = eng.systems.impulse.health;
    eng.setPower("impulse", 1);
    eng.setRepair("impulse");
    for (let i = 0; i < 20 * 20; i++) eng.tick(0.05);
    expect(eng.systems.impulse.health).toBeGreaterThan(damaged);
  });

  it("el presupuesto de refrigerante es global", () => {
    const eng = new EngineeringSuite();
    eng.setCoolant("beams", 8);
    eng.setCoolant("impulse", 8); // solo quedan 2
    expect(eng.systems.beams.coolant + eng.systems.impulse.coolant).toBeLessThanOrEqual(COOLANT_BUDGET);
    expect(eng.systems.impulse.coolant).toBe(2);
  });

  it("sin reactor, la energía se agota y los sistemas pierden eficacia", () => {
    const eng = new EngineeringSuite();
    eng.setPower("reactor", 0);
    for (let i = 0; i < 20 * 400; i++) eng.tick(0.05);
    expect(eng.energy).toBe(0);
    expect(eng.effectiveness("impulse")).toBeLessThan(0.3);
  });

  it("la eficacia escala con la potencia", () => {
    const eng = new EngineeringSuite();
    eng.setPower("impulse", 2);
    expect(eng.effectiveness("impulse")).toBeCloseTo(2);
  });
});
