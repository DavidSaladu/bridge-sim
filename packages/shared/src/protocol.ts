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

export interface RoomSnapshot {
  code: string;
  players: PlayerInfo[];
  createdAt: number;
}

/** Mensajes cliente → servidor */
export type ClientMsg =
  | { t: "join"; name: string }
  | { t: "takeStation"; station: Station }
  | { t: "leaveStation" }
  | { t: "chat"; text: string };

/** Mensajes servidor → cliente */
export type ServerMsg =
  | { t: "welcome"; selfId: string; room: RoomSnapshot }
  | { t: "room"; room: RoomSnapshot }
  | { t: "chat"; from: string; fromName: string; text: string; ts: number }
  | { t: "error"; code: string; message: string };

export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 6;
export const MAX_CHAT_LENGTH = 500;
export const MAX_NAME_LENGTH = 24;
