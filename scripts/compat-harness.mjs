/**
 * Harness de compatibilidad: ejecuta los escenarios oficiales de Empty Epsilon
 * en un entorno Lua instrumentado que registra TODA la API que usan
 * (globales y métodos), y la compara con lo que Bridge Sim implementa.
 *
 * Uso: node scripts/compat-harness.mjs /ruta/a/EmptyEpsilon/scripts
 * Salida: docs/COMPAT_REPORT.md
 */
import fs from "node:fs";
import path from "node:path";
import { LuaFactory } from "wasmoon";

const EE_SCRIPTS = process.argv[2];
const START = Number(process.argv[3] ?? 0);
const END = Number(process.argv[4] ?? Infinity);
const STATE_FILE = "/tmp/harness-state.json";
if (!EE_SCRIPTS || !fs.existsSync(EE_SCRIPTS)) {
  console.error("Uso: node scripts/compat-harness.mjs /ruta/a/EmptyEpsilon/scripts");
  process.exit(1);
}

/** API que Bridge Sim implementa hoy (mantener al día con packages/lua-api). */
const IMPLEMENTED = {
  globals: new Set([
    "PlayerSpaceship", "getPlayerShip", "CpuShip", "SpaceStation", "Asteroid",
    "Nebula", "Mine", "victory", "globalMessage", "getScenarioTime", "init", "update",
  ]),
  methods: new Set([
    "setPosition", "getPosition", "setCallSign", "getCallSign", "setTemplate",
    "setFaction", "setHull", "getHull", "setRadius", "isValid", "destroy",
    "orderRoaming", "orderStandGround", "setScanned",
  ]),
};

const INSTRUMENT = `
__used_globals = {}
__used_methods = {}
local magic
local function record_method(k)
  __used_methods[k] = (__used_methods[k] or 0) + 1
end
local magic_mt
magic_mt = {
  __index = function(t, k)
    if type(k) == "string" then record_method(k) end
    return function(...) return magic end
  end,
  __call = function(...) return magic end,
  __add = function() return 1 end, __sub = function() return 1 end,
  __mul = function() return 1 end, __div = function() return 1 end,
  __mod = function() return 1 end, __pow = function() return 1 end,
  __unm = function() return 1 end, __idiv = function() return 1 end,
  __concat = function() return "" end,
  __tostring = function() return "magic" end,
  __len = function() return 0 end,
  __eq = function() return false end,
  __lt = function() return false end, __le = function() return false end,
}
magic = setmetatable({}, magic_mt)
print = function() end
-- límite de instrucciones por escenario para no colgarse con bucles pesados
debug.sethook(function() error("harness_limit") end, "", 4000000)
setmetatable(_G, {
  __index = function(t, k)
    if type(k) == "string" then
      __used_globals[k] = (__used_globals[k] or 0) + 1
    end
    return function(...) return magic end
  end,
})
-- utilidades que los escenarios esperan y conviene que sean reales
function require(name) return magic end
`;

const allFiles = fs.readdirSync(EE_SCRIPTS).filter((f) => /^scenario_.*\.lua$/.test(f)).sort();
const files = allFiles.slice(START, END);
console.log(`Tanda: ${START}-${Math.min(END, allFiles.length)} de ${allFiles.length}`);

const state = fs.existsSync(STATE_FILE) && START > 0
  ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))
  : { globals: {}, methods: {}, results: [] };
const globalsAgg = new Map(Object.entries(state.globals));
const methodsAgg = new Map(Object.entries(state.methods));
const results = state.results;
const factory = new LuaFactory();

for (const file of files) {
  const source = fs.readFileSync(path.join(EE_SCRIPTS, file), "utf8");
  const lua = await factory.createEngine();
  let phase = "carga";
  let error = null;
  try {
    await lua.doString(INSTRUMENT);
    await lua.doString(source);
    phase = "init";
    await lua.doString(`if type(init) == "function" then init() end`);
    phase = "update";
    await lua.doString(`if type(update) == "function" then for i=1,5 do update(0.1) end end`);
    phase = "ok";
  } catch (err) {
    error = String(err && err.message ? err.message : err).slice(0, 160);
  }
  try {
    const g = await lua.doString(`local out = {} for k, v in pairs(__used_globals) do out[#out+1] = k .. "\\t" .. v end return table.concat(out, "\\n")`);
    const m = await lua.doString(`local out = {} for k, v in pairs(__used_methods) do out[#out+1] = k .. "\\t" .. v end return table.concat(out, "\\n")`);
    for (const line of String(g || "").split("\n").filter(Boolean)) {
      const [k, v] = line.split("\t");
      globalsAgg.set(k, (globalsAgg.get(k) ?? 0) + Number(v));
    }
    for (const line of String(m || "").split("\n").filter(Boolean)) {
      const [k, v] = line.split("\t");
      methodsAgg.set(k, (methodsAgg.get(k) ?? 0) + Number(v));
    }
  } catch { /* sin datos */ }
  results.push({ file, phase, error });
  lua.global.close();
}

// Filtrar stdlib de Lua que no es API de EE
const LUA_STD = new Set(["math", "table", "string", "ipairs", "pairs", "tostring", "tonumber",
  "type", "print", "pcall", "xpcall", "error", "assert", "select", "unpack", "next", "os", "io",
  "setmetatable", "getmetatable", "rawset", "rawget", "require", "_G", "coroutine", "utf8", "load"]);

function coverageTable(agg, implemented, kind) {
  const rows = [...agg.entries()]
    .filter(([k]) => !LUA_STD.has(k))
    .sort((a, b) => b[1] - a[1]);
  const covered = rows.filter(([k]) => implemented.has(k));
  const missing = rows.filter(([k]) => !implemented.has(k));
  let md = `### ${kind}: ${covered.length}/${rows.length} cubiertos (${Math.round((covered.length / Math.max(1, rows.length)) * 100)}%)\n\n`;
  md += `**Faltantes por uso (top 40):**\n\n| Símbolo | Usos |\n|---|---|\n`;
  for (const [k, v] of missing.slice(0, 40)) md += `| \`${k}\` | ${v} |\n`;
  return { md, total: rows.length, covered: covered.length, missingList: missing };
}

const g = coverageTable(globalsAgg, IMPLEMENTED.globals, "Globales/constructores");
const m = coverageTable(methodsAgg, IMPLEMENTED.methods, "Métodos");

fs.writeFileSync(STATE_FILE, JSON.stringify({
  globals: Object.fromEntries(globalsAgg),
  methods: Object.fromEntries(methodsAgg),
  results,
}));
if (END < allFiles.length) {
  console.log(`Estado guardado (${results.length}/${allFiles.length}). Continúa con la siguiente tanda.`);
  process.exit(0);
}
const okCount = results.filter((r) => r.phase === "ok").length;
let md = `# Informe de compatibilidad Lua con Empty Epsilon\n\n`;
md += `Generado por \`scripts/compat-harness.mjs\` contra ${allFiles.length} escenarios oficiales de EE.\n\n`;
md += `- Escenarios que cargan e inician sin error (entorno instrumentado): **${okCount}/${allFiles.length}**\n`;
md += `- Cobertura de símbolos: globales **${g.covered}/${g.total}**, métodos **${m.covered}/${m.total}**\n\n`;
md += g.md + "\n" + m.md + "\n";
md += `### Escenarios con errores de ejecución en el harness\n\n| Escenario | Fase | Error |\n|---|---|---|\n`;
for (const r of results.filter((x) => x.error)) md += `| ${r.file} | ${r.phase} | ${r.error?.replace(/\|/g, "/")} |\n`;
md += `\n> Nota: el harness mide *demanda* de API (qué usan los escenarios). La lista de faltantes ordenada por uso es el burn-down de compatibilidad.\n`;

fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/COMPAT_REPORT.md", md);
console.log(`OK ${okCount}/${allFiles.length} · globales ${g.covered}/${g.total} · métodos ${m.covered}/${m.total}`);
console.log("Informe: docs/COMPAT_REPORT.md");
