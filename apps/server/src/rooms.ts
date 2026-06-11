import { customAlphabet } from "nanoid";
import type {
  ClientMsg,
  PlayerInfo,
  RoomSnapshot,
  ServerMsg,
  Station,
} from "@bridge/shared";
import { MAX_CHAT_LENGTH, MAX_NAME_LENGTH, MAX_PLAYERS, STATIONS } from "@bridge/shared";

const genCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const genId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12);

export interface Outbox {
  send(msg: ServerMsg): void;
  close(): void;
}

interface Player extends PlayerInfo {
  outbox: Outbox | null;
  disconnectedAt: number | null;
}

const RECONNECT_GRACE_MS = 5 * 60 * 1000;

export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  private players = new Map<string, Player>();

  constructor(code: string) {
    this.code = code;
  }

  get playerCount(): number {
    return this.players.size;
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      createdAt: this.createdAt,
      players: [...this.players.values()].map(
        ({ id, name, station, isHost, connected }) => ({ id, name, station, isHost, connected }),
      ),
    };
  }

  join(name: string, outbox: Outbox): { ok: true; id: string } | { ok: false; error: string } {
    const cleanName = name.trim().slice(0, MAX_NAME_LENGTH);
    if (!cleanName) return { ok: false, error: "Nombre vacío" };
    const active = [...this.players.values()].filter((p) => p.connected).length;
    if (active >= MAX_PLAYERS) return { ok: false, error: "Sala llena" };

    const id = genId();
    const player: Player = {
      id,
      name: cleanName,
      station: null,
      isHost: this.players.size === 0,
      connected: true,
      outbox,
      disconnectedAt: null,
    };
    this.players.set(id, player);
    outbox.send({ t: "welcome", selfId: id, room: this.snapshot() });
    this.broadcastRoom(id);
    return { ok: true, id };
  }

  handleMessage(playerId: string, msg: ClientMsg): void {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (msg.t) {
      case "takeStation": {
        if (!STATIONS.includes(msg.station)) return;
        const taken = [...this.players.values()].some(
          (p) => p.station === msg.station && p.id !== playerId,
        );
        if (taken) {
          player.outbox?.send({ t: "error", code: "station_taken", message: "Puesto ocupado" });
          return;
        }
        player.station = msg.station as Station;
        this.broadcastRoom();
        break;
      }
      case "leaveStation":
        player.station = null;
        this.broadcastRoom();
        break;
      case "chat": {
        const text = msg.text.trim().slice(0, MAX_CHAT_LENGTH);
        if (!text) return;
        this.broadcast({ t: "chat", from: player.id, fromName: player.name, text, ts: Date.now() });
        break;
      }
    }
  }

  disconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.outbox = null;
    player.disconnectedAt = Date.now();
    this.broadcastRoom();
  }

  /** Elimina jugadores cuya gracia de reconexión expiró. Devuelve true si la sala queda vacía. */
  prune(now = Date.now()): boolean {
    for (const [id, p] of this.players) {
      if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > RECONNECT_GRACE_MS) {
        this.players.delete(id);
      }
    }
    if (this.players.size > 0 && ![...this.players.values()].some((p) => p.isHost)) {
      const first = [...this.players.values()][0];
      if (first) first.isHost = true;
    }
    return this.players.size === 0;
  }

  private broadcast(msg: ServerMsg): void {
    for (const p of this.players.values()) p.outbox?.send(msg);
  }

  private broadcastRoom(excludeId?: string): void {
    const snap = this.snapshot();
    for (const p of this.players.values()) {
      if (p.id !== excludeId) p.outbox?.send({ t: "room", room: snap });
    }
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  create(): Room {
    let code = genCode();
    while (this.rooms.has(code)) code = genCode();
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  pruneAll(): void {
    for (const [code, room] of this.rooms) {
      if (room.prune()) this.rooms.delete(code);
    }
  }

  get roomCount(): number {
    return this.rooms.size;
  }
}
