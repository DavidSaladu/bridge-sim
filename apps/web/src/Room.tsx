import { useEffect, useRef, useState } from "react";
import type { ScenarioInfo } from "@bridge/shared";
import { ScenarioEditor } from "./ScenarioEditor.js";
import type { GameSnap, RoomSnapshot, ServerMsg, Station } from "@bridge/shared";
import { STATIONS, STATION_LABELS } from "@bridge/shared";
import { useVoice } from "./useVoice.js";
import { StationView, type CommsChannel, type HackState } from "./StationView.js";
import type { TimedEvent } from "./Radar.js";

interface ChatLine { fromName: string; text: string; ts: number }

export function Room({ code, name, onLeave }: { code: string; name: string; onLeave: () => void }) {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [selfId, setSelfId] = useState("");
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [snap, setSnap] = useState<GameSnap | null>(null);
  const [events, setEvents] = useState<TimedEvent[]>([]);
  const [banner, setBanner] = useState<{ victory: boolean; message: string } | null>(null);
  const [channel, setChannel] = useState<CommsChannel | null>(null);
  const [hack, setHack] = useState<HackState | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [customName, setCustomName] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  function refreshScenarios() {
    fetch("/api/scenarios").then((r) => r.json()).then(setScenarios).catch(() => {});
  }

  useEffect(refreshScenarios, []);
  const [activeStation, setActiveStation] = useState<Station | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting">("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const [resumeKey, setResumeKey] = useState<string | null>(sessionStorage.getItem(`resume:${code}`));
  const resumeKeyRef = useRef<string | null>(resumeKey);
  const closedByUser = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closedByUser.current = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const params = new URLSearchParams({ name });
      if (resumeKeyRef.current) params.set("resume", resumeKeyRef.current);
      const ws = new WebSocket(`${proto}://${location.host}/ws/rooms/${code}?${params}`);
      wsRef.current = ws;

      ws.onopen = () => setStatus("connected");
      ws.onmessage = (ev) => {
        const msg: ServerMsg = JSON.parse(ev.data);
        switch (msg.t) {
          case "welcome":
            setSelfId(msg.selfId);
            resumeKeyRef.current = msg.resumeKey;
            setResumeKey(msg.resumeKey);
            sessionStorage.setItem(`resume:${code}`, msg.resumeKey);
            setRoom(msg.room);
            setError("");
            break;
          case "room":
            setRoom(msg.room);
            break;
          case "chat":
            setChat((c) => [...c.slice(-200), { fromName: msg.fromName, text: msg.text, ts: msg.ts }]);
            break;
          case "snap": {
            setSnap(msg.snap);
            if (msg.snap.events.length > 0) {
              const now = performance.now();
              setEvents((old) => [
                ...old.filter((e) => now - e.at < 1000),
                ...msg.snap.events.map((ev) => ({ ev, at: now })),
              ]);
            }
            break;
          }
          case "gameOver":
            setBanner({ victory: msg.victory, message: msg.message });
            setSnap(null);
            setEvents([]);
            setChannel(null);
            break;
          case "commsChannel":
            setChannel(msg.channel);
            break;
          case "hack":
            setHack(msg.state);
            break;
          case "error":
            if (msg.code === "not_found" || msg.code === "join_failed") {
              // Error fatal: la sala no existe o no podemos entrar. No reintentar.
              closedByUser.current = true;
              sessionStorage.removeItem(`resume:${code}`);
              onLeave();
              return;
            }
            setError(msg.message);
            break;
        }
      };
      ws.onclose = () => {
        // Solo reconectar si este socket sigue siendo el vigente: evita que
        // dos montajes (StrictMode) se maten y resuciten mutuamente en bucle.
        if (closedByUser.current || wsRef.current !== ws) return;
        setStatus("reconnecting");
        retryTimer = setTimeout(connect, 1500);
      };
    }

    connect();
    return () => {
      closedByUser.current = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [code, name]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [chat]);

  const me = room?.players.find((p) => p.id === selfId);
  const voice = useVoice(code, selfId, resumeKey);
  const playing = room?.phase === "playing";
  const myStations = me?.stations ?? [];
  const shownStation = activeStation && myStations.includes(activeStation)
    ? activeStation
    : myStations[0] ?? null;

  useEffect(() => {
    if (!playing) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      const idx = Number(e.key) - 1;
      const mine = me?.stations ?? [];
      if (idx >= 0 && idx < mine.length) setActiveStation(mine[idx] ?? null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, me]);

  function send(msg: object) {
    if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify(msg));
  }

  function toggleStation(station: Station) {
    if (me?.stations.includes(station)) send({ t: "leaveStation", station });
    else send({ t: "takeStation", station });
    setError("");
  }

  function sendChat() {
    if (!draft.trim()) return;
    send({ t: "chat", text: draft });
    setDraft("");
  }

  function leave() {
    closedByUser.current = true;
    sessionStorage.removeItem(`resume:${code}`);
    wsRef.current?.close();
    onLeave();
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
        <span className="code-badge">{code}</span>
        <span className="muted">
          {status === "reconnecting" ? "⟳ Reconectando…" : `${room?.players.filter((p) => p.connected).length ?? 0}/6 a bordo`}
        </span>
        <span className="row">
          <span className="muted">
            {voice.status === "on" ? "🎙 Voz activa" : voice.status === "connecting" ? "🎙 Conectando voz…" : voice.status === "error" ? "🎙 Voz no disponible" : "🎙 Voz apagada"}
          </span>
          {voice.status === "on" && (
            <button onClick={voice.toggleMute}>{voice.muted ? "Activar micro" : "Silenciar"}</button>
          )}
          <button onClick={leave}>Salir</button>
        </span>
      </div>

      {playing && (
        <div style={{ marginBottom: "1rem" }}>
          {myStations.length > 1 && (
            <div className="row" style={{ marginBottom: "0.5rem" }}>
              {myStations.map((st, i) => (
                <button
                  key={st}
                  onClick={() => setActiveStation(st)}
                  style={{
                    padding: "0.3rem 0.8rem",
                    fontSize: "0.85rem",
                    background: st === shownStation ? "var(--accent)" : "var(--accent-dim)",
                    color: st === shownStation ? "#082f49" : undefined,
                  }}
                >
                  {i + 1}. {STATION_LABELS[st]}
                </button>
              ))}
              <span className="muted">teclas 1-{myStations.length} para cambiar</span>
            </div>
          )}
          <StationView station={shownStation} snap={snap} send={send} events={events} channel={channel} hack={hack} />
        </div>
      )}

      {banner && !playing && (
        <div
          className="panel"
          style={{
            marginBottom: "1rem",
            borderColor: banner.victory ? "#4ade80" : "#f87171",
            textAlign: "center",
            fontSize: "1.1rem",
          }}
        >
          {banner.victory ? "🏆 " : "💥 "}{banner.message}
        </div>
      )}

      {!playing && me?.isHost && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="row">
            <button onClick={() => { setBanner(null); send({ t: "startGame" }); }} style={{ fontSize: "1.1rem" }}>
              ▶ Iniciar partida
            </button>
            <label className="muted">Escenario:</label>
            <select
              value={room?.scenario.id ?? "default"}
              onChange={(e) => send({ t: "selectScenario", id: e.target.value })}
              style={{ background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "0.4rem" }}
            >
              <option value="default">Clásico (incorporado)</option>
              {scenarios.map((sc) => (
                <option key={sc.id} value={sc.id}>{sc.name}</option>
              ))}
              {customName && <option value="custom">{customName} (propio)</option>}
            </select>
            <button onClick={() => setEditorOpen(true)} style={{ fontSize: "0.85rem" }}>
              🛠 Editor
            </button>
            <label style={{ cursor: "pointer", border: "1px dashed var(--accent-dim)", borderRadius: 4, padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
              📂 Subir .lua
              <input
                type="file"
                accept=".lua"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const source = await file.text();
                  setCustomName(file.name.replace(/\.lua$/, ""));
                  send({ t: "uploadScenario", name: file.name, source });
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {room?.scenario.id !== "default" && (
            <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
              {scenarios.find((sc) => sc.id === room?.scenario.id)?.description ?? "Escenario scriptado en Lua."}
            </p>
          )}
        </div>
      )}

      {!playing && !me?.isHost && room && (
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Escenario: <b style={{ color: "var(--accent)" }}>{room.scenario.name}</b> — esperando al host…
        </p>
      )}

      {editorOpen && (
        <ScenarioEditor
          scenarios={scenarios}
          onPublished={refreshScenarios}
          onClose={() => setEditorOpen(false)}
          onUse={(name, source) => {
            setCustomName(name);
            send({ t: "uploadScenario", name, source });
            setEditorOpen(false);
          }}
        />
      )}

      <div className="stations" style={playing ? { gridTemplateColumns: "repeat(6, 1fr)", gap: "0.4rem" } : undefined}>
        {STATIONS.map((s) => {
          const holder = room?.players.find((p) => p.stations.includes(s));
          const mine = holder?.id === selfId;
          const speaking = holder ? voice.speakingIds.has(holder.id) : false;
          return (
            <div
              key={s}
              className={`station${holder ? " taken" : ""}${mine ? " mine" : ""}${speaking ? " speaking" : ""}`}
              onClick={() => (!holder || mine) && toggleStation(s)}
              style={playing ? { padding: "0.4rem 0.6rem" } : undefined}
            >
              <h3 style={playing ? { fontSize: "0.75rem", marginBottom: "0.1rem" } : undefined}>{STATION_LABELS[s]}</h3>
              <p style={playing ? { fontSize: "0.7rem" } : undefined}>{speaking ? "🔊 " : ""}{holder ? holder.name + (holder.connected ? "" : " ⚠") : "Libre"}</p>
            </div>
          );
        })}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="panel chat">
        <div className="chat-log" ref={logRef}>
          {chat.map((l, i) => (
            <div key={i}><b>{l.fromName}:</b> {l.text}</div>
          ))}
        </div>
        <div className="row">
          <input
            style={{ flex: 1 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChat()}
            placeholder="Mensaje al puente…"
            maxLength={500}
          />
          <button onClick={sendChat}>Enviar</button>
        </div>
      </div>
    </div>
  );
}
