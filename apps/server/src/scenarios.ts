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

export function loadScenarioLibrary(): Scenario[] {
  const dir = findScenariosDir();
  if (!dir) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".lua"))
    .sort()
    .map((f) => {
      const source = fs.readFileSync(path.join(dir, f), "utf8");
      const id = f.replace(/\.lua$/, "");
      return { id, source, ...parseMeta(source, id) };
    });
}

export const MAX_SCENARIO_SIZE = 100 * 1024;
