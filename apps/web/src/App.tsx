import { useState } from "react";
import { Lobby } from "./Lobby.js";
import { Room } from "./Room.js";

export function App() {
  const [session, setSession] = useState<{ code: string; name: string } | null>(null);

  return (
    <>
      <h1>Bridge Sim</h1>
      {session ? (
        <Room code={session.code} name={session.name} onLeave={() => setSession(null)} />
      ) : (
        <Lobby onEnter={(code, name) => setSession({ code, name })} />
      )}
    </>
  );
}
