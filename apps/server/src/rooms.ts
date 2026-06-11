import { customAlphabet } from "nanoid";
import type {
  ClientMsg,
  PlayerInfo,
  RoomSnapshot,
  ServerMsg,
  Station,
} from "@bridge/shared";
import { MAX_CHAT_LENGTH, MAX_NAME_LENGTH, MAX_PLAYERS, STATIONS } from "@bridge/shared";
import type { RoomPhase } from "@bridge/shared";
import { createTestScenario, type World } from "@bridge/sim";

const genCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const genId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12);

export interface Outbox {
  send(msg: ServerMsg): void;
  close(): void;
}

interface Player extends PlayerInfo {
  outbox: Outbox | null;
  disconnectedAt: number | null;
  resumeKey: string;
}

const RECONNECT_GRACE_MS = 5 * 60 * 1000;

export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  private players = new Map<string, Player>();
  phase: RoomPhase = "lobby";
  world: World | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private snapCounter = 0;

  constructor(code: string) {
    this.code = code;
  }

  startGame(byPlayerId: string): boolean {
    const p = this.players.get(byPlayerId);
    if (!p?.isHost || this.phase !== "lobby") return false;
    this.phase = "playing";
    this.world = createTestScenario(Date.now() % 100000);
    this.tickTimer = setInterval(() => this.tick(), 50);
    this.broadcastRoom();
    return true;
  }

  private tick(): void {
    if (!this.world) return;
    this.world.tick();
    this.snapCounter++;
    if (this.snapCounter % 2 === 0) {
      const snap = this.world.snapshot();
      this.broadcast({ t: "snap", snap });
    }
    // Fin de partida
    if (this.world.playerDead) {
      this.endGame(false, "La nave ha sido destruida. Fin de la misión.");
    } else if (this.world.hostilesAlive === 0) {
      this.endGame(true, "Todos los hostiles destruidos. ¡Victoria!");
    }
  }

  private endGame(victory: boolean, message: string): void {
    this.broadcast({ t: "gameOver", victory, message });
    this.stop();
    this.phase = "lobby";
    this.broadcastRoom();
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.world = null;
  }

  get playerCount(): number {
    return this.players.size;
  }

  /** Devuelve el jugador que corresponde a una resumeKey (para autenticar peticiones REST). */
  authByResumeKey(resumeKey: string): { id: string; name: string } | null {
    const p = [...this.players.values()].find((x) => x.resumeKey === resumeKey);
    return p ? { id: p.id, name: p.name } : null;
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      createdAt: this.createdAt,
      phase: this.phase,
      players: [...this.players.values()].map(
        ({ id, name, stations, isHost, connected }) => ({ id, name, stations: [...stations], isHost, connected }),
      ),
    };
  }

  join(name: string, outbox: Outbox): { ok: true; id: string } | { ok: false; error: string } {
    const cleanName = name.trim().slice(0, MAX_NAME_LENGTH);
    if (!cleanName) return { ok: false, error: "Nombre vacío" };
    const active = [...this.players.values()].filter((p) => p.connected).length;
    if (active >= MAX_PLAYERS) return { ok: false, error: "Sala llena" };

    const id = genId();
    const resumeKey = genId() + genId();
    const player: Player = {
      id,
      name: cleanName,
      stations: [],
      isHost: this.players.size === 0,
      connected: true,
      outbox,
      disconnectedAt: null,
      resumeKey,
    };
    this.players.set(id, player);
    // Garantía: siempre debe haber un host CONECTADO. Si no lo hay, este jugador lo es.
    if (![...this.players.values()].some((p) => p.isHost && p.connected)) {
      for (const p of this.players.values()) p.isHost = false;
      player.isHost = true;
    }
    outbox.send({ t: "welcome", selfId: id, resumeKey, room: this.snapshot() });
    this.broadcastRoom(id);
    return { ok: true, id };
  }

  /** Reconecta a un jugador existente usando su resumeKey. */
  resume(resumeKey: string, outbox: Outbox): { ok: true; id: string } | { ok: false; error: string } {
    const player = [...this.players.values()].find((p) => p.resumeKey === resumeKey);
    if (!player) return { ok: false, error: "Sesión expirada" };
    player.outbox?.close();
    player.outbox = outbox;
    player.connected = true;
    player.disconnectedAt = null;
    outbox.send({ t: "welcome", selfId: player.id, resumeKey, room: this.snapshot() });
    this.broadcastRoom(player.id);
    return { ok: true, id: player.id };
  }

  handleMessage(playerId: string, msg: ClientMsg): void {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (msg.t) {
      case "takeStation": {
        if (!STATIONS.includes(msg.station)) return;
        const taken = [...this.players.values()].some(
          (p) => p.stations.includes(msg.station) && p.id !== playerId,
        );
        if (taken) {
          player.outbox?.send({ t: "error", code: "station_taken", message: "Puesto ocupado" });
          return;
        }
        if (!player.stations.includes(msg.station)) {
          player.stations.push(msg.station as Station);
          this.broadcastRoom();
        }
        break;
      }
      case "leaveStation":
        player.stations = player.stations.filter((st) => st !== msg.station);
        this.broadcastRoom();
        break;
      case "chat": {
        const text = msg.text.trim().slice(0, MAX_CHAT_LENGTH);
        if (!text) return;
        this.broadcast({ t: "chat", from: player.id, fromName: player.name, text, ts: Date.now() });
        break;
      }
      case "startGame":
        if (!this.startGame(playerId)) {
          player.outbox?.send({ t: "error", code: "cannot_start", message: "Solo el host puede iniciar la partida" });
        }
        break;
      case "helm": {
        if (!player.stations.includes("helm")) {
          player.outbox?.send({ t: "error", code: "wrong_station", message: "No estás en Pilotaje" });
          return;
        }
        const ship = this.world?.ship;
        if (!ship) return;
        if (msg.cmd === "setImpulse" && typeof msg.value === "number") ship.setImpulse(msg.value);
        if (msg.cmd === "setHeading" && typeof msg.value === "number") ship.setTargetHeading(msg.value);
        break;
      }
      case "weapons": {
        if (!player.stations.includes("weapons")) {
          player.outbox?.send({ t: "error", code: "wrong_station", message: "No estás en Armamento" });
          return;
        }
        const ship = this.world?.ship;
        if (!ship || !this.world) return;
        switch (msg.cmd) {
          case "setTarget":
            ship.setTarget(typeof msg.id === "number" ? msg.id : null);
            break;
          case "loadTube":
            if (typeof msg.tube === "number") ship.loadTube(msg.tube);
            break;
          case "fireTube":
            if (typeof msg.tube === "number") ship.fireTube(msg.tube, this.world);
            break;
          case "shields":
            ship.setShields(Boolean(msg.up));
            break;
        }
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
    // El host no puede ser un desconectado: traspaso inmediato
    if (player.isHost) {
      const next = [...this.players.values()].find((p) => p.connected);
      if (next) {
        player.isHost = false;
        next.isHost = true;
      }
    }
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
    if (this.players.size === 0) {
      this.stop();
      return true;
    }
    return false;
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
