export const SYSTEMS = ["reactor", "beams", "missiles", "maneuver", "impulse", "shields"] as const;
export type SystemName = (typeof SYSTEMS)[number];

export interface SystemState {
  power: number;    // objetivo 0..3 (1 = normal)
  coolant: number;  // 0..10
  heat: number;     // 0..1; a 1.0 el sistema se daña
  health: number;   // 0..1
}

export const COOLANT_BUDGET = 10;
export const ENERGY_MAX = 1000;

const HEAT_PER_OVERPOWER = 0.05;  // calor/s por punto de potencia >1
const COOL_PER_COOLANT = 0.012;   // enfriamiento/s por unidad de refrigerante
const PASSIVE_COOL = 0.005;
const OVERHEAT_DAMAGE = 0.08;     // daño/s con calor al máximo
const REPAIR_RATE = 0.03;         // salud/s del equipo de reparación
const ENERGY_USE_PER_POWER = 0.6; // energía/s por sistema a potencia 1
const REACTOR_GEN = 4.5;          // energía/s del reactor a potencia 1

export class EngineeringSuite {
  systems: Record<SystemName, SystemState>;
  energy = ENERGY_MAX;
  repairing: SystemName | null = null;

  constructor() {
    this.systems = Object.fromEntries(
      SYSTEMS.map((s) => [s, { power: 1, coolant: 0, heat: 0, health: 1 }]),
    ) as Record<SystemName, SystemState>;
  }

  setPower(system: SystemName, value: number): void {
    const s = this.systems[system];
    if (s) s.power = Math.max(0, Math.min(3, value));
  }

  /** Asigna refrigerante respetando el presupuesto total: recorta lo que sobre. */
  setCoolant(system: SystemName, value: number): void {
    const s = this.systems[system];
    if (!s) return;
    const others = SYSTEMS.filter((n) => n !== system).reduce(
      (sum, n) => sum + this.systems[n].coolant,
      0,
    );
    s.coolant = Math.max(0, Math.min(10, Math.min(value, COOLANT_BUDGET - others)));
  }

  setRepair(system: SystemName | null): void {
    this.repairing = system;
  }

  /** Eficacia real de un sistema: potencia limitada por salud (y por energía agotada). */
  effectiveness(system: SystemName): number {
    const s = this.systems[system];
    const starved = this.energy <= 0 ? 0.2 : 1;
    return Math.max(0, s.power * s.health * starved);
  }

  tick(dt: number): void {
    // Energía: el reactor genera, el resto consume
    let net = 0;
    for (const name of SYSTEMS) {
      const s = this.systems[name];
      if (name === "reactor") net += REACTOR_GEN * s.power * s.health;
      else net -= ENERGY_USE_PER_POWER * s.power;
    }
    this.energy = Math.max(0, Math.min(ENERGY_MAX, this.energy + net * dt));

    // Calor, daño por sobrecalentamiento y reparación
    for (const name of SYSTEMS) {
      const s = this.systems[name];
      const heating = Math.max(0, s.power - 1) * HEAT_PER_OVERPOWER;
      const cooling = s.coolant * COOL_PER_COOLANT + PASSIVE_COOL;
      s.heat = Math.max(0, Math.min(1, s.heat + (heating - cooling) * dt));
      if (s.heat >= 1) s.health = Math.max(0, s.health - OVERHEAT_DAMAGE * dt);
      if (this.repairing === name) s.health = Math.min(1, s.health + REPAIR_RATE * dt);
    }
  }

  /** Daño de combate: golpea un sistema aleatorio. */
  damageRandomSystem(amount: number, rng: () => number): SystemName {
    const name = SYSTEMS[Math.floor(rng() * SYSTEMS.length)]!;
    const s = this.systems[name];
    s.health = Math.max(0, s.health - amount);
    return name;
  }

  snapshot(): { energy: number; energyMax: number; repairing: SystemName | null; systems: Record<SystemName, SystemState> } {
    return {
      energy: Math.round(this.energy),
      energyMax: ENERGY_MAX,
      repairing: this.repairing,
      systems: Object.fromEntries(
        SYSTEMS.map((n) => {
          const s = this.systems[n];
          return [n, {
            power: Math.round(s.power * 100) / 100,
            coolant: s.coolant,
            heat: Math.round(s.heat * 1000) / 1000,
            health: Math.round(s.health * 1000) / 1000,
          }];
        }),
      ) as Record<SystemName, SystemState>,
    };
  }
}
