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
  station: Station | null;
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
  kind: "player" | "cpu" | "asteroid" | "station";
  x: number;
  y: number;
  heading: number;
  callSign?: string;
  faction?: "friendly" | "neutral" | "hostile";
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
}

export interface GameSnap {
  time: number;
  ship: SnapShip;
  entities: SnapEntity[];
}

/** Mensajes cliente → servidor */
export type ClientMsg =
  | { t: "join"; name: string }
  | { t: "takeStation"; station: Station }
  | { t: "leaveStation" }
  | { t: "chat"; text: string }
  | { t: "startGame" }
  | { t: "helm"; cmd: "setImpulse"; value: number }
  | { t: "helm"; cmd: "setHeading"; value: number };

/** Mensajes servidor → cliente */
export type ServerMsg =
  | { t: "welcome"; selfId: string; resumeKey: string; room: RoomSnapshot }
  | { t: "room"; room: RoomSnapshot }
  | { t: "chat"; from: string; fromName: string; text: string; ts: number }
  | { t: "error"; code: string; message: string }
  | { t: "snap"; snap: GameSnap };

export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 6;
export const MAX_CHAT_LENGTH = 500;
export const MAX_NAME_LENGTH = 24;
