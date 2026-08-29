# Zombie Ants

Turn-based territory strategy. Two ant colonies fight for a grid; at the centre sleeps a
queen infected with *Ophiocordyceps*. Capture her for a growth surge — lose your own queen
and the match ends immediately.

**Read `CLAUDE.md` before changing anything.** It holds the game's hard rules and the bugs
already paid for once.

## The one rule

Dependencies run one way — `ui → render → ai → engine` — and the engine imports nothing at
all. That is what lets the AI search thousands of futures without touching the screen, and
why animation work can never break a game rule. `eslint.config.js` enforces it: an import
across a layer fails the build rather than being caught in review. The engine may not call
`Math.random` either — scatter draws from the seeded generator on `GameState`, so the same
seed replays the same match.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + lint + tests — what CI gates the deploy on
```

| Script | What it does |
|---|---|
| `npm test` | Vitest: engine, AI, renderer and screens |
| `npm run typecheck` | Strict TypeScript over `src`, `tools` and the config |
| `npm run lint` | ESLint — including the layering rules below |
| `npm run build` | Typecheck, then a production bundle into `dist/` |
| `npm run ladder` | Plays the three AI levels against each other |

## Layout

| Path | Purpose |
|---|---|
| `src/engine/` | Pure game rules. No DOM, no canvas, no randomness. |
| `src/ai/` | Lookahead search + evaluation. Consumes the engine only. |
| `src/render/` | Canvas board. Consumes engine EVENTS and draws them. |
| `src/ui/` | Screens: the shell, the match, and every meta screen. |
| `src/platform/` | Storage, progression, matchmaking, purchases. Never reached from the engine. |
| `tools/` | AI measurement scripts — the ladder, arenas, weight sweeps. |
| `docs/GDD.html` | Design document — accurate to shipped rules. |
| `legacy/` | The original single-file build. Still playable; behavioural reference. |

## Architecture rule

The engine returns `EngineEvent[]` describing what happened. It never animates. That is
what lets the AI simulate thousands of futures safely, and lets animation work proceed
without any risk to game rules.

## Status

- Engine ported with 51 passing tests
- AI lookahead ported (easy 1-ply / normal 2-ply / hard 3-ply)
- Renderer, meta UI, Capacitor wrap and IAP still to come
