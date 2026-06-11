export type EntityKind = "player" | "cpu" | "asteroid" | "station" | "missile" | "nebula" | "mine" | "probe";

export interface EntityState {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  heading: number;
  callSign?: string;
  faction?: "friendly" | "neutral" | "hostile";
  hullFrac?: number;
  shieldFrac?: number;
  scanned?: boolean;
  radius?: number;
  typeName?: string;
  beamFreq?: number;
  shieldFreq?: number;
}

export type TubeStateSim = "empty" | "loading" | "loaded";

export type MissileTypeSim = "homing" | "nuke" | "emp";

export interface TubeSim {
  state: TubeStateSim;
  t: number;
  missile: MissileTypeSim | null;
}

import type { SystemName, SystemState } from "./systems.js";

export interface PlayerShipState {
  x: number;
  y: number;
  heading: number;
  targetHeading: number;
  impulse: number;
  speed: number;
  hull: number;
  hullMax: number;
  shieldsUp: boolean;
  shieldFront: number;
  shieldRear: number;
  shieldMax: number;
  targetId: number | null;
  tubes: { state: TubeStateSim; progress: number; missile: MissileTypeSim | null }[];
  beamCooldown: number;
  energy: number;
  energyMax: number;
  repairing: SystemName | null;
  systems: Record<SystemName, SystemState>;
  scan: { targetId: number; progress: number } | null;
  docked: boolean;
  canDock: boolean;
  warp: number;
  hasWarp: boolean;
  hasJump: boolean;
  jump: { charge: number; cooldown: number; distance: number } | null;
  ammo: Record<MissileTypeSim, number>;
  beam: { range: number; arc: number } | null;
  probes: number;
  scanSignal: [number, number] | null;
  beamFrequency: number;
  shieldFrequency: number;
  beamCalibration: number | null;
  shieldCalibration: number | null;
  combatCharge: number;
  selfDestruct: { state: "armed" | "countdown"; t: number } | null;
}

export type SimEvent =
  | { k: "beam"; fx: number; fy: number; tx: number; ty: number; hostile: boolean }
  | { k: "boom"; x: number; y: number; big: boolean }
  | { k: "launch"; x: number; y: number };

export interface WorldSnapshot {
  time: number;
  ship: PlayerShipState;
  entities: EntityState[];
  events: SimEvent[];
  waypoints: { id: number; x: number; y: number }[];
}
