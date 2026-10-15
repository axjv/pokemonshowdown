# Architecture

## The two-shell / one-spec model

The client exists as two shells over mirrored core layers:

```
            iOS (SwiftUI)                      Windows (Electron + React)
        ┌──────────────────┐                ┌──────────────────────┐
        │  App/            │                │ ts/apps/desktop/     │
        │  SwiftData, Keychain              │ safeStorage, userData│
        └────────┬─────────┘                └──────────┬───────────┘
     Swift core  │                       TS core       │
   Packages/     ▼                       ts/packages/  ▼
   PSProtocol ←→ ps-protocol   (framing, room events, battle engine)
   PSNet      ←→ ps-net        (WebSocket client, login client)
   PSData     ←→ ps-data       (dex model, type effectiveness)
   PSTeams    ←→ ps-teams      (export/import/packed teams)
                    both ← fixtures/ (shared, single source of truth)
                    both ← Tools/dexextract output
```

The Swift and TypeScript cores are separate implementations of the same
published specs (`docs/PROTOCOL-NOTES.md`, which distills upstream
PROTOCOL.md / SIM-PROTOCOL.md / TEAMS.md). **Anti-drift mechanism:** every
behavioral test in both languages consumes the same files in `fixtures/`:

- `fixtures/teams/*` — export-text ↔ packed-string ↔ PokemonSet-JSON triples
  (canonicalized from upstream TEAMS.md examples)
- `fixtures/battles/*.battle.txt` — real battle chunk transcripts replayed
  through the engine; expected state asserted in both suites
- `fixtures/dex/*` — dex JSON fixtures
- `fixtures/replays/*.frames.txt` — real WebSocket frames captured from
  replay logs; feed the frame codec (server→client direction)

## iOS stack

- iOS 17, SwiftUI, **MV pattern** (`@Observable` classes, no ViewModels-per-view).
- `project.yml` (XcodeGen) — the `.xcodeproj` is generated and never committed.
- **SwiftData** for teams (`SavedTeam` holds name/format/JSON `PokemonSet[]`).
- **Keychain** (`kSecClassGenericPassword`, `kSecAttrAccessibleAfterFirstUnlock`)
  for the login password with a file-based fallback; bundle id
  `dev.avien.pokemonshowdown`.
- LiveContainer guest constraints honored: no app extensions, no custom
  entitlements, no background modes, standard `NSURLSessionWebSocketTask`
  reconnect-on-foreground.

### Packages

| Package | Contents |
|---|---|
| `PSProtocol` | `toID`, `Wire` frame codec, `PSLine`, `Rank`/`RoomUser`/`ChatMessage`, `RoomEvent`/`RoomEventParser`, `BattleLog` engine, `BattleRequest` JSON models |
| `PSTeams` | `PokemonSet`/`StatsValue` models, `TeamCodec` (export↔import↔packed↔JSON) |
| `PSNet` | `ServerConfig` (codable; default `sim3.psim.us:443/showdown/websocket`, login server `play.pokemonshowdown.com`), `LoginServer` (challstr → api/login → assertion → `/trn`), `PSClient` actor (websocket, framing, auto-reconnect w/ backoff, `/cmd ping` keepalive, outbox) |
| `PSData` | `Dex` (species/moves/abilities/items/typechart) + type effectiveness math; bundled dex JSON under `Sources/PSData/Resources/dex` |

Dependency graph (identical in both languages): `PSProtocol` is depended on
by `PSNet`, `PSData`, and `PSTeams`; the app shells depend on all four.

Swift tests locate the shared fixtures with `fixturesDirectory URL` relative to
`#filePath`; no fixture helper package is needed.

## TS stack

pnpm workspace, TypeScript strict, **vitest**. Same layer names:

| Package | Mirrors |
|---|---|
| `ps-protocol` | PSProtocol |
| `ps-net` | PSNet (uses the browser/Node `WebSocket` global directly in the renderer) |
| `ps-data` | PSData (dex JSON injected, not file-loaded) |
| `ps-teams` | PSTeams |

The desktop app keeps all protocol state in the renderer process (the
connection is a plain `WebSocket`; nothing needs Node APIs). Electron's main
process only handles window management, `safeStorage` (DPAPI) for the
password, and userData.

## Data flow (login, M2)

```
connect → server sends |challstr|S
        → POST loginServer/api/login (name, pass, challstr=S)
        ← "]{"assertion":"A",...}"
        → global: /trn NAME,0,A
        ← |updateuser|... (named=1)
```

## Dex data

`Tools/dexextract/` fetches `play.pokemonshowdown.com/data/*.js`, evaluates
them in a sandbox, extracts the subsets both apps need, and writes JSON to
`Packages/PSData/Resources/dex/` (shared; the TS side reads the same files
from disk). A committed **subset** (all 20 types, all natures, moves/pokemon
touched by the fixtures) keeps the repo light; `dex-refresh.yml` regenerates
and uploads the full dataset, which the apps can fetch at runtime into cache
(settings: "refresh dex").

## Testing policy

- No test ever touches the network. Live-server behavior was captured once
  into fixtures.
- Swift: `swift test` per package on macOS runners; `xcodebuild test` runs
  the app-target tests.
- TS: `pnpm test` on Linux runners (fast).
- Fixture updates are pull-able from replay.pokemonshowdown.com by
  `pnpm run pull-fixtures` (later milestone nicety).
