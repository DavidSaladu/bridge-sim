import type { EntityKind, EntityState, PlayerShipState, WorldSnapshot, SimEvent, TubeSim } from "./types.js";
import { EngineeringSuite } from "./systems.js";
import { TEMPLATES, type FactionName, type ShipTemplate, type TemplateName } from "./templates.js";

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

export function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function angleDiff(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

interface ShipSpec {
  maxSpeed: number;
  turnRate: number;
  accel: number;
  hullMax: number;
}

function specFrom(t: ShipTemplate): ShipSpec {
  return { maxSpeed: t.maxSpeed, turnRate: t.turnRate, accel: t.accel, hullMax: t.hullMax };
}

const TUBE_LOAD_TIME = 8;
const WARP_SPEED_PER_LEVEL = 600;
const WARP_ENERGY_PER_LEVEL = 6; // energía/s por nivel
const SCAN_TIME = 6;
const SCAN_RANGE = 12000;
const DOCK_RANGE = 1000;
const DOCK_MAX_SPEED = 40;
const NEBULA_SIGHT = 5000;
const MINE_TRIGGER = 600;
const MINE_BLAST = 900;
const MINE_DMG = 60;
const MISSILE = { speed: 220, turnRate: 100, dmg: 35, life: 40, proximity: 80 };

export abstract class Entity {
  dead = false;
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

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Rumbo desde a hacia b (0 = norte, horario). */
export function bearing(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return norm((Math.atan2(b.x - a.x, b.y - a.y) / DEG));
}

export class Asteroid extends Entity {
  constructor(id: number, x: number, y: number) {
    super(id, "asteroid", x, y);
  }
  update(): void {}
}

export class SpaceStation extends Entity {
  callSign: string;
  hull = 800;
  constructor(id: number, x: number, y: number, callSign: string) {
    super(id, "station", x, y);
    this.callSign = callSign;
  }
  update(): void {}
  override state(): EntityState {
    return { ...super.state(), callSign: this.callSign, faction: "friendly" };
  }
}

export class Nebula extends Entity {
  constructor(id: number, x: number, y: number, public radius: number) {
    super(id, "nebula", x, y);
  }
  update(): void {}
  override state(): EntityState {
    return { ...super.state(), radius: this.radius };
  }
}

export class Mine extends Entity {
  constructor(id: number, x: number, y: number) {
    super(id, "mine", x, y);
  }
  update(_dt: number, world: World): void {
    for (const e of world.allEntities()) {
      if (!(e instanceof MovingShip) || e.dead) continue;
      if (dist(this, e) <= MINE_TRIGGER) {
        this.dead = true;
        world.events.push({ k: "boom", x: this.x, y: this.y, big: true });
        for (const t of world.allEntities()) {
          if (t instanceof MovingShip && !t.dead && dist(this, t) <= MINE_BLAST) {
            const falloff = 1 - dist(this, t) / MINE_BLAST;
            t.takeDamage(MINE_DMG * Math.max(0.3, falloff), bearing(t, this), world);
          }
        }
        return;
      }
    }
  }
}

abstract class MovingShip extends Entity {
  targetHeading = 0;
  impulse = 0;
  speed = 0;
  hull: number;

  constructor(id: number, kind: EntityKind, x: number, y: number, public spec: ShipSpec) {
    super(id, kind, x, y);
    this.hull = spec.hullMax;
  }

  update(dt: number, _world?: World): void {
    const diff = angleDiff(this.heading, this.targetHeading);
    const maxTurn = this.spec.turnRate * dt;
    this.heading = norm(this.heading + Math.max(-maxTurn, Math.min(maxTurn, diff)));
    const targetSpeed = this.impulse * this.spec.maxSpeed;
    const dv = this.spec.accel * dt;
    if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + dv);
    else this.speed = Math.max(targetSpeed, this.speed - dv);
    this.x += Math.sin(this.heading * DEG) * this.speed * dt;
    this.y += Math.cos(this.heading * DEG) * this.speed * dt;
  }

  /** Aplica daño. Devuelve true si la nave queda destruida. */
  abstract takeDamage(dmg: number, fromBearing: number, world: World): boolean;
}

export class PlayerShip extends MovingShip {
  callSign: string;
  template: ShipTemplate;
  engineering = new EngineeringSuite();
  shieldsUp = true;
  shieldMax: number;
  shieldFront: number;
  shieldRear: number;
  targetId: number | null = null;
  dockedTo: number | null = null;
  scanTargetId: number | null = null;
  scanProgress = 0;
  warp = 0;
  tubes: TubeSim[];
  beamCd = 0;

  constructor(id: number, x: number, y: number, callSign = "ARTEMIS", templateName: TemplateName = "Atlantis") {
    const tpl: ShipTemplate = TEMPLATES[templateName];
    super(id, "player", x, y, specFrom(tpl));
    this.template = tpl;
    this.callSign = callSign;
    this.shieldMax = Math.max(tpl.shieldFront ?? 100, tpl.shieldRear ?? 100);
    this.shieldFront = tpl.shieldFront ?? 100;
    this.shieldRear = tpl.shieldRear ?? 100;
    this.tubes = Array.from({ length: tpl.tubes ?? 0 }, () => ({ state: "empty" as const, t: 0 }));
  }

  setWarp(level: number): void {
    if (!this.template.hasWarp || this.dockedTo != null) return;
    this.warp = Math.max(0, Math.min(4, Math.round(level)));
  }

  setImpulse(v: number): void {
    this.impulse = Math.max(0, Math.min(1, v));
  }
  setTargetHeading(deg: number): void {
    this.targetHeading = norm(deg);
  }
  setTarget(id: number | null): void {
    this.targetId = id;
  }
  setShields(up: boolean): void {
    this.shieldsUp = up;
  }
  nearestDockable(world: World): SpaceStation | null {
    let best: SpaceStation | null = null;
    for (const e of world.allEntities()) {
      if (e instanceof SpaceStation && dist(this, e) <= DOCK_RANGE) {
        if (!best || dist(this, e) < dist(this, best)) best = e;
      }
    }
    return best;
  }

  requestDock(world: World): boolean {
    if (this.dockedTo != null || this.speed > DOCK_MAX_SPEED) return false;
    const st = this.nearestDockable(world);
    if (!st) return false;
    this.dockedTo = st.id;
    this.impulse = 0;
    this.speed = 0;
    return true;
  }

  undock(): void {
    this.dockedTo = null;
  }

  startScan(id: number, world: World): boolean {
    const target = world.get(id);
    if (!target || !(target instanceof CpuShip) || target.scanned) return false;
    if (dist(this, target) > SCAN_RANGE) return false;
    this.scanTargetId = id;
    this.scanProgress = 0;
    return true;
  }
  cancelScan(): void {
    this.scanTargetId = null;
    this.scanProgress = 0;
  }
  loadTube(i: number): void {
    const tube = this.tubes[i];
    if (tube && tube.state === "empty") {
      tube.state = "loading";
      tube.t = 0;
    }
  }
  fireTube(i: number, world: World): void {
    const tube = this.tubes[i];
    if (!tube || tube.state !== "loaded" || this.targetId == null) return;
    const target = world.get(this.targetId);
    if (!target) return;
    tube.state = "empty";
    tube.t = 0;
    world.spawnMissile(this, target.id);
  }

  override update(dt: number, world: World): void {
    this.engineering.tick(dt);
    if (this.dockedTo != null) {
      // Atracada: inmóvil; reparación y recarga
      this.impulse = 0;
      this.speed = 0;
      this.hull = Math.min(this.spec.hullMax, this.hull + 3 * dt);
      this.engineering.energy = Math.min(1000, this.engineering.energy + 25 * dt);
      for (const name of Object.keys(this.engineering.systems) as (keyof typeof this.engineering.systems)[]) {
        const sys = this.engineering.systems[name];
        sys.health = Math.min(1, sys.health + 0.015 * dt);
      }
      return;
    }
    // Eficacias de ingeniería: ajustan specs efectivos antes de mover
    const baseSpec = this.spec;
    const effImpulse = this.engineering.effectiveness("impulse");
    const effManeuver = this.engineering.effectiveness("maneuver");
    if (this.warp > 0) {
      // Warp: velocidad masiva, giro torpe, drenaje de energía
      const effWarp = Math.min(1.5, this.engineering.effectiveness("warp"));
      const drained = this.engineering.drain(WARP_ENERGY_PER_LEVEL * this.warp * dt);
      if (!drained) this.warp = 0;
      this.spec = {
        ...baseSpec,
        maxSpeed: WARP_SPEED_PER_LEVEL * this.warp * effWarp,
        turnRate: baseSpec.turnRate * 0.25,
        accel: 220,
      };
      this.impulse = 1;
    } else {
      this.spec = {
        ...baseSpec,
        maxSpeed: baseSpec.maxSpeed * Math.min(1.5, effImpulse),
        turnRate: baseSpec.turnRate * Math.min(1.5, effManeuver),
      };
    }
    super.update(dt);
    this.spec = baseSpec;
    // Escudos: recarga lenta si están arriba
    if (this.shieldsUp) {
      const effShields = Math.min(2, this.engineering.effectiveness("shields"));
      this.shieldFront = Math.min(this.shieldMax, this.shieldFront + 1.2 * effShields * dt);
      this.shieldRear = Math.min(this.shieldMax, this.shieldRear + 1.2 * effShields * dt);
    }
    // Tubos
    const effMissiles = Math.max(0.1, Math.min(2, this.engineering.effectiveness("missiles")));
    for (const tube of this.tubes) {
      if (tube.state === "loading") {
        tube.t += dt * effMissiles;
        if (tube.t >= TUBE_LOAD_TIME) {
          tube.state = "loaded";
          tube.t = TUBE_LOAD_TIME;
        }
      }
    }
    // Rayos automáticos contra el blanco seleccionado
    const effBeams = Math.max(0.1, Math.min(2, this.engineering.effectiveness("beams")));
    this.beamCd = Math.max(0, this.beamCd - dt * effBeams);
    const beam = this.template.beam;
    if (beam && this.targetId != null && this.beamCd <= 0) {
      const target = world.get(this.targetId);
      if (target && target instanceof MovingShip && dist(this, target) <= beam.range) {
        const rel = Math.abs(angleDiff(this.heading, bearing(this, target)));
        if (rel <= beam.arc / 2) {
          this.beamCd = beam.cycle;
          world.events.push({ k: "beam", fx: this.x, fy: this.y, tx: target.x, ty: target.y, hostile: false });
          target.takeDamage(beam.dmg, bearing(target, this), world);
        }
      }
    }
    if (this.targetId != null && !world.get(this.targetId)) this.targetId = null;
    // Escaneo en curso
    if (this.scanTargetId != null) {
      const target = world.get(this.scanTargetId);
      if (!target || !(target instanceof CpuShip) || dist(this, target) > SCAN_RANGE) {
        this.cancelScan();
      } else {
        this.scanProgress += dt / SCAN_TIME;
        if (this.scanProgress >= 1) {
          target.scanned = true;
          this.cancelScan();
        }
      }
    }
  }

  takeDamage(dmg: number, fromBearing: number, world: World): boolean {
    if (this.shieldsUp) {
      const rel = Math.abs(angleDiff(this.heading, fromBearing));
      const front = rel <= 90;
      const pool = front ? "shieldFront" : "shieldRear";
      const absorbed = Math.min(this[pool], dmg);
      this[pool] -= absorbed;
      dmg -= absorbed;
    }
    if (dmg > 0) {
      this.hull = Math.max(0, this.hull - dmg);
      // Los impactos al casco averían sistemas (40% de probabilidad)
      if (world.rng() < 0.4) this.engineering.damageRandomSystem(0.1 + world.rng() * 0.1, world.rng);
    }
    if (this.hull <= 0 && !this.dead) {
      this.dead = true;
      world.events.push({ k: "boom", x: this.x, y: this.y, big: true });
    }
    return this.dead;
  }

  playerState(world: World): PlayerShipState {
    return {
      x: this.x, y: this.y,
      heading: this.heading, targetHeading: this.targetHeading,
      impulse: this.impulse, speed: this.speed,
      hull: this.hull, hullMax: this.spec.hullMax,
      shieldsUp: this.shieldsUp,
      shieldFront: Math.round(this.shieldFront), shieldRear: Math.round(this.shieldRear),
      shieldMax: this.shieldMax,
      targetId: this.targetId,
      tubes: this.tubes.map((t) => ({
        state: t.state,
        progress: t.state === "loading" ? t.t / TUBE_LOAD_TIME : t.state === "loaded" ? 1 : 0,
      })),
      beamCooldown: this.template.beam ? this.beamCd / this.template.beam.cycle : 0,
      ...this.engineering.snapshot(),
      scan: this.scanTargetId != null
        ? { targetId: this.scanTargetId, progress: Math.min(1, this.scanProgress) }
        : null,
      docked: this.dockedTo != null,
      canDock: this.dockedTo == null && this.speed <= DOCK_MAX_SPEED && this.nearestDockable(world) != null,
      warp: this.warp,
      hasWarp: Boolean(this.template.hasWarp),
    };
  }

  override state(): EntityState {
    return {
      ...super.state(),
      callSign: this.callSign,
      faction: "friendly",
      typeName: this.template.name,
      hullFrac: this.hull / this.spec.hullMax,
      shieldFrac: (this.shieldFront + this.shieldRear) / (2 * this.shieldMax),
    };
  }
}

export class CpuShip extends MovingShip {
  callSign: string;
  template: ShipTemplate;
  factionName: FactionName;
  scanned = false;
  surrendered = false;
  shield: number;
  shieldMax: number;
  private nextDecision = 0;
  private beamCd = 0;

  constructor(
    id: number, x: number, y: number, callSign: string, private rng: () => number,
    templateName: TemplateName = "Phobos T3", factionName: FactionName = "Kraylor",
  ) {
    const tpl: ShipTemplate = TEMPLATES[templateName];
    super(id, "cpu", x, y, specFrom(tpl));
    this.template = tpl;
    this.callSign = callSign;
    this.factionName = factionName;
    this.shield = tpl.shield ?? 40;
    this.shieldMax = tpl.shield ?? 40;
    this.impulse = 0.5;
  }

  get hostile(): boolean {
    return this.factionName === "Kraylor" && !this.surrendered;
  }

  override update(dt: number, world: World): void {
    const player = world.ship;
    const d = player && !player.dead ? dist(this, player) : Infinity;
    if (this.surrendered) {
      // Rendida: deriva lenta, sin combate
      this.impulse = 0.2;
      this.nextDecision -= dt;
      if (this.nextDecision <= 0) {
        this.targetHeading = this.rng() * 360;
        this.nextDecision = 10 + this.rng() * 10;
      }
      super.update(dt);
      return;
    }
    const beam = this.template.beam;
    if (this.hostile && beam && d < 4500) {
      // Modo ataque: perseguir y disparar
      this.targetHeading = bearing(this, player);
      this.impulse = d > 900 ? 0.8 : 0.3;
      this.beamCd = Math.max(0, this.beamCd - dt);
      if (d <= beam.range && this.beamCd <= 0) {
        this.beamCd = beam.cycle;
        world.events.push({ k: "beam", fx: this.x, fy: this.y, tx: player.x, ty: player.y, hostile: true });
        player.takeDamage(beam.dmg, bearing(player, this), world);
      }
    } else {
      this.nextDecision -= dt;
      if (this.nextDecision <= 0) {
        this.targetHeading = this.rng() * 360;
        this.nextDecision = 8 + this.rng() * 8;
        this.impulse = 0.5;
      }
    }
    super.update(dt);
  }

  takeDamage(dmg: number, _fromBearing: number, world: World): boolean {
    const absorbed = Math.min(this.shield, dmg);
    this.shield -= absorbed;
    dmg -= absorbed;
    if (dmg > 0) this.hull = Math.max(0, this.hull - dmg);
    if (this.hull <= 0 && !this.dead) {
      this.dead = true;
      world.events.push({ k: "boom", x: this.x, y: this.y, big: true });
    }
    return this.dead;
  }

  override state(): EntityState {
    if (!this.scanned) {
      // Sin escanear: contacto anónimo, sin facción ni estado
      return { ...super.state(), scanned: false };
    }
    return {
      ...super.state(),
      callSign: this.callSign,
      faction: this.hostile ? "hostile" : "neutral",
      typeName: this.template.name + " · " + this.factionName,
      hullFrac: this.hull / this.spec.hullMax,
      shieldFrac: this.shield / this.shieldMax,
      scanned: true,
    };
  }
}

export class Missile extends Entity {
  private life = MISSILE.life;
  constructor(id: number, x: number, y: number, heading: number, private targetId: number, private firedBy: number) {
    super(id, "missile", x, y, heading);
  }

  update(dt: number, world: World): void {
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    const target = world.get(this.targetId);
    if (target) {
      const want = bearing(this, target);
      const diff = angleDiff(this.heading, want);
      const maxTurn = MISSILE.turnRate * dt;
      this.heading = norm(this.heading + Math.max(-maxTurn, Math.min(maxTurn, diff)));
    }
    this.x += Math.sin(this.heading * DEG) * MISSILE.speed * dt;
    this.y += Math.cos(this.heading * DEG) * MISSILE.speed * dt;
    if (target && dist(this, target) <= MISSILE.proximity) {
      this.dead = true;
      world.events.push({ k: "boom", x: this.x, y: this.y, big: false });
      if (target instanceof CpuShip || target instanceof PlayerShip) {
        target.takeDamage(MISSILE.dmg, bearing(target, this), world);
      }
    }
  }
}

export class World {
  readonly tickRate = 20;
  private entities = new Map<number, Entity>();
  private nextId = 1;
  time = 0;
  ship: PlayerShip;
  rng: () => number;
  events: SimEvent[] = [];
  waypoints: { id: number; x: number; y: number }[] = [];
  private nextWaypointId = 1;

  addWaypoint(x: number, y: number): void {
    if (this.waypoints.length >= 9) return;
    this.waypoints.push({ id: this.nextWaypointId++, x, y });
  }

  removeWaypoint(id: number): void {
    this.waypoints = this.waypoints.filter((w) => w.id !== id);
  }

  constructor(seed = 42) {
    this.rng = makeRng(seed);
    this.ship = new PlayerShip(this.allocId(), 0, 0);
    this.entities.set(this.ship.id, this.ship);
  }

  allocId(): number {
    return this.nextId++;
  }

  get(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  addAsteroid(x: number, y: number): Asteroid {
    const a = new Asteroid(this.allocId(), x, y);
    this.entities.set(a.id, a);
    return a;
  }

  allEntities(): IterableIterator<Entity> {
    return this.entities.values();
  }

  addStation(x: number, y: number, callSign: string): SpaceStation {
    const st = new SpaceStation(this.allocId(), x, y, callSign);
    this.entities.set(st.id, st);
    return st;
  }

  addNebula(x: number, y: number, radius: number): Nebula {
    const n = new Nebula(this.allocId(), x, y, radius);
    this.entities.set(n.id, n);
    return n;
  }

  addMine(x: number, y: number): Mine {
    const m = new Mine(this.allocId(), x, y);
    this.entities.set(m.id, m);
    return m;
  }

  addCpuShip(x: number, y: number, callSign: string, template: TemplateName = "Phobos T3", faction: FactionName = "Kraylor"): CpuShip {
    const s = new CpuShip(this.allocId(), x, y, callSign, this.rng, template, faction);
    this.entities.set(s.id, s);
    return s;
  }

  spawnMissile(from: PlayerShip, targetId: number): Missile {
    const m = new Missile(this.allocId(), from.x, from.y, from.heading, targetId, from.id);
    this.entities.set(m.id, m);
    this.events.push({ k: "launch", x: from.x, y: from.y });
    return m;
  }

  get hostilesAlive(): number {
    let n = 0;
    for (const e of this.entities.values()) {
      if (e instanceof CpuShip && !e.dead && e.hostile) n++;
    }
    return n;
  }

  get playerDead(): boolean {
    return this.ship.dead;
  }

  tick(dt = 1 / this.tickRate): void {
    this.time += dt;
    for (const e of this.entities.values()) e.update(dt, this);
    for (const [id, e] of this.entities) {
      if (e.dead && e !== this.ship) this.entities.delete(id);
    }
  }

  /** ¿Está una posición dentro de alguna nebulosa? */
  inNebula(p: { x: number; y: number }): boolean {
    for (const e of this.entities.values()) {
      if (e instanceof Nebula && dist(e, p) <= e.radius) return true;
    }
    return false;
  }

  /** Visibilidad desde la nave del jugador (niebla de guerra servida desde el servidor). */
  private visibleTo(viewer: PlayerShip, e: Entity): boolean {
    if (e === viewer) return true;
    if (e.kind === "mine") return dist(viewer, e) <= NEBULA_SIGHT;
    if (e instanceof MovingShip || e.kind === "missile") {
      if (this.inNebula(e) && dist(viewer, e) > NEBULA_SIGHT) return false;
    }
    return true;
  }

  snapshot(): WorldSnapshot {
    const snap = {
      time: this.time,
      ship: this.ship.playerState(this),
      entities: [...this.entities.values()]
        .filter((e) => !e.dead && this.visibleTo(this.ship, e))
        .map((e) => e.state()),
      events: this.events,
      waypoints: [...this.waypoints],
    };
    this.events = [];
    return snap;
  }
}

/** Escenario de prueba: estación, nebulosas, minas, asteroides y 2 hostiles. */
export function createTestScenario(seed = 42): World {
  const w = new World(seed);
  w.addStation(-1800, -1400, "DS-1");
  for (let i = 0; i < 24; i++) {
    const ang = w.rng() * Math.PI * 2;
    const d = 2500 + w.rng() * 4000;
    w.addAsteroid(Math.sin(ang) * d, Math.cos(ang) * d);
  }
  w.addNebula(6500, 1500, 3000);
  w.addNebula(-4000, 7000, 2600);
  // Campo de minas en el flanco de la nebulosa este
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    w.addMine(6500 + Math.sin(ang) * 3600, 1500 + Math.cos(ang) * 3600);
  }
  w.addCpuShip(7000, 1800, "KR-7", "Phobos T3", "Kraylor");   // escondida en la nebulosa
  w.addCpuShip(-2500, 3200, "KR-12", "Adder MK5", "Kraylor");  // cazador rápido a la vista
  w.addCpuShip(-900, -2600, "FT-3", "Flavia Falcon", "Independent"); // carguero civil
  return w;
}
