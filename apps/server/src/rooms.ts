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
import { CpuShip, SpaceStation, World, createTestScenario, dist } from "@bridge/sim";
import { ScenarioRunner } from "@bridge/lua-api";
import { MAX_SCENARIO_SIZE, loadScenarioLibrary, saveUserScenario, type Scenario } from "./scenarios.js";
import { HACK_RANGE, createSession, reveal, revealedCells, type HackSession } from "./hacking.js";

let SCENARIO_LIBRARY = loadScenarioLibrary();
export function getScenarioLibrary(): Scenario[] {
  return SCENARIO_LIBRARY;
}

export function publishScenario(name: string, source: string): Scenario {
  const sc = saveUserScenario(name, source);
  SCENARIO_LIBRARY = loadScenarioLibrary();
  return sc;
}

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
  scriptedChannel: boolean;
  hack: HackSession | null;
}

const RECONNECT_GRACE_MS = 5 * 60 * 1000;

export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  private players = new Map<string, Player>();
  phase: RoomPhase = "lobby";
  world: World | null = null;
  runner: ScenarioRunner | null = null;
  private selectedScenario: { id: string; name: string; source: string | null };
  private customScenario: { name: string; source: string } | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private snapCounter = 0;
  private scriptBusy = false;

  constructor(code: string) {
    this.code = code;
    this.selectedScenario = { id: "default", name: "Clásico", source: null };
  }

  selectScenario(byPlayerId: string, id: string): void {
    const player = this.players.get(byPlayerId);
    if (!player?.isHost || this.phase !== "lobby") return;
    if (id === "default") {
      this.selectedScenario = { id: "default", name: "Clásico", source: null };
    } else if (id === "custom" && this.customScenario) {
      this.selectedScenario = { id: "custom", name: this.customScenario.name + " (propio)", source: this.customScenario.source };
    } else {
      const sc = SCENARIO_LIBRARY.find((x) => x.id === id);
      if (sc) this.selectedScenario = { id: sc.id, name: sc.name, source: sc.source };
    }
    this.broadcastRoom();
  }

  uploadScenario(byPlayerId: string, name: string, source: string): void {
    const player = this.players.get(byPlayerId);
    if (!player?.isHost || this.phase !== "lobby") return;
    if (source.length > MAX_SCENARIO_SIZE) {
      player.outbox?.send({ t: "error", code: "scenario_too_big", message: "El escenario supera los 100 KB" });
      return;
    }
    const cleanName = name.replace(/\.lua$/, "").slice(0, 60) || "Escenario";
    this.customScenario = { name: cleanName, source };
    this.selectedScenario = { id: "custom", name: cleanName + " (propio)", source };
    this.broadcastRoom();
  }

  startGame(byPlayerId: string): boolean {
    const p = this.players.get(byPlayerId);
    if (!p?.isHost || this.phase !== "lobby") return false;
    this.phase = "playing";
    const source = this.selectedScenario.source;
    if (source) {
      this.world = new World(Date.now() % 100000);
      void this.startLuaScenario(source);
    } else {
      this.world = createTestScenario(Date.now() % 100000);
      this.tickTimer = setInterval(() => this.tick(), 50);
    }
    this.broadcastRoom();
    return true;
  }

  private async startLuaScenario(source: string): Promise<void> {
    try {
      const world = this.world!;
      this.runner = await ScenarioRunner.create(world, source, {
        onVictory: (faction) => {
          const win = faction !== "Kraylor";
          this.endGame(win, win ? "¡Victoria! El escenario se ha completado." : "Derrota: el escenario lo decidió así.");
        },
        onGlobalMessage: (text) =>
          this.broadcast({ t: "chat", from: "sys", fromName: "🎬 Escenario", text, ts: Date.now() }),
        onError: (message) =>
          this.broadcast({ t: "chat", from: "sys", fromName: "⚠️ Script", text: message, ts: Date.now() }),
      });
      await this.runner.init();
      this.tickTimer = setInterval(() => this.tick(), 50);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.broadcast({ t: "chat", from: "sys", fromName: "⚠️ Script", text: "El escenario no compila: " + msg.slice(0, 300), ts: Date.now() });
      this.stop();
      this.phase = "lobby";
      this.broadcastRoom();
    }
  }

  private tick(): void {
    if (!this.world) return;
    this.world.tick();
    this.snapCounter++;
    if (this.snapCounter % 2 === 0) {
      const snap = this.world.snapshot();
      this.broadcast({ t: "snap", snap });
    }
    // Script del escenario a 5 Hz (sin solaparse)
    if (this.runner && !this.runner.stopped && this.snapCounter % 4 === 0 && !this.scriptBusy) {
      this.scriptBusy = true;
      void this.runner.update(0.2).finally(() => { this.scriptBusy = false; });
    }
    // Fin de partida: la derrota siempre; la victoria automática solo sin script
    if (this.world.playerDead) {
      this.endGame(false, "La nave ha sido destruida. Fin de la misión.");
    } else if (!this.runner && this.world.hostilesAlive === 0) {
      this.endGame(true, "Todos los hostiles destruidos. ¡Victoria!");
    }
  }

  private async tryScriptedHail(player: Player, targetId: number): Promise<void> {
    const world = this.world;
    const runner = this.runner;
    const target = world?.get(targetId);
    if (!world || !runner || !target) return;
    const scripted = await runner.hasCommsFunction(targetId);
    if (scripted) {
      if (dist(world.ship, target) > 20000) {
        player.outbox?.send({ t: "error", code: "hail_failed", message: "Fuera de alcance de comunicaciones" });
        return;
      }
      const res = await runner.openComms(targetId);
      if (res && (res.text || res.options.length > 0)) {
        player.channelTargetId = targetId;
        player.scriptedChannel = true;
        const cs = target instanceof CpuShip || target instanceof SpaceStation ? target.callSign : "??";
        player.outbox?.send({
          t: "commsChannel",
          channel: { callSign: cs, text: res.text || "…", options: [...res.options, "Cerrar canal"] },
        });
        return;
      }
    }
    // Fallback: diálogos de serie
    player.scriptedChannel = false;
    if (target instanceof SpaceStation) {
      if (dist(world.ship, target) > 20000) {
        player.outbox?.send({ t: "error", code: "hail_failed", message: "Fuera de alcance de comunicaciones" });
        return;
      }
      player.channelTargetId = target.id;
      player.outbox?.send({
        t: "commsChannel",
        channel: {
          callSign: target.callSign,
          text: "Aquí " + target.callSign + ". Canal abierto. ¿Situación?",
          options: ["Solicitar informe táctico", "Cerrar canal"],
        },
      });
      return;
    }
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
  }

  private sendHackState(player: Player): void {
    const session = player.hack;
    if (!session) {
      player.outbox?.send({ t: "hack", state: null });
      return;
    }
    player.outbox?.send({
      t: "hack",
      state: {
        targetCallSign: session.targetCallSign,
        system: session.system,
        rows: 8,
        cols: 8,
        cells: revealedCells(session),
        safeLeft: session.safeLeft,
        status: session.status,
      },
    });
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
    this.runner?.dispose();
    this.runner = null;
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
      scenario: { id: this.selectedScenario.id, name: this.selectedScenario.name },
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
      scriptedChannel: false,
      hack: null,
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
      case "selectScenario":
        this.selectScenario(playerId, String(msg.id));
        break;
      case "uploadScenario":
        this.uploadScenario(playerId, String(msg.name ?? ""), String(msg.source ?? ""));
        break;
      case "selfDestruct": {
        const ship = this.world?.ship;
        if (!ship) return;
        if (msg.cmd === "arm" || msg.cmd === "cancel") {
          if (!player.stations.includes("captain")) {
            player.outbox?.send({ t: "error", code: "wrong_station", message: "Solo el capitán arma o cancela la autodestrucción" });
            return;
          }
          if (msg.cmd === "arm") {
            ship.armSelfDestruct();
            this.broadcast({ t: "chat", from: "sys", fromName: "☠️ AUTODESTRUCCIÓN", text: "Secuencia armada por el capitán. Ingeniería debe confirmar en 30 s.", ts: Date.now() });
          } else {
            ship.cancelSelfDestruct();
            this.broadcast({ t: "chat", from: "sys", fromName: "☠️ AUTODESTRUCCIÓN", text: "Secuencia cancelada.", ts: Date.now() });
          }
        }
        if (msg.cmd === "confirm") {
          if (!player.stations.includes("engineering")) {
            player.outbox?.send({ t: "error", code: "wrong_station", message: "Solo Ingeniería puede confirmar" });
            return;
          }
          ship.confirmSelfDestruct();
          this.broadcast({ t: "chat", from: "sys", fromName: "☠️ AUTODESTRUCCIÓN", text: "CONFIRMADA. Detonación en 10 segundos.", ts: Date.now() });
        }
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
        if (msg.cmd === "combat" && (msg.maneuver === "boost" || msg.maneuver === "left" || msg.maneuver === "right")) {
          ship.combatManeuver(msg.maneuver);
        }
        if (msg.cmd === "chargeJump" && typeof msg.distance === "number" && this.world) {
          if (!ship.chargeJump(msg.distance)) {
            player.outbox?.send({ t: "error", code: "jump_failed", message: "Salto no disponible (cooldown, atraque o carga en curso)" });
          }
        }
        if (msg.cmd === "executeJump" && this.world) ship.executeJump(this.world);
        if (msg.cmd === "abortJump") ship.abortJump();
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
        if (msg.cmd === "scanTune" && typeof msg.a === "number" && typeof msg.b === "number") {
          ship.setScanTune(msg.a, msg.b);
        }
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
            // Comms scriptados por el escenario Lua tienen prioridad
            if (target && this.runner && !this.runner.stopped) {
              void this.tryScriptedHail(player, target.id);
              // tryScriptedHail hace fallback a los diálogos de serie si no hay script
              return;
            }
            if (target instanceof SpaceStation) {
              if (dist(world.ship, target) > 20000) {
                player.outbox?.send({ t: "error", code: "hail_failed", message: "Fuera de alcance de comunicaciones" });
                return;
              }
              player.channelTargetId = target.id;
              player.outbox?.send({
                t: "commsChannel",
                channel: {
                  callSign: target.callSign,
                  text: "Aquí " + target.callSign + ". Canal abierto, " + (world.ship.callSign ?? "nave") + ". ¿Situación?",
                  options: ["Solicitar informe táctico", "Cerrar canal"],
                },
              });
              return;
            }
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
            if (player.scriptedChannel && this.runner && typeof msg.index === "number") {
              void this.runner.chooseComms(msg.index + 1).then((res) => {
                if (!res || (!res.text && res.options.length === 0)) {
                  player.scriptedChannel = false;
                  player.channelTargetId = null;
                  player.outbox?.send({ t: "commsChannel", channel: null });
                  return;
                }
                const target = player.channelTargetId != null ? this.world?.get(player.channelTargetId) : undefined;
                const cs = target instanceof CpuShip || target instanceof SpaceStation ? target.callSign : "??";
                player.outbox?.send({
                  t: "commsChannel",
                  channel: { callSign: cs, text: res.text, options: [...res.options, "Cerrar canal"] },
                });
              });
              return;
            }
            const target = player.channelTargetId != null ? world.get(player.channelTargetId) : undefined;
            if (target instanceof SpaceStation) {
              if (msg.index === 0) {
                const hostiles = world.hostilesAlive;
                player.outbox?.send({
                  t: "commsChannel",
                  channel: {
                    callSign: target.callSign,
                    text: hostiles > 0
                      ? "Nuestros sensores detectan " + hostiles + " contacto(s) hostil(es) activo(s) en el sector. Podéis atracar para reparaciones y reabastecimiento."
                      : "Sector despejado. Buen trabajo. Atracad cuando queráis.",
                    options: ["Solicitar informe táctico", "Cerrar canal"],
                  },
                });
              } else {
                player.channelTargetId = null;
                player.outbox?.send({ t: "commsChannel", channel: null });
              }
              break;
            }
            if (!(target instanceof CpuShip)) return;
            this.handleChannelChoice(player, target, msg.index);
            break;
          }
          case "closeChannel":
            player.scriptedChannel = false;
            player.channelTargetId = null;
            player.outbox?.send({ t: "commsChannel", channel: null });
            break;
          case "hackStart": {
            const target = world.get(typeof msg.id === "number" ? msg.id : -1);
            if (!(target instanceof CpuShip) || !target.scanned) {
              player.outbox?.send({ t: "error", code: "hack_failed", message: "Solo se hackean naves escaneadas" });
              return;
            }
            if (dist(world.ship, target) > HACK_RANGE) {
              player.outbox?.send({ t: "error", code: "hack_failed", message: "Acércate a menos de 3 km para hackear" });
              return;
            }
            const system = msg.system === "engines" || msg.system === "beams" ? msg.system : "shields";
            player.hack = createSession(target.id, target.callSign, system, Math.random);
            this.sendHackState(player);
            break;
          }
          case "hackReveal": {
            const session = player.hack;
            if (!session || session.status !== "playing") return;
            if (typeof msg.x !== "number" || typeof msg.y !== "number") return;
            reveal(session, msg.x, msg.y);
            if ((session.status as HackSession["status"]) === "success") {
              const target = world.get(session.targetId);
              if (target instanceof CpuShip) {
                if (session.system === "shields") target.shield = 0;
                if (session.system === "engines") target.enginesDisabledUntil = world.time + 25;
                if (session.system === "beams") target.beamsDisabledUntil = world.time + 25;
                this.broadcast({
                  t: "chat", from: "sys", fromName: "💻 Hackeo",
                  text: target.callSign + ": " + (session.system === "shields" ? "escudos fundidos" : session.system === "engines" ? "motores fuera 25 s" : "rayos fuera 25 s"),
                  ts: Date.now(),
                });
              }
            }
            this.sendHackState(player);
            break;
          }
          case "setAlert": {
            const lvl = msg.level === "yellow" || msg.level === "red" ? msg.level : "normal";
            world.ship.alert = lvl;
            const labels = { normal: "Estado normal", yellow: "ALERTA AMARILLA", red: "🔴 ALERTA ROJA" } as const;
            this.broadcast({ t: "chat", from: "sys", fromName: "🚨 Alerta", text: labels[lvl], ts: Date.now() });
            break;
          }
          case "hackCancel":
            player.hack = null;
            player.outbox?.send({ t: "hack", state: null });
            break;
          case "launchProbe":
            if (typeof msg.x === "number" && typeof msg.y === "number") {
              if (!world.launchProbe(world.ship, msg.x, msg.y)) {
                player.outbox?.send({ t: "error", code: "no_probes", message: "Sin sondas. Atraca para reabastecer." });
              }
            }
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
            if (typeof msg.tube === "number") ship.loadTube(msg.tube, msg.missile ?? "homing");
            break;
          case "unloadTube":
            if (typeof msg.tube === "number") ship.unloadTube(msg.tube);
            break;
          case "calibrateBeams":
            if (typeof msg.frequency === "number") ship.calibrateBeams(msg.frequency);
            break;
          case "calibrateShields":
            if (typeof msg.frequency === "number") ship.calibrateShields(msg.frequency);
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
