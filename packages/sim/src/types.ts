export type EntityKind = "player" | "cpu" | "asteroid" | "station";

export interface EntityState {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  heading: number;
  callSign?: string;
  faction?: "friendly" | "neutral" | "hostile";
}

export interface PlayerShipState {
  x: number;
  y: number;
  heading: number;
  targetHeading: number;
  impulse: number;
  speed: number;
  hull: number;
  hullMax: number;
}

export interface WorldSnapshot {
  time: number;
  ship: PlayerShipState;
  entities: EntityState[];
}
