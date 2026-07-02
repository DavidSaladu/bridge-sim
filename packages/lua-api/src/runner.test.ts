import { describe, expect, it } from "vitest";
import { World, CpuShip, Nebula } from "@bridge/sim";
import { ScenarioRunner, type RunnerCallbacks } from "./runner.js";

function makeCallbacks() {
  const log = { victories: [] as string[], messages: [] as string[], errors: [] as string[] };
  const cb: RunnerCallbacks = {
    onVictory: (f) => log.victories.push(f),
    onGlobalMessage: (t) => log.messages.push(t),
    onError: (e) => log.errors.push(e),
  };
  return { log, cb };
}

describe("ScenarioRunner", () => {
  it("init() crea entidades estilo EE con métodos encadenados", async () => {
    const w = new World(1);
    const { log, cb } = makeCallbacks();
    const runner = await ScenarioRunner.create(w, `
      local kr
      function init()
        SpaceStation():setCallSign("DS-9"):setPosition(1000, 2000)
        kr = CpuShip():setTemplate("Adder MK5"):setFaction("Kraylor"):setCallSign("X-1"):setPosition(5000, 0)
        Nebula():setPosition(-3000, 0):setRadius(2500)
        globalMessage("Escenario cargado")
      end
    `, cb);
    await runner.init();
    const ents = [...w.allEntities()];
    const cpu = ents.find((e) => e instanceof CpuShip) as CpuShip;
    expect(cpu.callSign).toBe("X-1");
    expect(cpu.template.name).toBe("Adder MK5");
    expect(cpu.x).toBe(5000);
    const neb = ents.find((e) => e instanceof Nebula) as Nebula;
    expect(neb.radius).toBe(2500);
    expect(log.messages).toContain("Escenario cargado");
    runner.dispose();
  });

  it("update() corre con delta y puede declarar la victoria", async () => {
    const w = new World(1);
    const { log, cb } = makeCallbacks();
    const runner = await ScenarioRunner.create(w, `
      local t = 0
      function update(delta)
        t = t + delta
        if t >= 1 then victory("Human Navy") end
      end
    `, cb);
    for (let i = 0; i < 6; i++) await runner.update(0.2);
    expect(log.victories).toContain("Human Navy");
    runner.dispose();
  });

  it("los errores del script no tumban el runner y se reportan; a la 3ª se pausa", async () => {
    const w = new World(1);
    const { log, cb } = makeCallbacks();
    const runner = await ScenarioRunner.create(w, `
      function update(delta) error("kaboom") end
    `, cb);
    for (let i = 0; i < 5; i++) await runner.update(0.2);
    expect(log.errors.length).toBeGreaterThanOrEqual(3);
    expect(runner.stopped).toBe(true);
    runner.dispose();
  });

  it("sandbox: sin io, require ni load", async () => {
    const w = new World(1);
    const { log, cb } = makeCallbacks();
    const runner = await ScenarioRunner.create(w, `
      function init()
        if io == nil and require == nil and load == nil then globalMessage("sandbox ok") end
      end
    `, cb);
    await runner.init();
    expect(log.messages).toContain("sandbox ok");
    runner.dispose();
  });

  it("isValid/destroy y getPlayerShip funcionan", async () => {
    const w = new World(1);
    const { log, cb } = makeCallbacks();
    const runner = await ScenarioRunner.create(w, `
      local a
      function init()
        a = CpuShip():setCallSign("BYE")
        globalMessage(getPlayerShip(-1):getCallSign())
        if a:isValid() then a:destroy() end
        if not a:isValid() then globalMessage("destruida") end
      end
    `, cb);
    await runner.init();
    expect(log.messages).toContain("ARTEMIS");
    expect(log.messages).toContain("destruida");
    runner.dispose();
  });
});

describe("B2.2: utilidades y comms scriptados", () => {
  it("utilidades EE: random, vectorFromAngle, distance, reputación, órdenes", async () => {
    const w = new World(2);
    const { log, cb } = makeCallbacks();
    const runner = await ScenarioRunner.create(w, `
      function init()
        local dx, dy = vectorFromAngle(0, 100)
        if math.abs(dx - 100) < 0.01 and math.abs(dy) < 0.01 then globalMessage("vector ok") end
        local r = random(5, 10)
        if r >= 5 and r <= 10 then globalMessage("random ok") end
        local a = CpuShip():setPosition(0, 0)
        local b = CpuShip():setPosition(300, 400)
        if math.abs(distance(a, b) - 500) < 0.01 then globalMessage("distance ok") end
        b:orderDefendLocation(1000, 2000)
        addReputationPoints(25)
        if getReputationPoints() == 25 then globalMessage("rep ok") end
        a:setRotation(0) -- rotación 0 de EE = rumbo 90 (este)
        if math.abs(a:getHeading() - 90) < 0.01 then globalMessage("rotation ok") end
      end
    `, cb);
    await runner.init();
    for (const m of ["vector ok", "random ok", "distance ok", "rep ok", "rotation ok"]) {
      expect(log.messages).toContain(m);
    }
    const cpus = [...w.allEntities()].filter((e) => e.kind === "cpu");
    expect((cpus[1] as unknown as { order: { kind: string; x?: number } }).order.kind).toBe("defendLocation");
    runner.dispose();
  });

  it("setCommsFunction: diálogo scriptado con respuestas anidadas", async () => {
    const w = new World(2);
    const { cb } = makeCallbacks();
    const runner = await ScenarioRunner.create(w, `
      function init()
        station = SpaceStation():setCallSign("DS-LUA")
        station:setCommsFunction(function(target, source)
          setCommsMessage("Bienvenidos a DS-LUA. ¿Qué necesitan?")
          addCommsReply("Pedir refuerzos", function()
            setCommsMessage("Refuerzos en camino.")
            addCommsReply("Gracias", function() setCommsMessage("A su servicio.") end)
          end)
          addCommsReply("Nada, gracias", function() setCommsMessage("Corto y cierro.") end)
        end)
      end
    `, cb);
    await runner.init();
    const station = [...w.allEntities()].find((e) => e.kind === "station")!;
    expect(await runner.hasCommsFunction(station.id)).toBe(true);
    expect(await runner.hasCommsFunction(99999)).toBe(false);

    const open = await runner.openComms(station.id);
    expect(open?.text).toContain("Bienvenidos a DS-LUA");
    expect(open?.options).toEqual(["Pedir refuerzos", "Nada, gracias"]);

    const reply = await runner.chooseComms(1);
    expect(reply?.text).toBe("Refuerzos en camino.");
    expect(reply?.options).toEqual(["Gracias"]);

    const final = await runner.chooseComms(1);
    expect(final?.text).toBe("A su servicio.");
    runner.dispose();
  });

  it("Planet y BlackHole se crean con sus propiedades", async () => {
    const w = new World(2);
    const { cb } = makeCallbacks();
    const runner = await ScenarioRunner.create(w, `
      function init()
        Planet():setPosition(5000, 5000):setPlanetRadius(2500):setCallSign("Draguen"):setDescription("Gigante gaseoso")
        BlackHole():setPosition(-9000, 0)
        WarpJammer():setPosition(0, 4000):setRange(6000)
      end
    `, cb);
    await runner.init();
    const kinds = [...w.allEntities()].map((e) => e.kind);
    expect(kinds).toContain("planet");
    expect(kinds).toContain("blackhole");
    expect(kinds).toContain("warpjammer");
    const planet = [...w.allEntities()].find((e) => e.kind === "planet") as unknown as { radius: number; description: string };
    expect(planet.radius).toBe(2500);
    expect(planet.description).toBe("Gigante gaseoso");
    runner.dispose();
  });
});
