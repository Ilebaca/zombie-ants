# Zombie Ants

Turn-based territory strategy. Two ant colonies fight for a grid; at the centre sleeps a
queen infected with *Ophiocordyceps*. Capture her for a growth surge — lose your own queen
and the match ends immediately.

**Read `CLAUDE.md` before changing anything.** It holds the game's hard rules and the bugs
already paid for once.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine + AI test suite
npm run typecheck  # strict TypeScript
```

## Layout

| Path | Purpose |
|---|---|
| `src/engine/` | Pure game rules. No DOM, no canvas, no randomness. |
| `src/ai/` | Lookahead search + evaluation. Consumes the engine only. |
| `src/render/` | Canvas board (next). Consumes engine events. |
| `src/ui/` | Meta screens (next). |
| `src/platform/` | Storage, Capacitor, purchases (next). |
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
