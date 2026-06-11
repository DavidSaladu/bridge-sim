import { useEffect, useRef, useState } from "react";
import type { RoomSnapshot, ServerMsg, Station } from "@bridge/shared";
import { STATIONS, STATION_LABELS } from "@bridge/shared";

interface ChatLine { fromName: string; text: string; ts: number }

export function Room({ code, name, onLeave }: { code: string; name: string; onLeave: () => void }) {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [selfId, setSelfId] = useState("");
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/rooms/${code}?name=${encodeURIComponent(name)}`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg: ServerMsg = JSON.parse(ev.data);
      switch (msg.t) {
        case "welcome":
          setSelfId(msg.selfId);
          setRoom(msg.room);
          break;
        case "room":
          setRoom(msg.room);
          break;
        case "chat":
          setChat((c) => [...c.slice(-200), { fromName: msg.fromName, text: msg.text, ts: msg.ts }]);
          break;
        case "error":
          setError(msg.message);
          break;
      }
    };
    ws.onclose = () => setError("Desconectado del servidor");
    return () => ws.close();
  }, [code, name]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [chat]);

  const me = room?.players.find((p) => p.id === selfId);

  function send(msg: object) {
    wsRef.current?.send(JSON.stringify(msg));
  }

  function toggleStation(station: Station) {
    if (me?.station === station) send({ t: "leaveStation" });
    else send({ t: "takeStation", station });
    setError("");
  }

  function sendChat() {
    if (!draft.trim()) return;
    send({ t: "chat", text: draft });
    setDraft("");
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
        <span className="code-badge">{code}</span>
        <span className="muted">{room?.players.filter((p) => p.connected).length ?? 0}/6 a bordo</span>
        <button onClick={onLeave}>Salir</button>
      </div>

      <div className="stations">
        {STATIONS.map((s) => {
          const holder = room?.players.find((p) => p.station === s);
          const mine = holder?.id === selfId;
          return (
            <div
              key={s}
              className={`station${holder ? " taken" : ""}${mine ? " mine" : ""}`}
              onClick={() => (!holder || mine) && toggleStation(s)}
            >
              <h3>{STATION_LABELS[s]}</h3>
              <p>{holder ? holder.name + (holder.connected ? "" : " (desconectado)") : "Libre"}</p>
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
