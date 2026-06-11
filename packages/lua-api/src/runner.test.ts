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
