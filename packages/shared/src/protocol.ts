/** Puestos del puente. 5 estaciones + capitán. */
export const STATIONS = [
  "helm",
  "weapons",
  "engineering",
  "science",
  "comms",
  "captain",
] as const;

export type Station = (typeof STATIONS)[number];

export const STATION_LABELS: Record<Station, string> = {
  helm: "Pilotaje",
  weapons: "Armamento",
  engineering: "Ingeniería",
  science: "Ciencia",
  comms: "Comunicaciones",
  captain: "Capitán",
};

export interface PlayerInfo {
  id: string;
  name: string;
  stations: Station[];
  isHost: boolean;
  connected: boolean;
}

export type RoomPhase = "lobby" | "playing";

export interface RoomSnapshot {
  code: string;
  players: PlayerInfo[];
  createdAt: number;
  phase: RoomPhase;
}

/** Entidad tal y como viaja en un snapshot de partida. */
export interface SnapEntity {
  id: number;
  kind: "player" | "cpu" | "asteroid" | "station" | "missile";
  x: number;
  y: number;
  heading: number;
  callSign?: string;
  faction?: "friendly" | "neutral" | "hostile";
  hullFrac?: number;
  shieldFrac?: number;
  scanned?: boolean;
}

export const SHIP_SYSTEMS = ["reactor", "beams", "missiles", "maneuver", "impulse", "shields"] as const;
export type ShipSystem = (typeof SHIP_SYSTEMS)[number];

export const SYSTEM_LABELS: Record<ShipSystem, string> = {
  reactor: "Reactor",
  beams: "Rayos",
  missiles: "Misiles",
  maneuver: "Maniobra",
  impulse: "Impulso",
  shields: "Escudos",
};

export interface SnapSystem {
  power: number;    // potencia objetivo 0..3
  coolant: number;  // refrigerante asignado 0..10
  heat: number;     // 0..1
  health: number;   // 0..1
}

export type TubeState = "empty" | "loading" | "loaded";

export interface SnapTube {
  state: TubeState;
  progress: number;
}

export interface SnapShip {
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
  tubes: SnapTube[];
  beamCooldown: number;
  energy: number;
  energyMax: number;
  systems: Record<ShipSystem, SnapSystem>;
  repairing: ShipSystem | null;
  scan: { targetId: number; progress: number } | null;
}

export type SnapEvent =
  | { k: "beam"; fx: number; fy: number; tx: number; ty: number; hostile: boolean }
  | { k: "boom"; x: number; y: number; big: boolean }
  | { k: "launch"; x: number; y: number };

export interface GameSnap {
  time: number;
  ship: SnapShip;
  entities: SnapEntity[];
  events: SnapEvent[];
}

/** Mensajes cliente → servidor */
export type ClientMsg =
  | { t: "join"; name: string }
  | { t: "takeStation"; station: Station }
  | { t: "leaveStation"; station: Station }
  | { t: "chat"; text: string }
  | { t: "startGame" }
  | { t: "helm"; cmd: "setImpulse"; value: number }
  | { t: "helm"; cmd: "setHeading"; value: number }
  | { t: "weapons"; cmd: "setTarget"; id: number | null }
  | { t: "weapons"; cmd: "loadTube"; tube: number }
  | { t: "weapons"; cmd: "fireTube"; tube: number }
  | { t: "weapons"; cmd: "shields"; up: boolean }
  | { t: "engineering"; cmd: "setPower"; system: ShipSystem; value: number }
  | { t: "engineering"; cmd: "setCoolant"; system: ShipSystem; value: number }
  | { t: "engineering"; cmd: "repair"; system: ShipSystem | null }
  | { t: "science"; cmd: "scan"; id: number }
  | { t: "science"; cmd: "cancelScan" };

/** Mensajes servidor → cliente */
export type ServerMsg =
  | { t: "welcome"; selfId: string; resumeKey: string; room: RoomSnapshot }
  | { t: "room"; room: RoomSnapshot }
  | { t: "chat"; from: string; fromName: string; text: string; ts: number }
  | { t: "error"; code: string; message: string }
  | { t: "snap"; snap: GameSnap }
  | { t: "gameOver"; victory: boolean; message: string };

export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 6;
export const MAX_CHAT_LENGTH = 500;
export const MAX_NAME_LENGTH = 24;
