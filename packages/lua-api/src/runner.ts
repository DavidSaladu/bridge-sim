import { LuaFactory, type LuaEngine } from "wasmoon";
import {
  Asteroid, CpuShip, Mine, Nebula, PlayerShip, SpaceStation, World,
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
  function e:orderRoaming() return self end
  function e:orderStandGround() return self end
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

function victory(faction) __api.victory(tostring(faction or "Human Navy")) end
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
          default: return -1;
        }
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
        if (e instanceof Nebula) e.radius = Math.max(200, Number(r) || 3000);
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

  dispose(): void {
    this.stopped = true;
    this.lua?.global.close();
    this.lua = null;
  }
}
