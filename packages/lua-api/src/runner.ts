import { LuaFactory, type LuaEngine } from "wasmoon";
import {
  Asteroid, BlackHole, CpuShip, Mine, Nebula, Planet, PlayerShip, SpaceStation, WarpJammer, World,
  type TemplateName,
} from "@bridge/sim";

export interface RunnerCallbacks {
  onVictory: (faction: string) => void;
  onGlobalMessage: (text: string) => void;
  onError: (message: string) => void;
}

/** Preludio Lua: clases estilo Empty Epsilon sobre el bridge __api, y sandbox. */
const PRELUDE = `
local function entity(id)
  local e = { __id = id }
  function e:setPosition(x, y) __api.setPosition(self.__id, x, y); return self end
  function e:getPosition() return __api.getX(self.__id), __api.getY(self.__id) end
  function e:setCallSign(cs) __api.setCallSign(self.__id, cs); return self end
  function e:getCallSign() return __api.getCallSign(self.__id) end
  function e:setTemplate(t) __api.setTemplate(self.__id, t); return self end
  function e:setFaction(f) __api.setFaction(self.__id, f); return self end
  function e:setHull(h) __api.setHull(self.__id, h); return self end
  function e:getHull() return __api.getHull(self.__id) end
  function e:setRadius(r) __api.setRadius(self.__id, r); return self end
  function e:isValid() return __api.isValid(self.__id) end
  function e:destroy() __api.destroy(self.__id); return self end
  -- Órdenes de IA (subset: la IA propia ya patrulla/ataca por facción)
  function e:orderRoaming() __api.order(self.__id, "roaming", 0, 0, -1); return self end
  function e:orderStandGround() __api.order(self.__id, "standGround", 0, 0, -1); return self end
  function e:orderIdle() __api.order(self.__id, "idle", 0, 0, -1); return self end
  function e:orderDefendLocation(x, y) __api.order(self.__id, "defendLocation", x, y, -1); return self end
  function e:orderFlyTowards(x, y) __api.order(self.__id, "flyTowards", x, y, -1); return self end
  function e:orderFlyTowardsBlind(x, y) __api.order(self.__id, "flyTowards", x, y, -1); return self end
  function e:orderDefendTarget(t) __api.order(self.__id, "defendTarget", 0, 0, t and t.__id or -1); return self end
  function e:orderAttack(t) __api.order(self.__id, "attack", 0, 0, t and t.__id or -1); return self end
  function e:setRotation(r) __api.setHeading(self.__id, (r + 90) % 360); return self end
  function e:setHeading(h) __api.setHeading(self.__id, h); return self end
  function e:getHeading() return __api.getHeading(self.__id) end
  function e:setDescription(d) __api.setDescription(self.__id, tostring(d or "")); return self end
  function e:setDescriptions(a, b) __api.setDescription(self.__id, tostring(b or a or "")); return self end
  function e:setCommsFunction(fn) __comms.fns[self.__id] = fn; return self end
  function e:setCommsScript(_) return self end
  function e:setScannedByFaction(_, v) __api.setScanned(self.__id, v ~= false); return self end
  function e:setPlanetRadius(r) __api.setRadius(self.__id, r); return self end
  function e:setPlanetSurfaceTexture(_) return self end
  function e:setPlanetAtmosphereColor(r, g, b) __api.setColor(self.__id, r, g, b); return self end
  function e:setPlanetAtmosphereTexture(_) return self end
  function e:setPlanetCloudTexture(_) return self end
  function e:setDistanceFromMovementPlane(_) return self end
  function e:setAxialRotationTime(_) return self end
  function e:setRange(r) __api.setRadius(self.__id, r); return self end
  function e:setHullMax(h) __api.setHullMax(self.__id, h); return self end
  function e:setShieldsMax(f, r) __api.setShieldsMax(self.__id, f or 0, r or f or 0); return self end
  function e:setImpulseMaxSpeed(v) __api.setSpec(self.__id, "maxSpeed", v); return self end
  function e:setRotationMaxSpeed(v) __api.setSpec(self.__id, "turnRate", v); return self end
  function e:getCallSign2() return __api.getCallSign(self.__id) end
  function e:setScanned(v) __api.setScanned(self.__id, v ~= false); return self end
  return e
end

function PlayerSpaceship() return entity(__api.player()) end
function getPlayerShip(_) return entity(__api.player()) end
function CpuShip() return entity(__api.spawn("cpu")) end
function SpaceStation() return entity(__api.spawn("station")) end
function Asteroid() return entity(__api.spawn("asteroid")) end
function Nebula() return entity(__api.spawn("nebula")) end
function Mine() return entity(__api.spawn("mine")) end
function Planet() return entity(__api.spawn("planet")) end
function BlackHole() return entity(__api.spawn("blackhole")) end
function WarpJammer() return entity(__api.spawn("warpjammer")) end
function SupplyDrop() return entity(__api.spawn("supplydrop")) end
function VisualAsteroid() return entity(__api.spawn("asteroid")) end

function victory(faction) __api.victory(tostring(faction or "Human Navy")) end

-- Utilidades clásicas de EE
function random(a, b) return a + math.random() * (b - a) end
function irandom(a, b) return math.random(math.floor(a), math.floor(b)) end
function vectorFromAngle(angle, length)
  return math.cos(angle / 180 * math.pi) * length, math.sin(angle / 180 * math.pi) * length
end
function distance(a, b, c, d)
  local x1, y1, x2, y2
  if type(a) == "table" then
    x1, y1 = a:getPosition()
    if type(b) == "table" then x2, y2 = b:getPosition() else x2, y2 = b, c end
  else
    x1, y1, x2, y2 = a, b, c, d
  end
  return math.sqrt((x1 - x2) ^ 2 + (y1 - y2) ^ 2)
end
local __settings = {}
function getScenarioSetting(name) return __settings[name] or "" end
function getEEVersion() return 20241208 end
function allowNewPlayerShips(_) end
function onNewPlayerShip(_) end
local __storage = {}
function getScriptStorage()
  return { get = function(_, k) return __storage[k] end, set = function(_, k, v) __storage[k] = v end }
end
function getSectorName(x, y) return __api.sectorName(x, y) end
function addReputationPoints(n) __api.addReputation(tonumber(n) or 0) end
function takeReputationPoints(n) __api.addReputation(-(tonumber(n) or 0)) end
function getReputationPoints() return __api.getReputation() end
function getObjectsInRadius(x, y, r)
  local out = {}
  local ids = __api.idsInRadius(x, y, r)
  for i = 1, #ids do out[i] = entity(ids[i]) end
  return out
end

-- Traducción (gettext de EE): _("categoría", "texto") o _("texto") → devuelve el texto
function _(a, b) return b or a end

-- Utilidades portadas de scripts/utils.lua de EE (GPL-2.0)
function setCirclePos(obj, x, y, angle, dist)
  local dx, dy = vectorFromAngle(angle, dist)
  return obj:setPosition(x + dx, y + dy)
end

function createObjectsOnLine(x1, y1, x2, y2, spacing, object_type, rows, chance, randomize)
  rows = rows or 1
  chance = chance or 100
  randomize = randomize or 0
  local d = distance(x1, y1, x2, y2)
  local xd = (x2 - x1) / d
  local yd = (y2 - y1) / d
  for cnt_x = 0, d, spacing do
    for cnt_y = 0, (rows - 1) * spacing, spacing do
      local px = x1 + xd * cnt_x + yd * (cnt_y - (rows - 1) * spacing * 0.5) + random(-randomize, randomize)
      local py = y1 + yd * cnt_x - xd * (cnt_y - (rows - 1) * spacing * 0.5) + random(-randomize, randomize)
      if random(0, 100) < chance then
        object_type():setPosition(px, py)
      end
    end
  end
end

function placeRandomAroundPoint(object_type, amount, dist_min, dist_max, x0, y0)
  for n = 1, amount do
    local r = random(0, 360)
    local dist = random(dist_min, dist_max)
    local dx, dy = vectorFromAngle(r, dist)
    object_type():setPosition(x0 + dx, y0 + dy)
  end
end

function mergeTables(a, b)
  for key, value in pairs(b) do
    if a[key] == nil then
      a[key] = value
    elseif type(a[key]) == "table" and type(value) == "table" then
      mergeTables(a[key], value)
    end
  end
end

function addGMFunction(_, _) end
function removeGMFunction(_) end
function clearGMFunctions() end

-- Sistema de comunicaciones scriptado (setCommsFunction / setCommsMessage / addCommsReply)
__comms = { fns = {}, current = nil }
function setCommsMessage(t)
  if __comms.current then __comms.current.text = tostring(t) end
end
function addCommsReply(t, cb)
  if __comms.current then
    table.insert(__comms.current.replies, { text = tostring(t), callback = cb })
  end
end
function __hasComms(id) return __comms.fns[id] ~= nil end
function __openComms(id)
  __comms.current = { text = "", replies = {}, targetId = id }
  local fn = __comms.fns[id]
  if fn then fn(entity(id), entity(__api.player())) end
  return __comms.current.text, #__comms.current.replies
end
function __commsReplyText(i)
  local r = __comms.current and __comms.current.replies[i]
  return r and r.text or ""
end
function __chooseComms(i)
  local prev = __comms.current
  local r = prev and prev.replies[i]
  __comms.current = { text = "", replies = {}, targetId = prev and prev.targetId }
  if r and r.callback then r.callback(entity(prev.targetId), entity(__api.player())) end
  return __comms.current.text, #__comms.current.replies
end
function globalMessage(text) __api.globalMessage(tostring(text)) end
function getScenarioTime() return __api.time() end

-- Sandbox: sin acceso al sistema
os = { time = function() return math.floor(__api.time()) end, clock = function() return __api.time() end }
io = nil
require = nil
dofile = nil
loadfile = nil
package = nil
load = nil
collectgarbage = function() end
`;

export class ScenarioRunner {
  private lua: LuaEngine | null = null;
  private world: World;
  private cb: RunnerCallbacks;
  private errorCount = 0;
  stopped = false;

  private constructor(world: World, cb: RunnerCallbacks) {
    this.world = world;
    this.cb = cb;
  }

  static async create(world: World, source: string, cb: RunnerCallbacks): Promise<ScenarioRunner> {
    const runner = new ScenarioRunner(world, cb);
    const factory = new LuaFactory();
    const lua = await factory.createEngine();
    runner.lua = lua;

    lua.global.set("__api", runner.makeApi());
    await lua.doString(PRELUDE);
    await lua.doString(source);
    return runner;
  }

  private makeApi() {
    const w = this.world;
    const get = (id: number) => w.get(id);
    return {
      player: () => w.ship.id,
      spawn: (kind: string): number => {
        switch (kind) {
          case "cpu": return w.addCpuShip(0, 0, "CPU", "Phobos T3", "Kraylor").id;
          case "station": return w.addStation(0, 0, "DS").id;
          case "asteroid": return w.addAsteroid(0, 0).id;
          case "nebula": return w.addNebula(0, 0, 3000).id;
          case "mine": return w.addMine(0, 0).id;
          case "planet": return w.addPlanet(0, 0).id;
          case "blackhole": return w.addBlackHole(0, 0).id;
          case "warpjammer": return w.addWarpJammer(0, 0).id;
          case "supplydrop": return w.addSupplyDrop(0, 0).id;
          default: return -1;
        }
      },
      order: (id: number, kind: string, x: number, y: number, targetId: number) => {
        const e = get(id);
        if (e instanceof CpuShip) {
          e.order = {
            kind: kind as typeof e.order.kind,
            x: Number(x) || 0,
            y: Number(y) || 0,
            targetId: targetId >= 0 ? targetId : undefined,
          };
        }
      },
      setHeading: (id: number, h: number) => {
        const e = get(id);
        if (e instanceof CpuShip || e instanceof PlayerShip) {
          e.heading = ((Number(h) || 0) % 360 + 360) % 360;
          e.targetHeading = e.heading;
        } else if (e) {
          e.heading = ((Number(h) || 0) % 360 + 360) % 360;
        }
      },
      getHeading: (id: number) => get(id)?.heading ?? 0,
      setDescription: (id: number, d: string) => {
        const e = get(id);
        if (e instanceof CpuShip || e instanceof Planet) e.description = String(d);
      },
      setColor: (id: number, r: number, g: number, b: number) => {
        const e = get(id);
        if (e instanceof Planet) {
          const h = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
          e.color = `#${h(r)}${h(g)}${h(b)}`;
        }
      },
      setHullMax: (id: number, hm: number) => {
        const e = get(id);
        if (e instanceof CpuShip) {
          e.spec = { ...e.spec, hullMax: Math.max(1, Number(hm) || 1) };
          e.hull = e.spec.hullMax;
        }
      },
      setShieldsMax: (id: number, f: number, _r: number) => {
        const e = get(id);
        if (e instanceof CpuShip) {
          e.shieldMax = Math.max(0, Number(f) || 0);
          e.shield = e.shieldMax;
        }
      },
      setSpec: (id: number, key: string, v: number) => {
        const e = get(id);
        if (e instanceof CpuShip && (key === "maxSpeed" || key === "turnRate")) {
          e.spec = { ...e.spec, [key]: Math.max(1, Number(v) || 1) };
        }
      },
      sectorName: (x: number, y: number) => {
        const col = Math.floor(x / 20000) + 5;
        const row = Math.floor(-y / 20000) + 5;
        const letter = row >= 0 && row < 26 ? String.fromCharCode(65 + row) : "?";
        return letter + (col >= 0 ? String(col) : "?");
      },
      addReputation: (n: number) => {
        w.reputation = Math.max(0, w.reputation + (Number(n) || 0));
      },
      getReputation: () => Math.round(w.reputation),
      idsInRadius: (x: number, y: number, r: number): number[] => {
        const out: number[] = [];
        for (const e of w.allEntities()) {
          if (!e.dead && Math.hypot(e.x - x, e.y - y) <= r) out.push(e.id);
        }
        return out;
      },
      setPosition: (id: number, x: number, y: number) => {
        const e = get(id);
        if (e) { e.x = Number(x) || 0; e.y = Number(y) || 0; }
      },
      getX: (id: number) => get(id)?.x ?? 0,
      getY: (id: number) => get(id)?.y ?? 0,
      setCallSign: (id: number, cs: string) => {
        const e = get(id);
        if (e instanceof CpuShip || e instanceof PlayerShip || e instanceof SpaceStation) e.callSign = String(cs);
      },
      getCallSign: (id: number) => {
        const e = get(id);
        return e instanceof CpuShip || e instanceof PlayerShip || e instanceof SpaceStation ? e.callSign : "";
      },
      setTemplate: (id: number, t: string) => {
        const e = get(id);
        if (e instanceof CpuShip) {
          try { e.applyTemplate(t as TemplateName); } catch { this.cb.onError(`Plantilla desconocida: ${t}`); }
        }
      },
      setFaction: (id: number, f: string) => {
        const e = get(id);
        if (e instanceof CpuShip) e.setFaction(String(f));
      },
      setHull: (id: number, h: number) => {
        const e = get(id);
        if (e instanceof CpuShip || e instanceof PlayerShip) e.hull = Math.max(1, Number(h) || 1);
      },
      getHull: (id: number) => {
        const e = get(id);
        return e instanceof CpuShip || e instanceof PlayerShip ? e.hull : 0;
      },
      setRadius: (id: number, r: number) => {
        const e = get(id);
        const v = Math.max(100, Number(r) || 3000);
        if (e instanceof Nebula || e instanceof Planet || e instanceof BlackHole) e.radius = v;
        if (e instanceof WarpJammer) e.range = v;
      },
      setScanned: (id: number, v: boolean) => {
        const e = get(id);
        if (e instanceof CpuShip) e.scanned = Boolean(v);
      },
      isValid: (id: number) => {
        const e = get(id);
        return Boolean(e && !e.dead);
      },
      destroy: (id: number) => w.removeEntity(id),
      victory: (faction: string) => this.cb.onVictory(faction),
      globalMessage: (text: string) => this.cb.onGlobalMessage(text),
      time: () => this.world.time,
    };
  }

  /** Llama a init() del escenario (si existe). */
  async init(): Promise<void> {
    await this.callGlobal("init");
  }

  /** Llama a update(delta) del escenario (si existe). */
  async update(delta: number): Promise<void> {
    await this.callGlobal("update", delta);
  }

  private async callGlobal(name: string, ...args: unknown[]): Promise<void> {
    if (!this.lua || this.stopped) return;
    const fn = this.lua.global.get(name);
    if (typeof fn !== "function") return;
    try {
      await fn(...args);
    } catch (err) {
      this.errorCount++;
      const msg = err instanceof Error ? err.message : String(err);
      this.cb.onError(`Error en ${name}(): ${msg.slice(0, 300)}`);
      if (this.errorCount >= 3) {
        this.stopped = true;
        this.cb.onError("Demasiados errores: el script del escenario queda pausado.");
      }
    }
  }

  /** ¿El escenario define comunicaciones para esta entidad? */
  async hasCommsFunction(id: number): Promise<boolean> {
    if (!this.lua || this.stopped) return false;
    try {
      return Boolean(await this.lua.doString(`return __hasComms(${id})`));
    } catch {
      return false;
    }
  }

  private async readCommsState(text: unknown, count: unknown): Promise<{ text: string; options: string[] } | null> {
    if (!this.lua) return null;
    const n = Number(count) || 0;
    const options: string[] = [];
    for (let i = 1; i <= n; i++) {
      options.push(String(await this.lua.doString(`return __commsReplyText(${i})`)));
    }
    return { text: String(text ?? ""), options };
  }

  async openComms(id: number): Promise<{ text: string; options: string[] } | null> {
    if (!this.lua || this.stopped) return null;
    try {
      const res = (await this.lua.doString(`local t, n = __openComms(${id}) return t .. "\u{1}" .. n`)) as string;
      const [text, n] = String(res).split("\u0001");
      return this.readCommsState(text, n);
    } catch (err) {
      this.cb.onError("Error en comms del escenario: " + String(err).slice(0, 200));
      return null;
    }
  }

  async chooseComms(index: number): Promise<{ text: string; options: string[] } | null> {
    if (!this.lua || this.stopped) return null;
    try {
      const res = (await this.lua.doString(`local t, n = __chooseComms(${index}) return t .. "\u{1}" .. n`)) as string;
      const [text, n] = String(res).split("\u0001");
      return this.readCommsState(text, n);
    } catch (err) {
      this.cb.onError("Error en comms del escenario: " + String(err).slice(0, 200));
      return null;
    }
  }

  dispose(): void {
    this.stopped = true;
    this.lua?.global.close();
    this.lua = null;
  }
}
