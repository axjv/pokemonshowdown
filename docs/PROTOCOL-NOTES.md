# Protocol notes (verified)

Authoritative upstream references (fetched from `smogon/pokemon-showdown` @ master):

- `PROTOCOL.md` — chat/global protocol
- `sim/SIM-PROTOCOL.md` — battle protocol
- `sim/TEAMS.md` — export / JSON / packed team formats

All of the framing below was additionally **verified against the live server**
(`wss://sim3.psim.us/showdown/websocket`) before being implemented.

## Transport

- Raw WebSocket, **plain-text frames both directions**. The SockJS envelope
  (`o` / `h` / `a[...]` / JSON-array sends) is *not* required by PS's own
  WebSocket endpoint — the official client's raw-WebSocket fallback and our
  live probe both use plain text.
- On connect the server immediately sends `|updateuser| ...`, `|formats| ...`
  and `|challstr| ...` frames (as ordinary text frames).
- Heartbeats: server is happy with a `|/cmd ping` global message every ~25s;
  we do not rely on `h` frames since we're not speaking SockJS.

## Client → server

One WebSocket text frame per message:

```
ROOMID|TEXT
```

- `ROOMID` may be empty for global commands: `|/join lobby`.
- Room-scoped: `battle-gen9ou-123|/choose 1`.
- `TEXT` may contain newlines (each line treated as sent separately).

Encoding helper: `Wire.encodeClientMessage(text, roomID:)` → `"\(roomID ?? "")|\(text)"`.

## Server → client

```
>ROOMID
MESSAGE
MESSAGE
```

- The `>ROOMID\n` header line may be omitted — that means the frame targets
  lobby/global. A `MESSAGE` can never start with `>`, so parsing is
  unambiguous. (Lobby/global frames arrive without the header in practice.)
- Payload is newline-separated; **empty lines are ignored**; a frame whose
  payload is empty is ignored entirely.
- Each non-empty line is either `|TYPE|DATA...` (pipe-split) or a raw
  display line (e.g. plain text announcements). Chat/battle payloads can
  contain `|`, so re-join trailing chunks rather than assuming column counts.

## Login (`|challstr|`)

1. Server sends `|challstr|CHALLSTR` (CHALLSTR itself contains `|`).
2. Already-authenticated (cookie) clients: `GET https://play.pokemonshowdown.com/api/upkeep?challstr=CHALLSTR`.
3. Otherwise: `POST https://play.pokemonshowdown.com/api/login` with form body
   `name=USERNAME&pass=PASSWORD&challstr=CHALLSTR`.
4. Both responses begin with `]` followed by a JSON object. Read
   `data.assertion`.
5. Finish by sending `/trn USERNAME,0,ASSERTION` (the 0 is the avatar id —
   0 = don't change).

A native client has no login-server cookies, so it re-runs (2→3) per
connection with the stored password. The assertion is tied to that
connection's challstr, so nothing long-lived comes out of it.

## Challenges & laddering

- Challenge: `/utm PACKED_TEAM` then `/challenge USERNAME, FORMAT`
  (`TEAM` is `null` for random formats).
- Accept: `/utm PACKED_TEAM` then `/accept USERNAME`; reject: `/reject USERNAME`;
  cancel: `/cancelchallenge USERNAME`.
- Ladder: `/utm TEAM` then `/search FORMAT`; `/cancelsearch`.
- State arrives via `|updatechallenges|JSON` / `|updatesearch|JSON`; invalid
  teams surface as `|popup|`.

## Teams (TEAMS.md)

Three formats: export (human), JSON (`PokemonSet[]`), packed (wire).
Packed sets are joined by `]`:

```
NICK|SPECIES|ITEM|ABILITY|MOVES|NATURE|EVS|GENDER|IVS|SHINY|LEVEL|HAPPINESS,POKEBALL,HPTYPE,GIGANTAMAX,DYNAMAXLEVEL,TERATYPE
```

- SPECIES blank when equal to NICK; ITEM/ABILITY/MOVES/SPECIES are toID strings
  (ability may also be a literal string); MOVES comma-separated IDs.
- EVS: 6 comma-separated stats (HP, Atk, Def, SpA, SpD, Spe), blank = 0;
  entirely blank if all zero. IVS: same, blank = 31.
- SHINY `S`, LEVEL blank = 100, HAPPINESS blank = 255, GIGANTAMAX `G`,
  DYNAMAXLEVEL blank = 10.
- The trailing `HAPPINESS,...` group drops its commas when every member is blank.

## Battle protocol essentials (SIM-PROTOCOL.md)

- Pokémon id: `POSITION: NAME` (`p1a: Sparky`); `DETAILS` = `Species, L50, F, shiny[, tera:TYPE]`.
- Major: `|player|`, `|teamsize|`, `|gametype|`, `|gen|`, `|tier|`, `|rule|`,
  `|clearpoke|`, `|poke|`, `|teampreview|`, `|start|`, `|turn|`, `|request|`,
  `|move|`, `|switch|`, `|drag|`, `|detailschange|`, `|replace|`, `|swap|`,
  `|cant|`, `|faint|`, `|win|`, `|tie|`, bare `|` = spacer.
- Minor (`-` prefix): `-damage` / `-heal` (`HP STATUS` = `144/262` or `100/100 slp`,
  `0 fnt`), `-sethp`, `-status` / `-curestatus`, `-boost` / `-unboost` /
  `-setboost` / `-clearboost` / `-clearallboost` / `-invertboost`,
  `-weather`, `-fieldstart` / `-fieldend`, `-sidestart` / `-sideend`,
  `-start` / `-end` (volatiles), `-ability` / `-item` / `-enditem`,
  `-mega` / `-primal` / `-terastallize`, plus message-only ones
  (`-activate`, `-fail`, `-block`, `-miss`, `-immune`, `-supereffective`,
  `-crit`, `-resisted`, ...).
- `|inactive|` / `|inactiveoff|` are timer chatter; `|t:` timestamps; `|upkeep|`
  turn-phase marker.
- Decisions go back via `/choose`, `/switch`, `/move`, `/teampreview` in the
  battle room (details in SIM-PROTOCOL "Sending decisions", used in M5).
