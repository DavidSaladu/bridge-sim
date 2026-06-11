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
const JUMP_CHARGE_TIME = 10;     // s a eficacia 1
const JUMP_COOLDOWN = 30;
const JUMP_ENERGY_PER_KM = 3;
const JUMP_MIN = 5000;
const JUMP_MAX = 50000;

interface MissileSpec {
  dmg: number;
  blast: number;        // radio de explosión (0 = impacto directo)
  shieldsOnly?: boolean;
  loadTime: number;
}

const MISSILE_SPECS: Record<"homing" | "nuke" | "emp", MissileSpec> = {
  homing: { dmg: 35, blast: 0, loadTime: 8 },
  nuke: { dmg: 160, blast: 1000, loadTime: 15 },
  emp: { dmg: 130, blast: 1000, shieldsOnly: true, loadTime: 12 },
};
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

export class Probe extends Entity {
  static SPEED = 600;
  static LIFETIME = 600; // 10 min
  private life = Probe.LIFETIME;
  arrived = false;
  constructor(id: number, x: number, y: number, public tx: number, public ty: number) {
    super(id, "probe", x, y);
  }
  update(dt: number, _world: World): void {
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    if (!this.arrived) {
      const d = Math.hypot(this.tx - this.x, this.ty - this.y);
      if (d < Probe.SPEED * dt) {
        this.x = this.tx;
        this.y = this.ty;
        this.arrived = true;
      } else {
        this.x += ((this.tx - this.x) / d) * Probe.SPEED * dt;
        this.y += ((this.ty - this.y) / d) * Probe.SPEED * dt;
        this.heading = bearing(this, { x: this.tx, y: this.ty });
      }
    }
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

  /** Drena solo escudos (armas EMP). */
  abstract drainShields(amount: number): void;
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
  scanBands: [number, number] = [50, 50];
  scanTune: [number, number] = [50, 50];
  warp = 0;
  ammo: { homing: number; nuke: number; emp: number };
  jumpCharge = 0;        // 0..1 cuando se está cargando
  jumpCharging = false;
  jumpDistance = 10000;
  jumpCooldown = 0;
  probes = 8;
  private restockTimer = 0;
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
    this.tubes = Array.from({ length: tpl.tubes ?? 0 }, () => ({ state: "empty" as const, t: 0, missile: null }));
    this.ammo = { ...(tpl.ammo ?? { homing: 8, nuke: 0, emp: 0 }) };
  }

  chargeJump(distance: number): boolean {
    if (!this.template.hasJump || this.dockedTo != null || this.jumpCooldown > 0 || this.jumpCharging) return false;
    this.jumpDistance = Math.max(JUMP_MIN, Math.min(JUMP_MAX, distance));
    this.jumpCharging = true;
    this.jumpCharge = 0;
    return true;
  }

  abortJump(): void {
    this.jumpCharging = false;
    this.jumpCharge = 0;
  }

  executeJump(world: World): boolean {
    if (!this.jumpCharging || this.jumpCharge < 1) return false;
    const km = this.jumpDistance / 1000;
    if (!this.engineering.drain(km * JUMP_ENERGY_PER_KM)) return false;
    world.events.push({ k: "boom", x: this.x, y: this.y, big: false });
    // Salto por el rumbo actual, con dispersión del 2%
    const scatter = (world.rng() - 0.5) * 0.04 * this.jumpDistance;
    const d = this.jumpDistance + scatter;
    this.x += Math.sin(this.heading * DEG) * d;
    this.y += Math.cos(this.heading * DEG) * d;
    this.speed = 0;
    this.jumpCharging = false;
    this.jumpCharge = 0;
    this.jumpCooldown = JUMP_COOLDOWN;
    world.events.push({ k: "boom", x: this.x, y: this.y, big: false });
    return true;
  }

  setWarp(level: number): void {
    if (!this.template.hasWarp || this.dockedTo != null) return;
    this.warp = Math.max(0, Math.min(4, Math.round(level)));
  }

  setImpulse(v: number): void {
    this.impulse = Math.max(-0.5, Math.min(1, v));
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
    this.scanBands = [10 + world.rng() * 80, 10 + world.rng() * 80];
    this.scanTune = [50, 50];
    return true;
  }

  setScanTune(a: number, b: number): void {
    this.scanTune = [Math.max(0, Math.min(100, a)), Math.max(0, Math.min(100, b))];
  }
  cancelScan(): void {
    this.scanTargetId = null;
    this.scanProgress = 0;
  }
  loadTube(i: number, missile: "homing" | "nuke" | "emp" = "homing"): void {
    const tube = this.tubes[i];
    if (tube && tube.state === "empty" && this.ammo[missile] > 0) {
      this.ammo[missile]--;
      tube.state = "loading";
      tube.t = 0;
      tube.missile = missile;
    }
  }
  unloadTube(i: number): void {
    const tube = this.tubes[i];
    if (!tube || tube.state === "empty" || !tube.missile) return;
    this.ammo[tube.missile]++;
    tube.state = "empty";
    tube.t = 0;
    tube.missile = null;
  }

  fireTube(i: number, world: World): void {
    const tube = this.tubes[i];
    if (!tube || tube.state !== "loaded" || this.targetId == null || !tube.missile) return;
    const target = world.get(this.targetId);
    if (!target) return;
    const missile = tube.missile;
    tube.state = "empty";
    tube.t = 0;
    tube.missile = null;
    world.spawnMissile(this, target.id, missile);
  }

  override update(dt: number, world: World): void {
    this.engineering.tick(dt);
    if (this.dockedTo != null) {
      // Atracada: inmóvil; reparación y recarga
      this.impulse = 0;
      this.speed = 0;
      this.hull = Math.min(this.spec.hullMax, this.hull + 3 * dt);
      this.engineering.energy = Math.min(1000, this.engineering.energy + 25 * dt);
      // Reabastecimiento de munición (1 unidad cada 3 s por tipo)
      const maxAmmo = this.template.ammo ?? { homing: 8, nuke: 0, emp: 0 };
      this.restockTimer = this.restockTimer + dt;
      if (this.restockTimer >= 3) {
        this.restockTimer = 0;
        for (const k of ["homing", "nuke", "emp"] as const) {
          if (this.ammo[k] < maxAmmo[k]) this.ammo[k]++;
        }
        if (this.probes < 8) this.probes++;
      }
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
      if (tube.state === "loading" && tube.missile) {
        const loadTime = MISSILE_SPECS[tube.missile].loadTime;
        tube.t += dt * effMissiles;
        if (tube.t >= loadTime) {
          tube.state = "loaded";
          tube.t = loadTime;
        }
      }
    }
    // Salto: carga y cooldown
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    if (this.jumpCharging && this.jumpCharge < 1) {
      const effJump = Math.max(0.1, Math.min(2, this.engineering.effectiveness("jump")));
      this.jumpCharge = Math.min(1, this.jumpCharge + (dt / JUMP_CHARGE_TIME) * effJump);
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
        // Minijuego: el progreso avanza con las dos bandas bien sintonizadas y decae si no
        const close0 = Math.abs(this.scanTune[0] - this.scanBands[0]) <= 8;
        const close1 = Math.abs(this.scanTune[1] - this.scanBands[1]) <= 8;
        if (close0 && close1) {
          this.scanProgress += dt / 2.5;
        } else {
          this.scanProgress = Math.max(0, this.scanProgress - dt / 5);
        }
        if (this.scanProgress >= 1) {
          target.scanned = true;
          this.cancelScan();
        }
      }
    }
  }

  drainShields(amount: number): void {
    const half = amount / 2;
    this.shieldFront = Math.max(0, this.shieldFront - half);
    this.shieldRear = Math.max(0, this.shieldRear - half);
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
        missile: t.missile,
        progress:
          t.state === "loading" && t.missile
            ? t.t / MISSILE_SPECS[t.missile].loadTime
            : t.state === "loaded" ? 1 : 0,
      })),
      beamCooldown: this.template.beam ? this.beamCd / this.template.beam.cycle : 0,
      ...this.engineering.snapshot(),
      scan: this.scanTargetId != null
        ? { targetId: this.scanTargetId, progress: Math.min(1, this.scanProgress) }
        : null,
      scanSignal: this.scanTargetId != null
        ? [
            Math.max(0, 1 - Math.abs(this.scanTune[0] - this.scanBands[0]) / 50),
            Math.max(0, 1 - Math.abs(this.scanTune[1] - this.scanBands[1]) / 50),
          ]
        : null,
      beam: this.template.beam ? { range: this.template.beam.range, arc: this.template.beam.arc } : null,
      probes: this.probes,
      docked: this.dockedTo != null,
      canDock: this.dockedTo == null && this.speed <= DOCK_MAX_SPEED && this.nearestDockable(world) != null,
      warp: this.warp,
      hasWarp: Boolean(this.template.hasWarp),
      hasJump: Boolean(this.template.hasJump),
      jump: this.jumpCharging || this.jumpCooldown > 0
        ? { charge: this.jumpCharge, cooldown: this.jumpCooldown, distance: this.jumpDistance }
        : null,
      ammo: { ...this.ammo },
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

  applyTemplate(name: TemplateName): void {
    const tpl: ShipTemplate = TEMPLATES[name];
    this.template = tpl;
    this.spec = specFrom(tpl);
    this.hull = tpl.hullMax;
    this.shield = tpl.shield ?? 40;
    this.shieldMax = tpl.shield ?? 40;
  }

  setFaction(name: string): void {
    const map: Record<string, FactionName> = {
      "Kraylor": "Kraylor", "Exuari": "Kraylor", "Ghosts": "Kraylor",
      "Human Navy": "Human Navy", "Independent": "Independent", "Arlenians": "Independent",
    };
    this.factionName = map[name] ?? "Independent";
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

  drainShields(amount: number): void {
    this.shield = Math.max(0, this.shield - amount);
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
  constructor(
    id: number, x: number, y: number, heading: number,
    private targetId: number, private firedBy: number,
    public missileType: "homing" | "nuke" | "emp" = "homing",
  ) {
    super(id, "missile", x, y, heading);
  }

  private explode(world: World): void {
    const spec = MISSILE_SPECS[this.missileType];
    this.dead = true;
    world.events.push({ k: "boom", x: this.x, y: this.y, big: spec.blast > 0 });
    if (spec.blast > 0) {
      // Daño en área con atenuación
      for (const t of world.allEntities()) {
        if (!(t instanceof CpuShip || t instanceof PlayerShip) || t.dead) continue;
        const d = dist(this, t);
        if (d > spec.blast) continue;
        const dmg = spec.dmg * Math.max(0.25, 1 - d / spec.blast);
        if (spec.shieldsOnly) {
          t.drainShields(dmg);
        } else {
          t.takeDamage(dmg, bearing(t, this), world);
        }
      }
    } else {
      const target = world.get(this.targetId);
      if (target instanceof CpuShip || target instanceof PlayerShip) {
        target.takeDamage(spec.dmg, bearing(target, this), world);
      }
    }
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
    if (target && dist(this, target) <= MISSILE.proximity) this.explode(world);
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

  removeEntity(id: number): void {
    if (id === this.ship.id) return; // la nave del jugador no se borra
    this.entities.delete(id);
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

  launchProbe(from: PlayerShip, tx: number, ty: number): Probe | null {
    if (from.probes <= 0) return null;
    from.probes--;
    const p = new Probe(this.allocId(), from.x, from.y, tx, ty);
    this.entities.set(p.id, p);
    return p;
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

  spawnMissile(from: PlayerShip, targetId: number, missileType: "homing" | "nuke" | "emp" = "homing"): Missile {
    const m = new Missile(this.allocId(), from.x, from.y, from.heading, targetId, from.id, missileType);
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

  /** ¿Hay cobertura de sensores cerca (nave o sondas)? */
  private sensorCoverage(viewer: PlayerShip, e: Entity): boolean {
    if (dist(viewer, e) <= NEBULA_SIGHT) return true;
    for (const p of this.entities.values()) {
      if (p instanceof Probe && !p.dead && dist(p, e) <= NEBULA_SIGHT) return true;
    }
    return false;
  }

  /** Visibilidad desde la nave del jugador (niebla de guerra servida desde el servidor). */
  private visibleTo(viewer: PlayerShip, e: Entity): boolean {
    if (e === viewer) return true;
    if (e.kind === "mine") return this.sensorCoverage(viewer, e);
    if (e instanceof MovingShip || e.kind === "missile") {
      if (this.inNebula(e) && !this.sensorCoverage(viewer, e)) return false;
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
