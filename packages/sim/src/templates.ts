/**
 * Plantillas de naves con stats inspirados en los templates de Empty Epsilon.
 * Velocidades en m/s, alcances en metros, ciclos en segundos.
 */
export type FactionName = "Human Navy" | "Kraylor" | "Independent";

export interface BeamSpec {
  range: number;
  arc: number;
  cycle: number;
  dmg: number;
}

export interface ShipTemplate {
  name: string;
  shipClass: string;
  hullMax: number;
  maxSpeed: number;
  turnRate: number;
  accel: number;
  /** Naves de jugador: escudos proa/popa. */
  shieldFront?: number;
  shieldRear?: number;
  /** Naves IA: escudo único. */
  shield?: number;
  beam?: BeamSpec;
  tubes?: number;
  hasWarp?: boolean;
}

export const TEMPLATES = {
  // ——— Jugador ———
  Atlantis: {
    name: "Atlantis",
    shipClass: "Corbeta · Destructor",
    hullMax: 250,
    maxSpeed: 125,
    turnRate: 12,
    accel: 25,
    shieldFront: 200,
    shieldRear: 200,
    beam: { range: 1500, arc: 100, cycle: 6, dmg: 9 },
    tubes: 2,
    hasWarp: true,
  },
  // ——— IA ———
  "Phobos T3": {
    name: "Phobos T3",
    shipClass: "Crucero medio",
    hullMax: 70,
    maxSpeed: 80,
    turnRate: 10,
    accel: 20,
    shield: 50,
    beam: { range: 1200, arc: 90, cycle: 6, dmg: 6 },
  },
  "Adder MK5": {
    name: "Adder MK5",
    shipClass: "Cazador ligero",
    hullMax: 50,
    maxSpeed: 110,
    turnRate: 18,
    accel: 28,
    shield: 30,
    beam: { range: 900, arc: 60, cycle: 4, dmg: 3 },
  },
  "Flavia Falcon": {
    name: "Flavia Falcon",
    shipClass: "Carguero civil",
    hullMax: 100,
    maxSpeed: 60,
    turnRate: 6,
    accel: 12,
    shield: 40,
  },
} as const satisfies Record<string, ShipTemplate>;

export type TemplateName = keyof typeof TEMPLATES;
