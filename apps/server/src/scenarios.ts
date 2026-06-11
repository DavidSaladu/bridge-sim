import fs from "node:fs";
import path from "node:path";

export interface Scenario {
  id: string;
  name: string;
  description: string;
  source: string;
}

function findScenariosDir(): string | null {
  for (const dir of [
    path.resolve(process.cwd(), "scenarios"),
    path.resolve(process.cwd(), "../../scenarios"),
  ]) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function parseMeta(source: string, fallbackName: string): { name: string; description: string } {
  const name = source.match(/^--\s*Name:\s*(.+)$/m)?.[1]?.trim() ?? fallbackName;
  const description = source.match(/^--\s*Description:\s*(.+)$/m)?.[1]?.trim() ?? "";
  return { name, description };
}

function userScenariosDir(): string {
  const dir = path.resolve(process.cwd(), "data", "scenarios");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readDir(dir: string, idPrefix: string): Scenario[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".lua"))
    .sort()
    .map((f) => {
      const source = fs.readFileSync(path.join(dir, f), "utf8");
      const id = idPrefix + f.replace(/\.lua$/, "");
      return { id, source, ...parseMeta(source, id) };
    });
}

export function loadScenarioLibrary(): Scenario[] {
  const builtin = findScenariosDir();
  return [...(builtin ? readDir(builtin, "") : []), ...readDir(userScenariosDir(), "user-")];
}

/** Guarda un escenario de usuario en disco y devuelve su entrada de biblioteca. */
export function saveUserScenario(name: string, source: string): Scenario {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "escenario";
  let file = slug;
  const dir = userScenariosDir();
  let n = 2;
  while (fs.existsSync(path.join(dir, file + ".lua"))) {
    file = `${slug}-${n++}`;
  }
  // Asegurar metadatos de nombre
  let final = source;
  if (!/^--\s*Name:/m.test(source)) final = `-- Name: ${name}\n` + source;
  fs.writeFileSync(path.join(dir, file + ".lua"), final);
  return { id: "user-" + file, source: final, ...parseMeta(final, name) };
}

export const MAX_SCENARIO_SIZE = 100 * 1024;
