# Pokémon Showdown client

A modern, fully featured Pokémon Showdown client with **two shells sharing one
protocol core**:

- **iOS** — native SwiftUI (deployed via LiveContainer / SideStore sideloading, no App Store)
- **Windows desktop** — Electron + React (runs locally, develops locally)

The protocol, networking, dex, and team layers exist twice — once in Swift
(`Packages/`) and once in TypeScript (`ts/packages/`) — and both test suites
run against the **same fixture files** in `fixtures/` so the two
implementations cannot drift apart.

```
├── project.yml              XcodeGen spec (generates PokemonShowdown.xcodeproj)
├── App/                     SwiftUI app + app-target tests
├── Packages/                Swift core: PSProtocol, PSNet, PSData, PSTeams
├── ts/                      pnpm workspace
│   ├── packages/            TS core: ps-protocol, ps-net, ps-data, ps-teams
│   └── apps/desktop/        Electron app (React renderer, connects directly)
├── fixtures/                Shared test data (battle transcripts, team pairs, dex sample)
├── Tools/dexextract/        Converts PS's data/*.js into JSON consumed by both stacks
├── docs/                    ARCHITECTURE.md, PROTOCOL-NOTES.md, DESIGN.md
└── .github/workflows/       CI (macOS + Linux), Windows + iOS release builds
```

## Building

### Desktop (Windows — you)

```sh
cd ts
corepack enable          # pnpm comes with Node 22
pnpm install
pnpm test                # vitest across the core packages
pnpm dev                 # Electron app with live reload (connects to sim3.psim.us)
pnpm build               # production bundle (electron-builder for installers)
```

### iOS (CI or a Mac)

There is no committed `.xcodeproj` — it is generated:

```sh
brew install xcodegen
xcodegen generate
xcodebuild -project PokemonShowdown.xcodeproj -scheme PokemonShowdown \
    -destination 'platform=iOS Simulator,name=iPhone 16' build
```

CI (`ci.yml`) does exactly this on `macos-14` runners for every push, and
`release-ios.yml` produces an unsigned `.ipa` for LiveContainer (which
re-signs it on-device with your SideStore certificate).

## Connecting

Default server: `wss://sim3.psim.us/showdown/websocket` (plain-text WebSocket
frames — no SockJS envelope; verified live, see `docs/PROTOCOL-NOTES.md`).
Any custom server host can be set in Settings on either shell.

## Milestones

- [x] **M1** — dual-track scaffold: both stacks build, fixture-driven core packages, CI green
- [ ] **M2** — login (`|challstr|` → `api/login` → `/trn`), lobby chat, PMs
- [ ] **M3** — teams: SwiftData storage, import/export/packed, team builder UI
- [ ] **M4** — laddering & challenges (`/search`, `/utm`, `|updatechallenges|`)
- [ ] **M5** — battle engine + move/switch/team-preview UI
- [ ] **M6** — replays
- [ ] **M7** — polish + first LiveContainer-ready IPA and Windows installer

## Legal note

Pokémon and Smogon assets and server data are non-commercial; this project is
for personal use only and is not affiliated with Nintendo, Game Freak, or
Smogon.
