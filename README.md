# Bridge Sim

Simulador de puente de nave multijugador, 100% web, inspirado en
[Empty Epsilon](https://daid.github.io/EmptyEpsilon/).

6 jugadores por sala — Pilotaje, Armamento, Ingeniería, Ciencia,
Comunicaciones y Capitán — cooperando por voz contra escenarios scriptables.

📋 **[Especificación del MVP →](SPEC.md)**

## Jugar en local

Requisitos: [Node.js 22+](https://nodejs.org) y git.

```bash
git clone https://github.com/DavidSaladu/bridge-sim.git
cd bridge-sim
npm install

# Terminal 1: servidor de juego
npm run dev:server

# Terminal 2: cliente web
npm run dev:web
```

Abre **http://localhost:5173** — crea una sala y comparte el código.
Otras personas de tu red local pueden unirse usando tu IP
(`http://TU_IP:5173`) si arrancas el cliente con `npm run dev:web -- --host`.

**Voz (opcional):** copia `.env.example` a `.env` en la raíz con tus claves
de [LiveKit Cloud](https://cloud.livekit.io). Sin `.env`, todo funciona menos
el audio.

## Tests

```bash
npm test          # motor de simulación + servidor de salas
npm run typecheck
```

## Desplegar a Hostinger

```bash
DEPLOY_DOMAIN=tu-dominio HOSTINGER_API_TOKEN=... node scripts/deploy-hosting.mjs
```

## Licencia

GPL-2.0 — igual que Empty Epsilon, cuya API de scripting replicamos.

## Estado

🚧 Fase 1-2: salas + voz + Pilotaje + Armamento (rayos, misiles, escudos),
hostiles con IA que atacan, victoria/derrota. Ver historial de commits.
