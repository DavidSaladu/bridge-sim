import type { EntityKind, EntityState, PlayerShipState, WorldSnapshot } from "./types.js";

/** RNG determinista (mulberry32) para escenarios reproducibles. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEG = Math.PI / 180;

/** Normaliza un ángulo a [0, 360). */
export function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Diferencia angular con signo en [-180, 180]. */
export function angleDiff(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

interface ShipSpec {
  maxSpeed: number;      // m/s a impulso 1.0
  turnRate: number;      // grados/s
  accel: number;         // m/s² de impulso
  hullMax: number;
}

const PLAYER_SPEC: ShipSpec = { maxSpeed: 125, turnRate: 12, accel: 25, hullMax: 250 };
const CPU_SPEC: ShipSpec = { maxSpeed: 90, turnRate: 8, accel: 20, hullMax: 100 };

abstract class Entity {
  constructor(
    public readonly id: number,
    public readonly kind: EntityKind,
    public x: number,
    public y: number,
    public heading = 0,
  ) {}

  abstract update(dt: number, world: World): void;

  state(): EntityState {
    return { id: this.id, kind: this.kind, x: this.x, y: this.y, heading: this.heading };
  }
}

export class Asteroid extends Entity {
  constructor(id: number, x: number, y: number) {
    super(id, "asteroid", x, y);
  }
  update(): void {}
}

class MovingShip extends Entity {
  targetHeading = 0;
  impulse = 0;       // 0..1 objetivo
  speed = 0;         // m/s actual
  hull: number;

  constructor(id: number, kind: EntityKind, x: number, y: number, protected spec: ShipSpec) {
    super(id, kind, x, y);
    this.hull = spec.hullMax;
  }

  update(dt: number, _world?: World): void {
    // Rotación hacia el rumbo objetivo
    const diff = angleDiff(this.heading, this.targetHeading);
    const maxTurn = this.spec.turnRate * dt;
    this.heading = norm(this.heading + Math.max(-maxTurn, Math.min(maxTurn, diff)));
    // Aceleración hacia la velocidad objetivo
    const targetSpeed = this.impulse * this.spec.maxSpeed;
    const dv = this.spec.accel * dt;
    if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + dv);
    else this.speed = Math.max(targetSpeed, this.speed - dv);
    // Avance: heading 0 = norte (+y), sentido horario
    this.x += Math.sin(this.heading * DEG) * this.speed * dt;
    this.y += Math.cos(this.heading * DEG) * this.speed * dt;
  }
}

export class PlayerShip extends MovingShip {
  callSign: string;
  constructor(id: number, x: number, y: number, callSign = "ARTEMIS") {
    super(id, "player", x, y, PLAYER_SPEC);
    this.callSign = callSign;
  }
  setImpulse(v: number): void {
    this.impulse = Math.max(0, Math.min(1, v));
  }
  setTargetHeading(deg: number): void {
    this.targetHeading = norm(deg);
  }
  playerState(): PlayerShipState {
    return {
      x: this.x, y: this.y,
      heading: this.heading, targetHeading: this.targetHeading,
      impulse: this.impulse, speed: this.speed,
      hull: this.hull, hullMax: this.spec.hullMax,
    };
  }
  override state(): EntityState {
    return { ...super.state(), callSign: this.callSign, faction: "friendly" };
  }
}

export class CpuShip extends MovingShip {
  callSign: string;
  private nextDecision = 0;
  constructor(id: number, x: number, y: number, callSign: string, private rng: () => number) {
    super(id, "cpu", x, y, CPU_SPEC);
    this.callSign = callSign;
    this.impulse = 0.5;
  }
  override update(dt: number, _world?: World): void {
    this.nextDecision -= dt;
    if (this.nextDecision <= 0) {
      this.targetHeading = this.rng() * 360;
      this.nextDecision = 8 + this.rng() * 8;
    }
    super.update(dt);
  }
  override state(): EntityState {
    return { ...super.state(), callSign: this.callSign, faction: "hostile" };
  }
}

export class World {
  readonly tickRate = 20;
  private entities = new Map<number, Entity>();
  private nextId = 1;
  time = 0;
  ship: PlayerShip;
  rng: () => number;

  constructor(seed = 42) {
    this.rng = makeRng(seed);
    this.ship = new PlayerShip(this.allocId(), 0, 0);
    this.entities.set(this.ship.id, this.ship);
  }

  allocId(): number {
    return this.nextId++;
  }

  addAsteroid(x: number, y: number): Asteroid {
    const a = new Asteroid(this.allocId(), x, y);
    this.entities.set(a.id, a);
    return a;
  }

  addCpuShip(x: number, y: number, callSign: string): CpuShip {
    const s = new CpuShip(this.allocId(), x, y, callSign, this.rng);
    this.entities.set(s.id, s);
    return s;
  }

  tick(dt = 1 / this.tickRate): void {
    this.time += dt;
    for (const e of this.entities.values()) e.update(dt, this);
  }

  snapshot(): WorldSnapshot {
    return {
      time: this.time,
      ship: this.ship.playerState(),
      entities: [...this.entities.values()].map((e) => e.state()),
    };
  }
}

/** Escenario de prueba: cinturón de asteroides + 2 hostiles en patrulla. */
export function createTestScenario(seed = 42): World {
  const w = new World(seed);
  for (let i = 0; i < 24; i++) {
    const ang = w.rng() * Math.PI * 2;
    const dist = 2500 + w.rng() * 4000;
    w.addAsteroid(Math.sin(ang) * dist, Math.cos(ang) * dist);
  }
  w.addCpuShip(4000, 3000, "KR-7");
  w.addCpuShip(-3500, 4500, "KR-12");
  return w;
}
