export type EntityKind = "player" | "cpu" | "asteroid" | "station" | "missile";

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
}

export type TubeStateSim = "empty" | "loading" | "loaded";

export interface TubeSim {
  state: TubeStateSim;
  t: number;
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
  tubes: { state: TubeStateSim; progress: number }[];
  beamCooldown: number;
  energy: number;
  energyMax: number;
  repairing: SystemName | null;
  systems: Record<SystemName, SystemState>;
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
}
