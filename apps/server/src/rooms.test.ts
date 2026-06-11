import { describe, expect, it, vi } from "vitest";
import { RoomManager, type Outbox } from "./rooms.js";
import type { ServerMsg } from "@bridge/shared";

function fakeOutbox(): Outbox & { msgs: ServerMsg[] } {
  const msgs: ServerMsg[] = [];
  return { msgs, send: (m) => msgs.push(m), close: () => {} };
}

describe("RoomManager", () => {
  it("crea salas con código de 6 caracteres único", () => {
    const mgr = new RoomManager();
    const a = mgr.create();
    const b = mgr.create();
    expect(a.code).toHaveLength(6);
    expect(a.code).not.toBe(b.code);
    expect(mgr.get(a.code.toLowerCase())).toBe(a);
  });

  it("admite hasta 6 jugadores y el primero es host", () => {
    const room = new RoomManager().create();
    const boxes = Array.from({ length: 7 }, fakeOutbox);
    const results = boxes.map((b, i) => room.join(`P${i}`, b));
    expect(results.slice(0, 6).every((r) => r.ok)).toBe(true);
    expect(results[6]?.ok).toBe(false);
    const snap = room.snapshot();
    expect(snap.players).toHaveLength(6);
    expect(snap.players[0]?.isHost).toBe(true);
    expect(snap.players.filter((p) => p.isHost)).toHaveLength(1);
  });

  it("no permite ocupar un puesto ya ocupado", () => {
    const room = new RoomManager().create();
    const b1 = fakeOutbox();
    const b2 = fakeOutbox();
    const r1 = room.join("Ana", b1);
    const r2 = room.join("Bea", b2);
    if (!r1.ok || !r2.ok) throw new Error("join failed");
    room.handleMessage(r1.id, { t: "takeStation", station: "helm" });
    room.handleMessage(r2.id, { t: "takeStation", station: "helm" });
    const err = b2.msgs.find((m) => m.t === "error");
    expect(err).toBeDefined();
    const snap = room.snapshot();
    expect(snap.players.find((p) => p.id === r1.id)?.stations).toContain("helm");
    expect(snap.players.find((p) => p.id === r2.id)?.stations).toHaveLength(0);
  });

  it("difunde el chat a todos", () => {
    const room = new RoomManager().create();
    const b1 = fakeOutbox();
    const b2 = fakeOutbox();
    const r1 = room.join("Ana", b1);
    room.join("Bea", b2);
    if (!r1.ok) throw new Error("join failed");
    room.handleMessage(r1.id, { t: "chat", text: "hola puente" });
    expect(b1.msgs.some((m) => m.t === "chat" && m.text === "hola puente")).toBe(true);
    expect(b2.msgs.some((m) => m.t === "chat" && m.text === "hola puente")).toBe(true);
  });

  it("mantiene al jugador 5 min tras desconexión y luego lo purga", () => {
    vi.useFakeTimers();
    const mgr = new RoomManager();
    const room = mgr.create();
    const r = room.join("Ana", fakeOutbox());
    if (!r.ok) throw new Error("join failed");
    room.disconnect(r.id);
    expect(room.snapshot().players[0]?.connected).toBe(false);
    expect(room.prune(Date.now() + 60_000)).toBe(false);
    expect(room.prune(Date.now() + 6 * 60_000)).toBe(true);
    vi.useRealTimers();
  });
});

describe("Reconexión", () => {
  it("resume devuelve la misma identidad y conserva el puesto", () => {
    const room = new RoomManager().create();
    const b1 = fakeOutbox();
    const r1 = room.join("Ana", b1);
    if (!r1.ok) throw new Error("join failed");
    const welcome = b1.msgs.find((m) => m.t === "welcome");
    if (!welcome || welcome.t !== "welcome") throw new Error("no welcome");
    room.handleMessage(r1.id, { t: "takeStation", station: "science" });
    room.disconnect(r1.id);

    const b2 = fakeOutbox();
    const r2 = room.resume(welcome.resumeKey, b2);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.id).toBe(r1.id);
    const snap = room.snapshot();
    expect(snap.players).toHaveLength(1);
    expect(snap.players[0]?.stations).toContain("science");
    expect(snap.players[0]?.connected).toBe(true);
  });

  it("resume con clave inválida falla", () => {
    const room = new RoomManager().create();
    expect(room.resume("clave-falsa", fakeOutbox()).ok).toBe(false);
  });
});

describe("Partida", () => {
  it("solo el host puede iniciar, y los snapshots llegan a todos", async () => {
    const room = new RoomManager().create();
    const b1 = fakeOutbox();
    const b2 = fakeOutbox();
    const r1 = room.join("Host", b1);
    const r2 = room.join("Pil", b2);
    if (!r1.ok || !r2.ok) throw new Error("join failed");

    room.handleMessage(r2.id, { t: "startGame" });
    expect(room.phase).toBe("lobby");
    expect(b2.msgs.some((m) => m.t === "error" && m.code === "cannot_start")).toBe(true);

    room.handleMessage(r1.id, { t: "startGame" });
    expect(room.phase).toBe("playing");

    await new Promise((r) => setTimeout(r, 250));
    room.stop();
    expect(b1.msgs.some((m) => m.t === "snap")).toBe(true);
    expect(b2.msgs.some((m) => m.t === "snap")).toBe(true);
  });

  it("los comandos helm solo valen desde Pilotaje", async () => {
    const room = new RoomManager().create();
    const b1 = fakeOutbox();
    const r1 = room.join("Host", b1);
    if (!r1.ok) throw new Error("join failed");
    room.handleMessage(r1.id, { t: "startGame" });

    room.handleMessage(r1.id, { t: "helm", cmd: "setImpulse", value: 1 });
    expect(b1.msgs.some((m) => m.t === "error" && m.code === "wrong_station")).toBe(true);
    expect(room.world?.ship.impulse).toBe(0);

    room.handleMessage(r1.id, { t: "takeStation", station: "helm" });
    room.handleMessage(r1.id, { t: "helm", cmd: "setImpulse", value: 0.8 });
    expect(room.world?.ship.impulse).toBe(0.8);
    room.stop();
  });
});

describe("Multipuesto", () => {
  it("un jugador puede ocupar varios puestos y dejar uno concreto", () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Solo", b);
    if (!r.ok) throw new Error("join failed");
    room.handleMessage(r.id, { t: "takeStation", station: "helm" });
    room.handleMessage(r.id, { t: "takeStation", station: "weapons" });
    room.handleMessage(r.id, { t: "takeStation", station: "captain" });
    expect(room.snapshot().players[0]?.stations).toEqual(["helm", "weapons", "captain"]);
    room.handleMessage(r.id, { t: "leaveStation", station: "weapons" });
    expect(room.snapshot().players[0]?.stations).toEqual(["helm", "captain"]);
    // y los comandos helm funcionan estando también de capitán
    room.handleMessage(r.id, { t: "startGame" });
    room.handleMessage(r.id, { t: "helm", cmd: "setImpulse", value: 0.5 });
    expect(room.world?.ship.impulse).toBe(0.5);
    room.stop();
  });
});

describe("Armas y fin de partida", () => {
  it("comandos weapons solo desde Armamento, y la victoria devuelve al lobby", async () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Art", b);
    if (!r.ok) throw new Error("join failed");
    room.handleMessage(r.id, { t: "takeStation", station: "weapons" });
    room.handleMessage(r.id, { t: "startGame" });

    // matar a los hostiles directamente para forzar victoria (sobre el mundo real, sin niebla)
    const world = room.world!;
    for (const e of world.allEntities()) {
      if (e.kind === "cpu") {
        (e as unknown as { takeDamage: (d: number, b: number, w: typeof world) => boolean }).takeDamage(99999, 0, world);
      }
    }
    await new Promise((res) => setTimeout(res, 150));
    expect(b.msgs.some((m) => m.t === "gameOver" && m.victory)).toBe(true);
    expect(room.phase).toBe("lobby");
    expect(room.world).toBeNull();
  });
});

describe("Traspaso de host", () => {
  it("si el host se desconecta, el rol pasa al primer jugador conectado", () => {
    const room = new RoomManager().create();
    const r1 = room.join("A", fakeOutbox());
    const r2 = room.join("B", fakeOutbox());
    if (!r1.ok || !r2.ok) throw new Error("join failed");
    room.disconnect(r1.id);
    const snap = room.snapshot();
    expect(snap.players.find((p) => p.id === r2.id)?.isHost).toBe(true);
    expect(snap.players.find((p) => p.id === r1.id)?.isHost).toBe(false);
  });
});

describe("Host con StrictMode (conexión doble)", () => {
  it("si el host fantasma está desconectado y entra alguien nuevo, el nuevo es host", () => {
    const room = new RoomManager().create();
    const r1 = room.join("A", fakeOutbox());
    if (!r1.ok) throw new Error("join failed");
    room.disconnect(r1.id); // queda fantasma con isHost
    const r2 = room.join("A", fakeOutbox()); // remontaje de StrictMode
    if (!r2.ok) throw new Error("join failed");
    const snap = room.snapshot();
    expect(snap.players.find((p) => p.id === r2.id)?.isHost).toBe(true);
    expect(snap.players.filter((p) => p.isHost)).toHaveLength(1);
  });
});

describe("Ingeniería", () => {
  it("los comandos solo valen desde Ingeniería y modifican los sistemas", () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Ing", b);
    if (!r.ok) throw new Error("join failed");
    room.handleMessage(r.id, { t: "startGame" });

    room.handleMessage(r.id, { t: "engineering", cmd: "setPower", system: "impulse", value: 3 });
    expect(b.msgs.some((m) => m.t === "error" && m.code === "wrong_station")).toBe(true);
    expect(room.world?.ship.engineering.systems.impulse.power).toBe(1);

    room.handleMessage(r.id, { t: "takeStation", station: "engineering" });
    room.handleMessage(r.id, { t: "engineering", cmd: "setPower", system: "impulse", value: 3 });
    room.handleMessage(r.id, { t: "engineering", cmd: "setCoolant", system: "impulse", value: 5 });
    room.handleMessage(r.id, { t: "engineering", cmd: "repair", system: "impulse" });
    const eng = room.world!.ship.engineering;
    expect(eng.systems.impulse.power).toBe(3);
    expect(eng.systems.impulse.coolant).toBe(5);
    expect(eng.repairing).toBe("impulse");
    room.stop();
  });
});

describe("Ciencia", () => {
  it("escanear solo desde Ciencia, y el escaneo arranca", () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Sci", b);
    if (!r.ok) throw new Error("join failed");
    room.handleMessage(r.id, { t: "startGame" });
    const cpu = room.world!.snapshot().entities.find((e) => e.kind === "cpu")!;

    room.handleMessage(r.id, { t: "science", cmd: "scan", id: cpu.id });
    expect(b.msgs.some((m) => m.t === "error" && m.code === "wrong_station")).toBe(true);

    room.handleMessage(r.id, { t: "takeStation", station: "science" });
    room.handleMessage(r.id, { t: "science", cmd: "scan", id: cpu.id });
    expect(room.world!.ship.scanTargetId).toBe(cpu.id);
    room.stop();
  });
});

describe("Comunicaciones", () => {
  function setupComms() {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Com", b);
    if (!r.ok) throw new Error("join failed");
    room.handleMessage(r.id, { t: "takeStation", station: "comms" });
    room.handleMessage(r.id, { t: "startGame" });
    const world = room.world!;
    const cpu = [...world.allEntities()].find((e) => e.kind === "cpu")!;
    return { room, b, r, world, cpu };
  }

  it("waypoints se añaden y aparecen en snapshots", () => {
    const { room, r, world } = setupComms();
    room.handleMessage(r.id, { t: "comms", cmd: "addWaypoint", x: 1000, y: -2000 });
    expect(world.snapshot().waypoints).toHaveLength(1);
    room.stop();
  });

  it("no se puede llamar a un contacto sin escanear; escaneado sí, y la rendición funciona", () => {
    const { room, b, r, world, cpu } = setupComms();
    room.handleMessage(r.id, { t: "comms", cmd: "hail", id: cpu.id });
    expect(b.msgs.some((m) => m.t === "error" && m.code === "hail_failed")).toBe(true);

    const ship = world.get(cpu.id) as unknown as { scanned: boolean; hull: number; surrendered: boolean };
    ship.scanned = true;
    room.handleMessage(r.id, { t: "comms", cmd: "hail", id: cpu.id });
    const ch = b.msgs.find((m) => m.t === "commsChannel");
    expect(ch && ch.t === "commsChannel" && ch.channel?.options).toContain("Exigir rendición");

    // intacta: se niega
    room.handleMessage(r.id, { t: "comms", cmd: "choose", index: 0 });
    expect(ship.surrendered).toBe(false);

    // malherida: se rinde
    ship.hull = 5;
    room.handleMessage(r.id, { t: "comms", cmd: "choose", index: 0 });
    expect(ship.surrendered).toBe(true);
    expect(world.hostilesAlive).toBe(1); // queda el otro KR
    room.stop();
  });
});

describe("Atraque", () => {
  it("el comando dock de Pilotaje atraca junto a una estación", () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Pil", b);
    if (!r.ok) throw new Error("join failed");
    room.handleMessage(r.id, { t: "takeStation", station: "helm" });
    room.handleMessage(r.id, { t: "startGame" });
    const ship = room.world!.ship;
    // junto a DS-1
    ship.x = -1800; ship.y = -900; ship.speed = 0; ship.impulse = 0;
    room.handleMessage(r.id, { t: "helm", cmd: "dock" });
    expect(ship.dockedTo).not.toBeNull();
    // mover el impulso despega automáticamente
    room.handleMessage(r.id, { t: "helm", cmd: "setImpulse", value: 0.5 });
    expect(ship.dockedTo).toBeNull();
    room.stop();
  });
});

describe("Escenarios Lua", () => {
  it("la sala arranca con el escenario Clásico y el host puede cambiar a la biblioteca", () => {
    const room = new RoomManager().create();
    expect(room.snapshot().scenario.id).toBe("default");
    const r = room.join("H", fakeOutbox());
    if (!r.ok) throw new Error("join failed");
    room.selectScenario(r.id, "emboscada");
    expect(room.snapshot().scenario.id).toBe("emboscada");
  });

  it("el host puede subir un escenario propio y la partida lo ejecuta", async () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Host", b);
    if (!r.ok) throw new Error("join failed");
    room.uploadScenario(r.id, "mi-mision.lua", `
      function init()
        CpuShip():setCallSign("LUA-1"):setPosition(3000, 0):setScanned(true)
        globalMessage("hola desde lua")
      end
    `);
    expect(room.snapshot().scenario.id).toBe("custom");
    room.handleMessage(r.id, { t: "startGame" });
    await new Promise((res) => setTimeout(res, 800));
    const cpu = [...room.world!.allEntities()].find((e) => e.kind === "cpu");
    expect(cpu).toBeDefined();
    expect(b.msgs.some((m) => m.t === "chat" && m.text === "hola desde lua")).toBe(true);
    room.stop();
  });

  it("un escenario que no compila devuelve la sala al lobby con aviso", async () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Host", b);
    if (!r.ok) throw new Error("join failed");
    room.uploadScenario(r.id, "roto.lua", "function init( syntax error");
    room.handleMessage(r.id, { t: "startGame" });
    await new Promise((res) => setTimeout(res, 800));
    expect(room.phase).toBe("lobby");
    expect(b.msgs.some((m) => m.t === "chat" && m.fromName === "⚠️ Script")).toBe(true);
    room.stop();
  });

  it("victory() del script termina la partida", async () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Host", b);
    if (!r.ok) throw new Error("join failed");
    room.uploadScenario(r.id, "win.lua", `
      function update(delta) victory("Human Navy") end
    `);
    room.handleMessage(r.id, { t: "startGame" });
    await new Promise((res) => setTimeout(res, 1200));
    expect(b.msgs.some((m) => m.t === "gameOver" && m.victory)).toBe(true);
    expect(room.phase).toBe("lobby");
  });
});

describe("Autodestrucción", () => {
  it("la arma el capitán, la confirma ingeniería y destruye la nave", async () => {
    const room = new RoomManager().create();
    const b1 = fakeOutbox();
    const b2 = fakeOutbox();
    const cap = room.join("Cap", b1);
    const ing = room.join("Ing", b2);
    if (!cap.ok || !ing.ok) throw new Error("join failed");
    room.handleMessage(cap.id, { t: "takeStation", station: "captain" });
    room.handleMessage(ing.id, { t: "takeStation", station: "engineering" });
    room.handleMessage(cap.id, { t: "startGame" });

    // ingeniería no puede armar
    room.handleMessage(ing.id, { t: "selfDestruct", cmd: "arm" });
    expect(room.world!.ship.selfDestruct).toBeNull();
    // capitán arma, ingeniería confirma
    room.handleMessage(cap.id, { t: "selfDestruct", cmd: "arm" });
    expect(room.world!.ship.selfDestruct?.state).toBe("armed");
    room.handleMessage(ing.id, { t: "selfDestruct", cmd: "confirm" });
    expect(room.world!.ship.selfDestruct?.state).toBe("countdown");
    room.world!.ship.selfDestruct!.t = 0.05;
    await new Promise((r) => setTimeout(r, 300));
    expect(b1.msgs.some((m) => m.t === "gameOver" && !m.victory)).toBe(true);
  });
});

describe("Comms con estaciones", () => {
  it("se puede llamar a DS-1 y pedir informe táctico", () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Com", b);
    if (!r.ok) throw new Error("join failed");
    room.handleMessage(r.id, { t: "takeStation", station: "comms" });
    room.handleMessage(r.id, { t: "startGame" });
    const station = [...room.world!.allEntities()].find((e) => e.kind === "station")!;
    room.handleMessage(r.id, { t: "comms", cmd: "hail", id: station.id });
    const ch = b.msgs.filter((m) => m.t === "commsChannel").pop();
    expect(ch && ch.t === "commsChannel" && ch.channel?.callSign).toBe("DS-1");
    room.handleMessage(r.id, { t: "comms", cmd: "choose", index: 0 });
    const rep = b.msgs.filter((m) => m.t === "commsChannel").pop();
    expect(rep && rep.t === "commsChannel" && /hostil/.test(rep.channel?.text ?? "")).toBe(true);
    room.stop();
  });
});

describe("Biblioteca persistente", () => {
  it("publicar añade el escenario a la biblioteca con id user-", async () => {
    const { publishScenario, getScenarioLibrary } = await import("./rooms.js");
    const before = getScenarioLibrary().length;
    const sc = publishScenario("Test Pérsis", "function init() globalMessage('hola') end");
    expect(sc.id.startsWith("user-")).toBe(true);
    expect(getScenarioLibrary().length).toBe(before + 1);
    expect(getScenarioLibrary().some((x) => x.id === sc.id)).toBe(true);
  });
});

describe("Hacking en sala", () => {
  it("hackea escudos de una nave escaneada cercana", () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Hk", b);
    if (!r.ok) throw new Error("join failed");
    room.handleMessage(r.id, { t: "takeStation", station: "comms" });
    room.handleMessage(r.id, { t: "startGame" });
    const world = room.world!;
    const cpu = [...world.allEntities()].find((e) => e.kind === "cpu") as unknown as {
      id: number; scanned: boolean; shield: number; x: number; y: number;
    };
    cpu.scanned = true;
    cpu.x = world.ship.x + 1000; cpu.y = world.ship.y;

    room.handleMessage(r.id, { t: "comms", cmd: "hackStart", id: cpu.id, system: "shields" });
    const st = b.msgs.filter((m) => m.t === "hack").pop();
    expect(st && st.t === "hack" && st.state?.status).toBe("playing");

    // ganar revelando todas las seguras (accediendo a la sesión interna)
    const session = (room as unknown as { players: Map<string, { hack: { board: number[][] } | null }> })
      .players.get(r.id)!.hack!;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (session.board[y]![x] !== -1) room.handleMessage(r.id, { t: "comms", cmd: "hackReveal", x, y });
      }
    }
    const fin = b.msgs.filter((m) => m.t === "hack").pop();
    expect(fin && fin.t === "hack" && fin.state?.status).toBe("success");
    expect(cpu.shield).toBe(0);
    room.stop();
  });
});
