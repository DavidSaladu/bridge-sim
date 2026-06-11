import { Suspense, lazy, useRef, useState } from "react";
import type { ScenarioInfo } from "@bridge/shared";
import luaparse from "luaparse";
import { ScenarioDesigner } from "./designer/ScenarioDesigner.js";
import { generateLua, newObject, type DesignMeta, type DesignObject } from "./designer/model.js";

const Monaco = lazy(() => import("@monaco-editor/react"));

const TEMPLATE = `-- Name: Mi misión
-- Description: Describe aquí tu escenario.

function init()
  -- La nave del jugador ya existe; puedes recolocarla:
  getPlayerShip(-1):setPosition(0, 0)

  SpaceStation():setCallSign("DS-1"):setPosition(-2000, -1500)

  CpuShip():setTemplate("Phobos T3"):setFaction("Kraylor")
    :setCallSign("KR-1"):setPosition(6000, 2000)

  globalMessage("¡Misión iniciada!")
end

function update(delta)
  -- Se llama 5 veces por segundo. Declara la victoria cuando toque:
  -- victory("Human Navy")
end
`;

const CHEATSHEET: [string, string][] = [
  ["init() / update(delta)", "ciclo de vida del escenario"],
  ["CpuShip() SpaceStation() Asteroid() Nebula() Mine()", "crear entidades"],
  [":setPosition(x,y) :setCallSign(s) :setTemplate(t) :setFaction(f)", "encadenables"],
  [":setRadius(r)", "nebulosas"],
  [":isValid() :destroy() :setScanned(true) :getHull() :setHull(h)", "estado"],
  ["getPlayerShip(-1)", "la nave del puente"],
  ['victory("Human Navy")', "fin de partida (Kraylor = derrota)"],
  ["globalMessage(texto)", "aviso a todo el puente"],
  ["getScenarioTime()", "segundos de partida"],
  ["Plantillas: Phobos T3, Adder MK5, Flavia Falcon", "naves IA"],
  ["Facciones: Kraylor (hostil), Independent, Human Navy", ""],
];

interface Props {
  scenarios: ScenarioInfo[];
  onUse: (name: string, source: string) => void;
  onClose: () => void;
  onPublished?: () => void;
}

function validate(source: string): { ok: true } | { ok: false; line: number; message: string } {
  try {
    luaparse.parse(source, { luaVersion: "5.3" });
    return { ok: true };
  } catch (err) {
    const e = err as { line?: number; message?: string };
    return { ok: false, line: e.line ?? 1, message: e.message ?? "Error de sintaxis" };
  }
}

export function ScenarioEditor({ scenarios, onUse, onClose, onPublished }: Props) {
  const [name, setName] = useState("Mi misión");
  const [source, setSource] = useState(TEMPLATE);
  const [status, setStatus] = useState<ReturnType<typeof validate>>({ ok: true });
  const [publishState, setPublishState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [tab, setTab] = useState<"visual" | "code">("visual");
  const [objects, setObjects] = useState<DesignObject[]>(() => [newObject("playerStart", 0, 0)]);
  const [meta, setMeta] = useState<DesignMeta>({ description: "", victory: "hostiles", surviveSeconds: 300 });
  const [codeTouched, setCodeTouched] = useState(false);

  function applyDesign(): string {
    const lua = generateLua(name, meta, objects);
    setSource(lua);
    setStatus(validate(lua));
    setCodeTouched(false);
    return lua;
  }

  function currentSource(): string {
    // En la pestaña visual, el diseño manda salvo que el código se haya tocado a mano después
    return tab === "visual" && !codeTouched ? applyDesign() : source;
  }

  async function publish() {
    setPublishState("saving");
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, source: currentSource() }),
      });
      if (!res.ok) throw new Error();
      setPublishState("done");
      onPublished?.();
      setTimeout(() => setPublishState("idle"), 2500);
    } catch {
      setPublishState("error");
      setTimeout(() => setPublishState("idle"), 2500);
    }
  }
  const monacoRef = useRef<{ editor: unknown; monaco: unknown } | null>(null);

  function handleChange(value: string | undefined) {
    const src = value ?? "";
    setSource(src);
    setCodeTouched(true);
    const res = validate(src);
    setStatus(res);
    const ref = monacoRef.current as {
      editor: { getModel: () => unknown };
      monaco: { editor: { setModelMarkers: (m: unknown, o: string, markers: unknown[]) => void }; MarkerSeverity: { Error: number } };
    } | null;
    if (ref) {
      const model = ref.editor.getModel();
      ref.monaco.editor.setModelMarkers(
        model, "lua",
        res.ok ? [] : [{
          severity: ref.monaco.MarkerSeverity.Error,
          message: res.message,
          startLineNumber: res.line, startColumn: 1, endLineNumber: res.line, endColumn: 120,
        }],
      );
    }
  }

  async function loadLibrary(id: string) {
    if (!id) return;
    const res = await fetch(`/api/scenarios/${id}/source`);
    if (!res.ok) return;
    const data = await res.json();
    setName(data.name + " (mod)");
    setSource(data.source);
    setStatus(validate(data.source));
  }

  function download() {
    const blob = new Blob([currentSource()], { type: "text/x-lua" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/\s+/g, "-").toLowerCase() + ".lua";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, background: "rgba(3,6,12,0.92)",
      display: "flex", flexDirection: "column", padding: "1rem",
    }}>
      <div className="row" style={{ marginBottom: "0.6rem" }}>
        <h2 style={{ margin: 0, color: "var(--accent)", fontWeight: 300, letterSpacing: "0.1em" }}>EDITOR DE ESCENARIOS</h2>
        <div className="row" style={{ gap: 0 }}>
          <button
            style={{ borderRadius: "4px 0 0 4px", background: tab === "visual" ? "var(--accent)" : undefined, color: tab === "visual" ? "#082f49" : undefined }}
            onClick={() => setTab("visual")}
          >
            🗺 Visual
          </button>
          <button
            style={{ borderRadius: "0 4px 4px 0", background: tab === "code" ? "var(--accent)" : undefined, color: tab === "code" ? "#082f49" : undefined }}
            onClick={() => { if (tab === "visual" && !codeTouched) applyDesign(); setTab("code"); }}
          >
            {"{ } Lua"}
          </button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 220 }} placeholder="Nombre" />
        <select
          defaultValue=""
          onChange={(e) => { void loadLibrary(e.target.value); e.target.value = ""; }}
          style={{ background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "0.4rem" }}
        >
          <option value="" disabled>Cargar de la biblioteca…</option>
          {scenarios.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: "0.85rem", color: status.ok ? "#4ade80" : "#f87171" }}>
          {status.ok ? "✓ Sintaxis correcta" : `✗ Línea ${status.line}: ${status.message.replace(/^\[\d+:\d+\]\s*/, "")}`}
        </span>
        <button onClick={download}>⬇ Descargar</button>
        <button disabled={!status.ok || publishState === "saving"} onClick={() => void publish()}>
          {publishState === "done" ? "✓ Publicado" : publishState === "error" ? "✗ Error" : publishState === "saving" ? "…" : "📚 Publicar en biblioteca"}
        </button>
        <button
          disabled={!status.ok}
          style={{ background: status.ok ? "var(--accent)" : undefined, color: status.ok ? "#082f49" : undefined }}
          onClick={() => onUse(name, currentSource())}
        >
          ✔ Usar en esta sala
        </button>
        <button onClick={onClose}>✕ Cerrar</button>
      </div>
      {tab === "visual" ? (
        <ScenarioDesigner objects={objects} setObjects={setObjects} meta={meta} setMeta={setMeta} />
      ) : (
      <div style={{ flex: 1, display: "flex", gap: "0.75rem", minHeight: 0 }}>
        <div style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          <Suspense fallback={<p className="muted" style={{ padding: "1rem" }}>Cargando editor…</p>}>
            <Monaco
              height="100%"
              defaultLanguage="lua"
              theme="vs-dark"
              value={source}
              onChange={handleChange}
              onMount={(editor, monaco) => { monacoRef.current = { editor, monaco }; handleChange(editor.getValue()); }}
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
            />
          </Suspense>
        </div>
        <div className="panel" style={{ width: 320, overflowY: "auto", fontSize: "0.8rem" }}>
          <h4 style={{ marginTop: 0, color: "var(--accent)" }}>Chuleta de la API</h4>
          {CHEATSHEET.map(([code, desc], i) => (
            <div key={i} style={{ marginBottom: "0.5rem" }}>
              <code style={{ color: "#7dd3fc", display: "block", whiteSpace: "pre-wrap" }}>{code}</code>
              {desc && <span className="muted">{desc}</span>}
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
