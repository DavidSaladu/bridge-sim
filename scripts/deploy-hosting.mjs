/**
 * Despliega Bridge Sim en un website de Hostinger (apps JS sobre hosting compartido).
 * Requiere: HOSTINGER_API_TOKEN y DEPLOY_DOMAIN en el entorno.
 * Uso: node scripts/deploy-hosting.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DOMAIN = process.env.DEPLOY_DOMAIN;
const TOKEN = process.env.HOSTINGER_API_TOKEN;
if (!DOMAIN || !TOKEN) {
  console.error("Faltan DEPLOY_DOMAIN o HOSTINGER_API_TOKEN");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "deploy", "bundle");
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

console.log("1/4 Build del cliente web…");
run("npm run build -w @bridge/web");

console.log("2/4 Bundle del servidor (esbuild, Node 20, CJS)…");
run(
  `npx esbuild apps/server/src/main.ts --bundle --platform=node --target=node20 --format=cjs --outfile=${out}/server.js`,
);

console.log("3/4 Empaquetando…");
fs.cpSync(path.join(root, "apps/web/dist"), path.join(out, "public"), { recursive: true });
const lk = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]
  .filter((k) => process.env[k])
  .map((k) => `${k}=${process.env[k]}`)
  .join("\n");
if (lk) fs.writeFileSync(path.join(out, ".env"), lk + "\n");
fs.writeFileSync(
  path.join(out, "package.json"),
  JSON.stringify({ name: "bridge-sim", version: "0.1.0", main: "server.js", scripts: { start: "node server.js" } }, null, 2),
);
run("zip -qr ../bundle.zip .", out);

console.log("4/4 Desplegando vía MCP de Hostinger…");
process.env.HOSTINGER_API_TOKEN = TOKEN;
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "hostinger-api-mcp", "--stdio"],
  env: process.env,
  stderr: "ignore",
});
const client = new Client({ name: "deploy", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);
const res = await client.callTool({
  name: "hosting_deployJsApplication",
  arguments: { domain: DOMAIN, archivePath: path.join(root, "deploy", "bundle.zip") },
});
console.log(res.content?.[0]?.text?.slice(0, 600));
await client.close();
console.log(`\nHecho. Comprueba https://${DOMAIN}/api/health`);
