import { useState } from "react";

export function Lobby({ onEnter }: { onEnter: (code: string, name: string) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createRoom() {
    if (!name.trim()) return setError("Pon tu nombre primero");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      const data = await res.json();
      onEnter(data.code, name.trim());
    } catch {
      setError("No se pudo crear la sala");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (!name.trim()) return setError("Pon tu nombre primero");
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return setError("El código tiene 6 caracteres");
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/rooms/${c}`);
      if (!res.ok) throw new Error();
      onEnter(c, name.trim());
    } catch {
      setError("Sala no encontrada");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: "1rem" }}>
        <label>Tu nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Apodo" />
      </div>
      <div className="row" style={{ marginBottom: "1rem" }}>
        <button onClick={createRoom} disabled={busy}>Crear sala</button>
        <span className="muted">o</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="CÓDIGO"
          style={{ fontFamily: "monospace", letterSpacing: "0.2em", width: "8.5rem" }}
        />
        <button onClick={joinRoom} disabled={busy}>Unirse</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
