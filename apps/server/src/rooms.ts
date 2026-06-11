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
import { CpuShip, createTestScenario, dist, type World } from "@bridge/sim";

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
  channelTargetId: number | null;
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

  private sendChannel(player: Player, target: CpuShip): void {
    const badlyDamaged = target.hull / target.spec.hullMax < 0.3;
    const text = target.surrendered
      ? "Nos hemos rendido. No disparen, por favor."
      : badlyDamaged
        ? "*interferencias* …nuestros sistemas fallan… ¿qué queréis?"
        : "Aquí " + target.callSign + ". Abandonad el sector o abriremos fuego.";
    const options = target.surrendered ? ["Cerrar canal"] : ["Exigir rendición", "Amenazar", "Cerrar canal"];
    player.outbox?.send({ t: "commsChannel", channel: { callSign: target.callSign, text, options } });
  }

  private handleChannelChoice(player: Player, target: CpuShip, index: number): void {
    const badlyDamaged = target.hull / target.spec.hullMax < 0.3;
    if (target.surrendered || (target.surrendered === false && index === (target.surrendered ? 0 : 2))) {
      // "Cerrar canal"
      player.channelTargetId = null;
      player.outbox?.send({ t: "commsChannel", channel: null });
      return;
    }
    let text: string;
    if (index === 0) {
      // Exigir rendición
      if (badlyDamaged) {
        target.surrendered = true;
        text = "…está bien. Nos rendimos. Cesamos toda actividad de combate.";
        this.broadcast({ t: "chat", from: "sys", fromName: "📡 " + target.callSign, text: "Se ha rendido.", ts: Date.now() });
      } else {
        text = "¿Rendirnos? Ja. Tendréis que destruirnos.";
      }
    } else {
      // Amenazar
      text = badlyDamaged
        ? "*estática* …no nos asustáis… apenas…"
        : "Vuestras amenazas no significan nada, " + (this.world?.ship.callSign ?? "nave") + ".";
    }
    const options = target.surrendered ? ["Cerrar canal"] : ["Exigir rendición", "Amenazar", "Cerrar canal"];
    player.outbox?.send({ t: "commsChannel", channel: { callSign: target.callSign, text, options } });
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
      channelTargetId: null,
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
        if (msg.cmd === "setImpulse" && typeof msg.value === "number") {
          if (ship.dockedTo != null) ship.undock(); // mover impulso despega
          ship.setImpulse(msg.value);
        }
        if (msg.cmd === "setHeading" && typeof msg.value === "number") ship.setTargetHeading(msg.value);
        if (msg.cmd === "dock" && this.world) {
          if (!ship.requestDock(this.world)) {
            player.outbox?.send({ t: "error", code: "dock_failed", message: "Acércate a menos de 1 km y frena a <40 m/s" });
          }
        }
        if (msg.cmd === "undock") ship.undock();
        if (msg.cmd === "setWarp" && typeof msg.value === "number") ship.setWarp(msg.value);
        break;
      }
      case "engineering": {
        if (!player.stations.includes("engineering")) {
          player.outbox?.send({ t: "error", code: "wrong_station", message: "No estás en Ingeniería" });
          return;
        }
        const eng = this.world?.ship.engineering;
        if (!eng) return;
        switch (msg.cmd) {
          case "setPower":
            if (typeof msg.value === "number") eng.setPower(msg.system, msg.value);
            break;
          case "setCoolant":
            if (typeof msg.value === "number") eng.setCoolant(msg.system, msg.value);
            break;
          case "repair":
            eng.setRepair(msg.system);
            break;
        }
        break;
      }
      case "science": {
        if (!player.stations.includes("science")) {
          player.outbox?.send({ t: "error", code: "wrong_station", message: "No estás en Ciencia" });
          return;
        }
        const ship = this.world?.ship;
        if (!ship || !this.world) return;
        if (msg.cmd === "scan" && typeof msg.id === "number") {
          if (!ship.startScan(msg.id, this.world)) {
            player.outbox?.send({ t: "error", code: "scan_failed", message: "Fuera de alcance o ya escaneado" });
          }
        }
        if (msg.cmd === "cancelScan") ship.cancelScan();
        break;
      }
      case "comms": {
        if (!player.stations.includes("comms")) {
          player.outbox?.send({ t: "error", code: "wrong_station", message: "No estás en Comunicaciones" });
          return;
        }
        if (!this.world) return;
        const world = this.world;
        switch (msg.cmd) {
          case "addWaypoint":
            if (typeof msg.x === "number" && typeof msg.y === "number") world.addWaypoint(msg.x, msg.y);
            break;
          case "removeWaypoint":
            if (typeof msg.id === "number") world.removeWaypoint(msg.id);
            break;
          case "hail": {
            const target = world.get(typeof msg.id === "number" ? msg.id : -1);
            if (!(target instanceof CpuShip) || !target.scanned) {
              player.outbox?.send({ t: "error", code: "hail_failed", message: "Solo puedes llamar a contactos escaneados" });
              return;
            }
            if (dist(world.ship, target) > 20000) {
              player.outbox?.send({ t: "error", code: "hail_failed", message: "Fuera de alcance de comunicaciones" });
              return;
            }
            player.channelTargetId = target.id;
            this.sendChannel(player, target);
            break;
          }
          case "choose": {
            const target = player.channelTargetId != null ? world.get(player.channelTargetId) : undefined;
            if (!(target instanceof CpuShip)) return;
            this.handleChannelChoice(player, target, msg.index);
            break;
          }
          case "closeChannel":
            player.channelTargetId = null;
            player.outbox?.send({ t: "commsChannel", channel: null });
            break;
        }
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
