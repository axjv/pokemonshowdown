# UI design spec (shared by both shells)

The iOS (SwiftUI) and desktop (React) shells render the same layout with the
same tokens so either feels like the same app. CSS custom properties on the
left; the SwiftUI equivalents are the values in parentheses.

## Colors

```css
:root {
  --bg: #181820;            /* app background (Color(red:0.094, green:0.094, blue:0.125)) */
  --surface: #20202a;       /* cards, sidebars */
  --surface-2: #2a2a36;     /* inputs, rows */
  --text: #eceaf2;
  --text-dim: #9c9aa8;
  --accent: #4f8cff;        /* primary buttons, selection */
  --danger: #e5534b;
  --success: #3fbf6f;

  /* PS rank colors — used identically for chat userlines both shells */
  --rank-admin: #e05944;    /* ~ host/admin */
  --rank-leader: #c4762f;   /* # */
  --rank-mod: #cc6633;      /* @ & */
  --rank-driver: #339900;   /* % */
  --rank-voice: #336699;    /* + */
  --rank-bot: #777777;      /* * */
}
```

Type badges use the standard Pokémon type palette (shared constant list in
each core package is out of scope; use a well-known public mapping, same in both).

## Typography

- Base UI text 15px/1.4 (Dynamic Type `body` on iOS).
- Battle log entries 15px; small-font minor actions 13px, `--text-dim`.
- Monospaced 13px for raw protocol/debug views.
- System font on both shells (`-apple-system` / SF; Segoe UI on Windows is
  acceptable — sizes and spacing matter more than the face).

## Layout (all shells)

- Five top-level destinations: **Ladder, Teams, Chat, Replays, Settings**
  (iOS: tab bar; desktop: left sidebar rail with the same icons/order).
- Battle screen: header (tier • turn • weather • field chips) → scrollable log
  → opponent/own team rows with HP bars → action dock (move buttons with PP,
  switch list, mega/terra/dyna buttons when `request` allows).
- Chat rows: rank-colored name, bold; commands (`/me`) italic dim.
- Team rows: nickname (species if different), item chip, moves, EV/Nature
  summary in dim 13px.

## Icons

SF Symbols on iOS; [Lucide](https://lucide.dev) on desktop (visually closest
free set). Fixed mapping:

| Destination | SF Symbol | Lucide |
|---|---|---|
| Ladder | `trophy` | `trophy` |
| Teams | `list.bullet.rectangle` | `list` |
| Chat | `bubble.left.and.bubble.right` | `messages-square` |
| Replays | `play.circle` | `play-circle` |
| Settings | `gearshape` | `settings` |

## Sprites & images

Always from PS's own CDN so both shells are pixel-identical:
`https://play.pokemonshowdown.com/sprites/…`

- Team/battle (own client): `/sprites/averages/` or `/sprites/showdown/`
  (settings: battle sprite style)
- Icons (dex, lists): `/sprites/itemicon/<id>.png`, `/sprites/pokemon/icons/`
- Avatars: `https://play.pokemonshowdown.com/~./avatar/<id>`
- Cached on disk in both shells (LRU, ~100 MB cap).
