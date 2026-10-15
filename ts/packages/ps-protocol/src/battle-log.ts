import { joinedParts, parseLine, PSLine } from "./line";

/** Parsed `HP STATUS` chunk: `144/262`, `100/100 slp`, `0 fnt`. */
export interface HPStatus {
  numerator: number;
  denominator?: number;
  /** e.g. `slp`, `par`, `brn` — null for healthy and for `fnt`. */
  status?: string;
  fainted: boolean;
}

export function parseHPStatus(text: string): HPStatus | null {
  const space = text.indexOf(" ");
  const hpPart = space >= 0 ? text.slice(0, space) : text;
  const status = space >= 0 ? text.slice(space + 1) : "";
  const comps = hpPart.split("/");
  const numerator = parseInt(comps[0] ?? "", 10);
  if (!Number.isFinite(numerator)) return null;
  const denominator = comps.length > 1 ? parseInt(comps[1] ?? "", 10) : NaN;
  return {
    numerator,
    denominator: Number.isFinite(denominator) ? denominator : undefined,
    status: status === "" || status === "fnt" ? undefined : status,
    fainted: numerator === 0 || status === "fnt",
  };
}

/** One Pokémon tracked by `BattleLog`, keyed by position (`p1a`…). */
export interface BattlePokemon {
  /** Full ident from the protocol, e.g. `p1a: Sparky`. */
  ident: string;
  details: string;
  hpNumerator?: number;
  hpDenominator?: number;
  status?: string;
  fainted: boolean;
  volatiles: Set<string>;
  boosts: Map<string, number>;
}

export function monName(ident: string): string {
  const colon = ident.indexOf(":");
  return colon < 0 ? ident : ident.slice(colon + 1).trim();
}

/** A rendered battle-log line (the UI layer maps these to text/styles). */
export type BattleEntry =
  | { kind: "spacer" }
  | { kind: "turn"; turn: number }
  | { kind: "start" }
  | { kind: "teamPreview" }
  | { kind: "message"; text: string }
  | { kind: "small"; text: string }
  | { kind: "move"; user: string; move: string }
  | { kind: "switchIn"; user: string; details: string }
  | { kind: "faint"; user: string }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string }
  | { kind: "win"; player: string }
  | { kind: "tie" }
  | { kind: "request"; json: string };

export interface PlayerInfo {
  name: string;
  avatar: string;
  rating?: number;
}

export function newPokemon(ident: string, details: string, hp: HPStatus | null): BattlePokemon {
  return {
    ident,
    details,
    hpNumerator: hp?.numerator,
    hpDenominator: hp?.denominator,
    status: hp?.status,
    fainted: hp?.fainted ?? false,
    volatiles: new Set(),
    boosts: new Map(),
  };
}

function applyHP(mon: BattlePokemon, hp: HPStatus): void {
  if (hp.numerator !== undefined) mon.hpNumerator = hp.numerator;
  if (hp.denominator !== undefined) mon.hpDenominator = hp.denominator;
  if (hp.status !== undefined || (mon.status !== undefined && hp.fainted)) {
    mon.status = hp.status;
  }
  if (hp.fainted) mon.fainted = true;
}

/** `p1a: Sparky` → `p1a`; `p1: Bob` → `p1`; no colon → whole string. */
export function positionID(ident: string): string {
  const colon = ident.indexOf(":");
  return colon < 0 ? ident : ident.slice(0, colon);
}

/**
 * Fixture-testable battle state machine. Replays protocol chunks and tracks
 * teams, HP/status/boosts, weather, field and side conditions, and the log.
 * Mirrors the Swift `BattleLog` — both run against fixtures/battles.
 */
export class BattleLog {
  players = new Map<string, PlayerInfo>();
  teamSizes = new Map<string, number>();
  gameType = "";
  gen = 9;
  tier = "";
  rules: string[] = [];
  turn = 0;
  weather?: string;
  fieldConditions: string[] = [];
  /** Side conditions per side, index 0 = p1, 1 = p2. */
  sideConditions: string[][] = [[], []];
  /** Pokémon by position (`p1a`, `p2b`, …). */
  activeByPosition = new Map<string, BattlePokemon>();
  /** Team-preview roster: [side, details, item-or-null] in arrival order. */
  previewPokemon: { side: string; details: string; item: string | null }[] = [];
  entries: BattleEntry[] = [];
  isStarted = false;
  isOver = false;
  winner?: string;
  teamPreview = false;

  apply(rawLine: string | PSLine): void {
    const line = typeof rawLine === "string" ? parseLine(rawLine) : rawLine;

    if (line.type === "" && line.parts.length === 0) {
      this.entries.push({ kind: "spacer" });
      return;
    }

    switch (line.type) {
      case "player": {
        const rating = line.parts[3] !== undefined ? parseInt(line.parts[3], 10) : NaN;
        this.players.set(line.parts[0] ?? "", {
          name: line.parts[1] ?? "",
          avatar: line.parts[2] ?? "",
          rating: Number.isFinite(rating) ? rating : undefined,
        });
        return;
      }
      case "teamsize": {
        const size = parseInt(line.parts[1] ?? "", 10);
        if (line.parts.length >= 2 && Number.isFinite(size)) {
          this.teamSizes.set(line.parts[0] ?? "", size);
        }
        return;
      }
      case "gametype":
        this.gameType = line.parts[0] ?? "";
        return;
      case "gen": {
        const gen = parseInt(line.parts[0] ?? "", 10);
        if (Number.isFinite(gen)) this.gen = gen;
        return;
      }
      case "tier":
        this.tier = joinedParts(line);
        return;
      case "rule":
        this.rules.push(joinedParts(line));
        return;
      case "clearpoke":
        this.previewPokemon = [];
        return;
      case "poke": {
        if (line.parts.length >= 2) {
          this.previewPokemon.push({
            side: positionID(line.parts[0] ?? ""),
            details: line.parts[1] ?? "",
            item: line.parts.length > 2 && line.parts[2] !== "" ? line.parts[2] : null,
          });
        }
        return;
      }
      case "teampreview":
        this.teamPreview = true;
        this.entries.push({ kind: "teamPreview" });
        return;
      case "start":
        this.isStarted = true;
        this.teamPreview = false;
        this.entries.push({ kind: "start" });
        return;
      case "turn": {
        const turn = parseInt(line.parts[0] ?? "", 10);
        if (Number.isFinite(turn)) this.turn = turn;
        this.entries.push({ kind: "turn", turn: this.turn });
        return;
      }
      case "request":
        this.entries.push({ kind: "request", json: joinedParts(line) });
        return;
      case "win":
        this.winner = line.parts[0];
        this.isOver = true;
        this.entries.push({ kind: "win", player: line.parts[0] ?? "" });
        return;
      case "tie":
        this.isOver = true;
        this.entries.push({ kind: "tie" });
        return;
      case "switch":
      case "drag": {
        if (line.parts.length >= 2) {
          const ident = line.parts[0] ?? "";
          this.activeByPosition.set(positionID(ident),
            newPokemon(ident, line.parts[1] ?? "",
              line.parts.length > 2 ? parseHPStatus(line.parts[2] ?? "") : null));
          this.entries.push({ kind: "switchIn", user: ident, details: line.parts[1] ?? "" });
        }
        return;
      }
      case "detailschange": {
        if (line.parts.length < 2) return;
        const mon = this.activeByPosition.get(positionID(line.parts[0] ?? ""));
        if (!mon) return;
        mon.details = line.parts[1] ?? "";
        if (line.parts.length > 2) {
          const hp = parseHPStatus(line.parts[2] ?? "");
          if (hp) applyHP(mon, hp);
        }
        return;
      }
      case "replace": {
        if (line.parts.length < 3) return;
        const mon = this.activeByPosition.get(positionID(line.parts[0] ?? ""));
        const hp = parseHPStatus(line.parts[2] ?? "");
        if (!mon || !hp) return;
        mon.ident = line.parts[0] ?? "";
        applyHP(mon, hp);
        return;
      }
      case "swap": {
        if (line.parts.length < 4) return;
        const posA = positionID(line.parts[0] ?? "");
        const posB = positionID(line.parts[2] ?? "");
        const first = this.activeByPosition.get(posA);
        const second = this.activeByPosition.get(posB);
        if (!first || !second) return;
        first.ident = `${posB}: ${monName(first.ident)}`;
        second.ident = `${posA}: ${monName(second.ident)}`;
        this.activeByPosition.set(posA, second);
        this.activeByPosition.set(posB, first);
        return;
      }
      case "faint": {
        const ident = line.parts[0];
        if (ident === undefined) return;
        const mon = this.activeByPosition.get(positionID(ident));
        if (mon) {
          mon.fainted = true;
          mon.hpNumerator = 0;
          mon.status = undefined;
        }
        this.entries.push({ kind: "faint", user: ident });
        return;
      }
      case "move":
        if (line.parts.length >= 3) {
          this.entries.push({ kind: "move", user: line.parts[0] ?? "", move: line.parts[2] ?? "" });
        }
        return;
      case "cant":
        if (line.parts.length >= 2) {
          this.entries.push({ kind: "small", text: `${line.parts[0]} couldn't move!` });
        }
        return;
      case "inactive":
      case "inactiveoff":
        this.entries.push({ kind: "info", text: joinedParts(line) });
        return;
      case "t:":
        return; // timestamp marker
      case "error":
        this.entries.push({ kind: "error", text: joinedParts(line) });
        return;
      default:
        if (line.type.startsWith("-")) this.applyMinor(line);
        else this.entries.push({ kind: "message", text: joinedParts(line) });
    }
  }

  /** Minor lines are `|-ACTION|POKEMON|ARG…` — the Pokémon is parts[0]. */
  private applyMinor(line: PSLine): void {
    const action = line.type.slice(1);
    const target = positionID(line.parts[0] ?? "");
    const mon = this.activeByPosition.get(target);

    switch (action) {
      case "damage":
      case "heal":
      case "sethp": {
        if (!mon || line.parts.length < 2) return;
        const hp = parseHPStatus(line.parts[1] ?? "");
        if (!hp) return;
        applyHP(mon, hp);
        this.entries.push({
          kind: "small",
          text: `${monName(mon.ident)} ${hp.numerator}/${hp.denominator ?? 0}`,
        });
        return;
      }
      case "status":
        if (mon && line.parts.length >= 2) mon.status = line.parts[1];
        return;
      case "curestatus":
        if (mon) mon.status = undefined;
        return;
      case "boost":
      case "unboost": {
        if (!mon || line.parts.length < 2) return;
        const stat = line.parts[1] ?? "";
        const amount = line.parts.length > 2 ? parseInt(line.parts[2] ?? "1", 10) || 1 : 1;
        const sign = action === "boost" ? 1 : -1;
        mon.boosts.set(stat, (mon.boosts.get(stat) ?? 0) + sign * amount);
        return;
      }
      case "setboost": {
        if (!mon || line.parts.length < 2) return;
        const value = parseInt(line.parts[1] ?? "", 10);
        if (!Number.isFinite(value)) return;
        mon.boosts.clear();
        mon.boosts.set("offset", value);
        return;
      }
      case "clearboost":
        mon?.boosts.clear();
        return;
      case "clearallboost":
        for (const m of this.activeByPosition.values()) m.boosts.clear();
        return;
      case "start":
        if (mon && line.parts.length >= 2) mon.volatiles.add(line.parts[1] ?? "");
        return;
      case "end":
        if (mon && line.parts.length >= 2) mon.volatiles.delete(line.parts[1] ?? "");
        return;
      case "weather":
        this.weather = line.parts[0] !== undefined && line.parts[0] !== "" ? line.parts[0] : undefined;
        return;
      case "fieldstart":
        if (line.parts[0] !== undefined && line.parts[0] !== "") this.fieldConditions.push(line.parts[0]);
        return;
      case "fieldend": {
        const idx = line.parts[0] !== undefined ? this.fieldConditions.indexOf(line.parts[0]) : -1;
        if (idx >= 0) this.fieldConditions.splice(idx, 1);
        return;
      }
      case "sidestart":
      case "sideend": {
        if (line.parts.length < 2 || line.parts[1] === undefined || line.parts[1] === "") return;
        const sideIndex = positionID(line.parts[0] ?? "").startsWith("p2") ? 1 : 0;
        if (action === "sidestart") this.sideConditions[sideIndex].push(line.parts[1]);
        else {
          const idx = this.sideConditions[sideIndex].indexOf(line.parts[1]);
          if (idx >= 0) this.sideConditions[sideIndex].splice(idx, 1);
        }
        return;
      }
      default:
        // Display-only actions (activate, fail, miss, mega, item, …).
        this.entries.push({ kind: "small", text: joinedParts(line) });
    }
  }
}
