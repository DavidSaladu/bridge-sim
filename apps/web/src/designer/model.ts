/** Modelo del diseñador visual de escenarios y generación de Lua. */

export type DesignKind = "playerStart" | "station" | "cpu" | "nebula" | "mine" | "asteroid";

export interface DesignObject {
  id: number;
  kind: DesignKind;
  x: number;
  y: number;
  callSign?: string;
  template?: string;
  faction?: string;
  scanned?: boolean;
  radius?: number;
}

export type VictoryPreset = "hostiles" | "survive" | "manual";

export interface DesignMeta {
  description: string;
  victory: VictoryPreset;
  surviveSeconds: number;
}

export const CPU_TEMPLATES = ["Phobos T3", "Adder MK5", "Flavia Falcon"] as const;
export const FACTIONS = ["Kraylor", "Independent", "Human Navy"] as const;

let nextId = 1;
export function newObject(kind: DesignKind, x: number, y: number): DesignObject {
  const base: DesignObject = { id: nextId++, kind, x: Math.round(x), y: Math.round(y) };
  if (kind === "station") base.callSign = "DS-1";
  if (kind === "cpu") {
    base.callSign = "KR-1";
    base.template = "Phobos T3";
    base.faction = "Kraylor";
    base.scanned = false;
  }
  if (kind === "nebula") base.radius = 3000;
  return base;
}

function luaStr(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function generateLua(name: string, meta: DesignMeta, objects: DesignObject[]): string {
  const lines: string[] = [];
  lines.push(`-- Name: ${name}`);
  if (meta.description) lines.push(`-- Description: ${meta.description}`);
  lines.push(`-- Generado con el diseñador visual de Bridge Sim`);
  lines.push("");

  const hostiles = objects.filter((o) => o.kind === "cpu" && o.faction === "Kraylor");
  if (meta.victory === "hostiles" && hostiles.length > 0) lines.push("local hostiles = {}");
  lines.push("");
  lines.push("function init()");

  const start = objects.find((o) => o.kind === "playerStart");
  if (start) lines.push(`  getPlayerShip(-1):setPosition(${start.x}, ${start.y})`);

  let h = 0;
  for (const o of objects) {
    switch (o.kind) {
      case "playerStart":
        break;
      case "station":
        lines.push(`  SpaceStation():setCallSign(${luaStr(o.callSign ?? "DS")}):setPosition(${o.x}, ${o.y})`);
        break;
      case "cpu": {
        const expr = `CpuShip():setTemplate(${luaStr(o.template ?? "Phobos T3")}):setFaction(${luaStr(o.faction ?? "Kraylor")})` +
          `:setCallSign(${luaStr(o.callSign ?? "CPU")}):setPosition(${o.x}, ${o.y})` +
          (o.scanned ? ":setScanned(true)" : "");
        if (meta.victory === "hostiles" && o.faction === "Kraylor") {
          h++;
          lines.push(`  hostiles[${h}] = ${expr}`);
        } else {
          lines.push(`  ${expr}`);
        }
        break;
      }
      case "nebula":
        lines.push(`  Nebula():setPosition(${o.x}, ${o.y}):setRadius(${o.radius ?? 3000})`);
        break;
      case "mine":
        lines.push(`  Mine():setPosition(${o.x}, ${o.y})`);
        break;
      case "asteroid":
        lines.push(`  Asteroid():setPosition(${o.x}, ${o.y})`);
        break;
    }
  }
  lines.push("end");
  lines.push("");
  lines.push("function update(delta)");
  if (meta.victory === "hostiles" && hostiles.length > 0) {
    lines.push("  -- Victoria: destruir todos los hostiles");
    lines.push("  local quedan = false");
    lines.push("  for _, n in ipairs(hostiles) do");
    lines.push("    if n:isValid() then quedan = true end");
    lines.push("  end");
    lines.push('  if not quedan then victory("Human Navy") end');
  } else if (meta.victory === "survive") {
    lines.push(`  -- Victoria: sobrevivir ${meta.surviveSeconds} segundos`);
    lines.push(`  if getScenarioTime() > ${meta.surviveSeconds} then victory("Human Navy") end`);
  } else {
    lines.push("  -- Lógica del escenario (editar a mano)");
  }
  lines.push("end");
  lines.push("");
  return lines.join("\n");
}
